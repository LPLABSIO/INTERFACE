const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { listConnectedUdids, saveDevices } = require('./src/deviceManager');
const { log } = require('./src/utils');

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

const CONFIG_PATH = path.join(__dirname, 'config', 'data.json');
const STATE_PATH = path.join(__dirname, 'config', 'state.json');
const SERVERS_PATH = path.join(__dirname, 'config', 'appium_servers.json');
const envHostCache = {};
const envBasepathCache = {};

function ensureState(target) {
  let state;
  try { state = readJSON(STATE_PATH); } catch { state = null; }
  if (!state) {
    state = { devices: {}, progress: { created: 0, target }, lastRun: new Date().toISOString() };
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  }
  return state;
}

function startAppiumForDevice(udid, basePort, baseWdaPort, basepath) {
  const port = basePort + Math.floor(Math.random() * 1000); // éviter collisions simples
  const wdaPort = baseWdaPort + Math.floor(Math.random() * 1000);
  const args = [
    '-p', String(port),
    '--base-path', basepath,
    '--log-level', 'error',
    '--allow-insecure', 'chromedriver_autodownload'
  ];
  const proc = spawn('appium', args, { stdio: 'inherit' });
  return { proc, port, wdaPort };
}

async function main() {
  const cfg = readJSON(CONFIG_PATH);
  const udids = listConnectedUdids();
  saveDevices(udids);
  const state = ensureState(cfg.totalAccounts);

  if (udids.length === 0) {
    console.error('Aucun appareil connecté.');
    process.exit(1);
  }

  const perDevice = cfg.accountsPerDevice || Math.ceil(cfg.totalAccounts / udids.length);
  log(`Devices: ${udids.length}, target total: ${cfg.totalAccounts}, per-device: ${perDevice}`);

  // Lecture des serveurs Appium fournis par l'UI (optionnel)
  let servers = [];
  try { servers = readJSON(SERVERS_PATH).servers || []; } catch {}
  const usedServerIndexes = new Set();

  const runners = udids.map((udid, index) => {
    let port;
    let proc = null;
    if (cfg.startAppium) {
      const started = startAppiumForDevice(udid, cfg.baseAppiumPort, cfg.baseWdaPort, cfg.basepath);
      port = started.port;
      proc = started.proc;
      envHostCache[udid] = cfg.appiumHost || '127.0.0.1';
      envBasepathCache[udid] = cfg.basepath;
    } else {
      // Utiliser serveur fourni par l'UI: matcher UDID sinon prendre le prochain non utilisé
      let matchIndex = servers.findIndex(s => s.udid && s.udid === udid);
      if (matchIndex === -1) {
        matchIndex = servers.findIndex((s, idx) => !usedServerIndexes.has(idx));
      }
      const match = matchIndex >= 0 ? servers[matchIndex] : null;
      if (match) usedServerIndexes.add(matchIndex);
      const host = (match && match.host) || cfg.appiumHost || '127.0.0.1';
      const mappedPort = (match && match.port) || cfg.baseAppiumPort;
      const basepath = (match && match.basepath) || cfg.basepath;
      envHostCache[udid] = host;
      envBasepathCache[udid] = basepath;
      port = mappedPort;
    }
    const deviceTag = `dev-${index+1}`;
    state.devices[udid] = state.devices[udid] || { created: 0, target: perDevice, deviceTag };
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

    function runOnce() {
      const args = ['bot.js', 'iphonex', cfg.app];
      const env = { ...process.env };
      env.APPIUM_HOST = envHostCache[udid] || cfg.appiumHost || '127.0.0.1';
      env.APPIUM_PORT = String(port);
      env.APPIUM_BASEPATH = envBasepathCache[udid] || cfg.basepath;
      const child = spawn('node', args, { stdio: 'inherit', env });
      child.on('exit', (code) => {
        if (code === 0) {
          state.devices[udid].created += 1;
          state.progress.created += 1;
          fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
          if (state.devices[udid].created < state.devices[udid].target && state.progress.created < cfg.totalAccounts) {
            runOnce();
          } else {
            log(`${deviceTag} done`);
          }
        } else {
          log(`${deviceTag} run failed with code ${code}, retrying...`);
          setTimeout(runOnce, 5000);
        }
      });
    }

    runOnce();
    return { udid, proc, port };
  });

  function shutdown() {
    for (const r of runners) {
      try { if (r.proc) r.proc.kill('SIGINT'); } catch {}
    }
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => { console.error(e); process.exit(1); });

