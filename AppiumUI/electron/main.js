'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const axios = require('axios');
const net = require('net');

let mainWindow = null;
let replayChild = null;
let appiumChild = null;
let appiumServerUrl = null;
let currentSessionId = null;
let scriptChild = null;
let serversJsonPath = null;
let lastAppiumPort = null;
let lastWdaPort = null;
let iproxyChild = null; // deprecated: on ne lance plus iproxy manuellement

function ensureServersJsonPath() {
  if (serversJsonPath) return serversJsonPath;
  // HINGE root = one level up from AppiumUI root
  const projectRoot = path.resolve(__dirname, '..');
  const hingeRoot = path.resolve(projectRoot, '..');
  serversJsonPath = path.join(hingeRoot, 'config', 'appium_servers.json');
  try { fs.mkdirSync(path.dirname(serversJsonPath), { recursive: true }); } catch (_) {}
  return serversJsonPath;
}

function readDataJson() {
  try {
    const projectRoot = path.resolve(__dirname, '..');
    const hingeRoot = path.resolve(projectRoot, '..');
    const p = path.join(hingeRoot, 'config', 'data.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

function readServers() {
  try {
    const p = ensureServersJsonPath();
    const raw = fs.readFileSync(p, 'utf8');
    const json = JSON.parse(raw);
    return Array.isArray(json?.servers) ? json : { servers: [] };
  } catch (_) {
    return { servers: [] };
  }
}

function writeServers(servers) {
  const p = ensureServersJsonPath();
  const payload = { servers };
  fs.writeFileSync(p, JSON.stringify(payload, null, 2));
}

function upsertServerMapping({ host = '127.0.0.1', port, basepath = '/wd/hub', udid = null, wdaPort = 8100 }) {
  try {
    const data = readServers();
    const others = (data.servers || []).filter((s) => !(String(s.port) === String(port) && (!udid || s.udid === udid)));
    const entry = { host, port, basepath, udid, wdaPort };
    writeServers([...others, entry]);
    mainWindow?.webContents.send('appium:output', `[ui] appium_servers.json mis à jour (upsert ${host}:${port}${basepath}${udid ? ' for '+udid : ''}).`);
  } catch (e) {
    mainWindow?.webContents.send('appium:output', `[ui] Échec mise à jour appium_servers.json: ${e?.message || e}`);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Replay Appium - UI',
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

function startReplay({ logPath, server, respectDelays, dryRun }) {
  if (replayChild) {
    mainWindow?.webContents.send('replay:output', '[ui] Un processus est déjà en cours.');
    return;
  }

  const projectRoot = path.resolve(__dirname, '..');
  const scriptPath = path.join(projectRoot, 'replay_appium_from_logs.js');
  const nodeBin = process.env.npm_node_execpath || 'node';

  const args = [scriptPath];
  if (logPath) args.push('--log', logPath);
  if (server) args.push('--server', server);
  if (respectDelays) args.push('--respect-delays');
  if (dryRun) args.push('--dry-run');
  // New passthrough flags
  if (typeof arguments[0]?.skipSession !== 'undefined' && arguments[0].skipSession) args.push('--skip-session');
  if (typeof arguments[0]?.useLatestSession !== 'undefined' && arguments[0].useLatestSession) args.push('--use-latest-session');
  if (arguments[0]?.sessionId) {
    args.push('--session', String(arguments[0].sessionId));
  }

  replayChild = spawn(nodeBin, args, { cwd: projectRoot });

  replayChild.stdout.on('data', (data) => {
    mainWindow?.webContents.send('replay:output', data.toString());
  });
  replayChild.stderr.on('data', (data) => {
    mainWindow?.webContents.send('replay:output', data.toString());
  });
  replayChild.on('close', (code) => {
    mainWindow?.webContents.send('replay:exit', code);
    replayChild = null;
  });
}

function stopReplay() {
  if (!replayChild) return;
  try {
    replayChild.kill('SIGINT');
  } catch (_) {}
}

ipcMain.handle('replay:start', (_evt, payload) => {
  startReplay(payload || {});
});

ipcMain.handle('replay:stop', () => {
  stopReplay();
});

function listIosDevices() {
  // Strategy 1: idevice_id -l + ideviceinfo -u <udid> -k DeviceName
  try {
    const res = spawnSync('idevice_id', ['-l'], { encoding: 'utf8' });
    if (res && res.status === 0 && res.stdout) {
      const udids = res.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (udids.length > 0) {
        const devices = [];
        for (const udid of udids) {
          let name = 'iPhone';
          let model = null;
          let ios = null;
          try {
            const info = spawnSync('ideviceinfo', ['-u', udid, '-k', 'DeviceName'], { encoding: 'utf8' });
            if (info && info.status === 0 && info.stdout) {
              const n = info.stdout.trim();
              if (n) name = n;
            }
            const modelInfo = spawnSync('ideviceinfo', ['-u', udid, '-k', 'ProductType'], { encoding: 'utf8' });
            if (modelInfo && modelInfo.status === 0 && modelInfo.stdout) {
              const m = modelInfo.stdout.trim();
              if (m) model = m;
            }
            const iosInfo = spawnSync('ideviceinfo', ['-u', udid, '-k', 'ProductVersion'], { encoding: 'utf8' });
            if (iosInfo && iosInfo.status === 0 && iosInfo.stdout) {
              const v = iosInfo.stdout.trim();
              if (v) ios = v;
            }
          } catch (_) {}
          devices.push({ type: 'ios', name, udid, model, ios });
        }
        return devices;
      }
    }
  } catch (_) {}
  // Strategy 2: system_profiler SPUSBDataType and look for 'iPhone'
  try {
    const res2 = spawnSync('system_profiler', ['SPUSBDataType', '-json'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const out = res2 && res2.stdout ? res2.stdout : '';
    try {
      const json = JSON.parse(out);
      const list = [];
      function walk(node) {
        if (!node) return;
        if (Array.isArray(node)) {
          for (const n of node) walk(n);
          return;
        }
        const name = node && node._name;
        if (name && /iPhone/i.test(String(name))) {
          list.push({ type: 'ios', name: String(name), udid: null });
        }
        if (node._items) walk(node._items);
      }
      walk(json && json.SPUSBDataType);
      if (list.length > 0) return list;
    } catch (_) {
      const found = /iPhone/i.test(out);
      if (found) return [{ type: 'ios', name: 'iPhone', udid: null }];
    }
  } catch (_) {}
  return [];
}

ipcMain.handle('devices:refresh', () => {
  const devices = listIosDevices();
  return { devices };
});

function waitForAppiumReady() {
  return new Promise((resolve) => {
    let resolved = false;
    const onData = (buf) => {
      const text = buf.toString();
      mainWindow?.webContents.send('appium:output', text);
      const m = text.match(/Appium REST http interface listener started on http:\/\/0\.0\.0\.0:(\d+)(\/[^\s]*)?/);
      if (!resolved && m) {
        const port = m[1];
        const base = m[2] || '/wd/hub';
        appiumServerUrl = `http://127.0.0.1:${port}${base}`;
        resolved = true;
        mainWindow?.webContents.send('appium:ready', appiumServerUrl);
        appiumChild?.stdout?.off('data', onData);
        appiumChild?.stderr?.off('data', onData);
        resolve(appiumServerUrl);
      }
    };
    appiumChild?.stdout?.on('data', onData);
    appiumChild?.stderr?.on('data', onData);
  });
}

function extractCreateSessionPayloadFromLogs(logPath) {
  try {
    const fs = require('fs');
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const idx = line.indexOf('--> POST /wd/hub/session ');
      if (idx !== -1) {
        const jsonMatch = line.slice(idx).match(/\{[\s\S]*$/);
        if (jsonMatch) {
          try {
            return JSON.parse(jsonMatch[0]);
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
  return null;
}

async function createSessionToLaunchWDA({ serverUrl, udid }) {
  // Crée une session minimale sans lire de fichier log
  const cfg = readDataJson() || {};
  const wdaLocalPort = Number(cfg.baseWdaPort || 8205);
  const payload = {
    capabilities: {
      alwaysMatch: {
        platformName: 'iOS',
        'appium:automationName': 'XCUITest',
        'appium:udid': udid,
        'appium:newCommandTimeout': 1000,
        'appium:noReset': true,
        'appium:wdaLocalPort': wdaLocalPort,
      },
      firstMatch: [{}],
    },
  };

  const http = axios.create({ baseURL: serverUrl, timeout: 300000 });
  mainWindow?.webContents.send('appium:output', `[ui] Création de session sur ${serverUrl}...`);
  const res = await http.post('/session', payload);
  currentSessionId = res.data?.value?.sessionId || res.data?.sessionId || res.data?.value?.session_id;
  mainWindow?.webContents.send('appium:output', `[ui] Session créée: ${currentSessionId}`);
}

async function findFreePort(startPort, maxTries = 20) {
  function isFree(p) {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => { server.close(() => resolve(true)); });
      server.listen(p, '127.0.0.1');
    });
  }
  let p = startPort;
  for (let i = 0; i < maxTries; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await isFree(p);
    if (ok) return p;
    p += 1;
  }
  return startPort;
}

async function startAppiumAndWDA({ port = 1265, basePath = '/wd/hub', udid } = {}) {
  const cfg = readDataJson() || {};
  const desiredPort = Number(port || cfg.baseAppiumPort || 1265);
  const freePort = await findFreePort(desiredPort);
  if (freePort !== desiredPort) {
    try { mainWindow?.webContents.send('appium:output', `[ui] Port ${desiredPort} occupé. Utilisation du port libre ${freePort}.`); } catch (_) {}
  }
  if (appiumChild) {
    mainWindow?.webContents.send('appium:output', '[ui] Appium déjà lancé. Mise à jour du mapping serveur...');
    const cfg2 = readDataJson() || {};
    const wdaLocalPort = Number(cfg2.baseWdaPort || 8100);
    const basepath = (appiumServerUrl && appiumServerUrl.replace(/^https?:\/\/[^/]+/, '')) || '/wd/hub';
    const portInUse = lastAppiumPort || desiredPort;
    upsertServerMapping({ host: '127.0.0.1', port: portInUse, basepath, udid, wdaPort: wdaLocalPort });
    return;
  }
  const args = ['-p', String(freePort), '--base-path', basePath, '--log-timestamp', '--log-level', 'debug'];
  appiumChild = spawn('appium', args, { detached: true });
  appiumChild.stdout.on('data', (d) => mainWindow?.webContents.send('appium:output', d.toString()));
  appiumChild.stderr.on('data', (d) => mainWindow?.webContents.send('appium:output', d.toString()));
  appiumChild.on('close', (code) => {
    mainWindow?.webContents.send('appium:exit', code);
    appiumChild = null;
    appiumServerUrl = null;
    currentSessionId = null;
    // Retirer l'entrée du serveur arrêté
    try {
      const data = readServers();
      const filtered = data.servers.filter(s => String(s.port) !== String(freePort));
      writeServers(filtered);
      mainWindow?.webContents.send('appium:output', `[ui] appium_servers.json mis à jour (remove port ${freePort}).`);
    } catch (_) {}
  });

  // Ajouter/mettre à jour l'entrée serveur immédiatement
  try {
    const wdaLocalPort = Number(cfg.baseWdaPort || 8100);
    upsertServerMapping({ host: '127.0.0.1', port: freePort, basepath: basePath, udid: udid || null, wdaPort: wdaLocalPort });
    lastAppiumPort = freePort;
    lastWdaPort = wdaLocalPort;
  } catch (e) {
    mainWindow?.webContents.send('appium:output', `[ui] Impossible d'écrire appium_servers.json: ${e?.message || e}`);
  }

  waitForAppiumReady().then(async (serverUrl) => {
    try {
      const devices = listIosDevices();
      const first = devices.find(d => d.udid) || devices[0];
      const targetUdid = udid || (first ? first.udid : null);
      if (!first) {
        mainWindow?.webContents.send('appium:output', '[ui] Aucun iPhone détecté.');
        return;
      }
      await createSessionToLaunchWDA({ serverUrl, udid: targetUdid });
    } catch (e) {
      mainWindow?.webContents.send('appium:output', `[ui] Erreur session/WDA: ${e?.message || e}`);
    }
  });
}

function stopAppium() {
  const killByPort = (port) => {
    if (!port) return;
    try {
      const p = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' });
      const pids = (p.stdout || '').split(/\s+/).map(s => s.trim()).filter(Boolean);
      for (const pid of pids) {
        try { process.kill(Number(pid), 'SIGTERM'); } catch (_) {}
      }
      setTimeout(() => {
        for (const pid of pids) {
          try { process.kill(Number(pid), 'SIGKILL'); } catch (_) {}
        }
      }, 1500);
    } catch (_) {}
  };

  if (appiumChild) {
    try { process.kill(-appiumChild.pid, 'SIGTERM'); } catch (_) { try { appiumChild.kill('SIGTERM'); } catch (_) {} }
    setTimeout(() => {
      try { process.kill(-appiumChild.pid, 'SIGKILL'); } catch (_) { try { appiumChild.kill('SIGKILL'); } catch (_) {} }
    }, 1500);
  }

  // Nettoyage des ports Appium et WDA
  killByPort(lastAppiumPort);
  killByPort(lastWdaPort);

  // Aucun iproxy manuel à arrêter

  // Nettoyer l'entrée servers.json même si close ne s'est pas déclenché
  try {
    const data = readServers();
    const filtered = data.servers.filter(s => String(s.port) !== String(lastAppiumPort));
    writeServers(filtered);
  } catch (_) {}
}

ipcMain.handle('appium:start', async (_evt, payload) => {
  await startAppiumAndWDA(payload || {});
});

ipcMain.handle('appium:stop', () => {
  stopAppium();
});

// ----- Scenario (build/run/read) -----
function buildScenario({ logPath = 'logs_accsmatic', outPath = 'scenario.json' } = {}) {
  const projectRoot = path.resolve(__dirname, '..');
  const script = path.join(projectRoot, 'tools', 'build_scenario_from_logs.js');
  const nodeBin = process.env.npm_node_execpath || 'node';
  const args = [script, '--log', logPath, '--out', outPath];
  const child = spawn(nodeBin, args, { cwd: projectRoot });
  child.stdout.on('data', (d) => mainWindow?.webContents.send('scenario:output', d.toString()));
  child.stderr.on('data', (d) => mainWindow?.webContents.send('scenario:output', d.toString()));
  child.on('close', (code) => {
    mainWindow?.webContents.send('scenario:exit', code);
    if (code === 0) {
      try {
        const abs = path.join(projectRoot, outPath);
        const json = JSON.parse(require('fs').readFileSync(abs, 'utf8'));
        mainWindow?.webContents.send('scenario:ready', { path: abs, scenario: json });
      } catch (e) {
        mainWindow?.webContents.send('scenario:output', `[ui] Erreur lecture scénario: ${e.message}`);
      }
    }
  });
}

function runScenario({ scenario = 'scenario.json', server, respectDelays, dryRun } = {}) {
  const projectRoot = path.resolve(__dirname, '..');
  const script = path.join(projectRoot, 'tools', 'run_scenario.js');
  const nodeBin = process.env.npm_node_execpath || 'node';
  const args = [script, '--scenario', scenario];
  if (server) args.push('--server', server);
  if (respectDelays) args.push('--respect-delays');
  if (dryRun) args.push('--dry-run');
  const child = spawn(nodeBin, args, { cwd: projectRoot });
  child.stdout.on('data', (d) => mainWindow?.webContents.send('replay:output', d.toString()));
  child.stderr.on('data', (d) => mainWindow?.webContents.send('replay:output', d.toString()));
  child.on('close', (code) => mainWindow?.webContents.send('replay:exit', code));
}

ipcMain.handle('scenario:build', (_e, payload) => buildScenario(payload || {}));
ipcMain.handle('scenario:run', (_e, payload) => runScenario(payload || {}));
ipcMain.handle('scenario:read', (_e, filePath) => {
  try {
    const fs = require('fs');
    const abs = path.isAbsolute(filePath) ? filePath : path.join(path.resolve(__dirname, '..'), filePath);
    const json = JSON.parse(fs.readFileSync(abs, 'utf8'));
    return { path: abs, scenario: json };
  } catch (e) {
    return { error: e.message };
  }
});

// ----- Script runner (bot.js) -----
function startScript(payload = {}) {
  if (scriptChild) {
    mainWindow?.webContents.send('script:output', '[ui] bot.js déjà en cours.');
    return;
  }
  const projectRoot = path.resolve(__dirname, '..');
  const nodeBin = process.env.npm_node_execpath || 'node';
  const scriptPath = payload.scriptPath || path.join(projectRoot, 'bot.js');
  if (!fs.existsSync(scriptPath)) {
    mainWindow?.webContents.send('script:output', `[ui] bot.js introuvable à ${scriptPath}`);
    return;
  }
  // Arguments par défaut requis par bot.js: <device> <app>
  const argsLine = (payload.args || '').trim();
  const extraArgs = argsLine.length ? argsLine.split(/\s+/) : ['iphone14', 'tinderjailed'];
  mainWindow?.webContents.send('script:output', `[ui] Démarrage: ${nodeBin} ${scriptPath} ${extraArgs.join(' ')}`);
  scriptChild = spawn(nodeBin, [scriptPath, ...extraArgs], { cwd: projectRoot });
  scriptChild.stdout.on('data', (d) => mainWindow?.webContents.send('script:output', d.toString()));
  scriptChild.stderr.on('data', (d) => mainWindow?.webContents.send('script:output', d.toString()));
  scriptChild.on('error', (err) => {
    mainWindow?.webContents.send('script:output', `[ui] Erreur lancement bot.js: ${err?.message || err}`);
  });
  scriptChild.on('close', (code) => {
    mainWindow?.webContents.send('script:exit', code);
    scriptChild = null;
  });
}

ipcMain.handle('script:start', (_e, payload) => startScript(payload));

function stopScript() {
  if (!scriptChild) {
    mainWindow?.webContents.send('script:output', '[ui] Aucun bot.js en cours.');
    return;
  }
  try {
    scriptChild.kill('SIGINT');
  } catch (_) {}
}

ipcMain.handle('script:stop', () => stopScript());
// ----- Multi-runner (npm run multi) -----
let multiChild = null;
function startMulti(payload = {}) {
  if (multiChild) {
    mainWindow?.webContents.send('multi:output', '[ui] multi.js déjà en cours.');
    return;
  }
  const hingeRoot = path.resolve(__dirname, '..', '..', 'HINGE');
  const nodeBin = process.env.npm_node_execpath || 'node';
  const scriptPath = path.join(hingeRoot, 'multi.js');
  if (!fs.existsSync(scriptPath)) {
    mainWindow?.webContents.send('multi:output', `[ui] multi.js introuvable à ${scriptPath}`);
    return;
  }
  const args = [scriptPath];
  mainWindow?.webContents.send('multi:output', `[ui] Démarrage: ${nodeBin} ${scriptPath}`);
  multiChild = spawn(nodeBin, args, { cwd: hingeRoot });
  multiChild.stdout.on('data', (d) => mainWindow?.webContents.send('multi:output', d.toString()));
  multiChild.stderr.on('data', (d) => mainWindow?.webContents.send('multi:output', d.toString()));
  multiChild.on('error', (err) => {
    mainWindow?.webContents.send('multi:output', `[ui] Erreur lancement multi.js: ${err?.message || err}`);
  });
  multiChild.on('close', (code) => {
    mainWindow?.webContents.send('multi:exit', code);
    multiChild = null;
  });
}

function stopMulti() {
  if (!multiChild) {
    mainWindow?.webContents.send('multi:output', '[ui] Aucun multi.js en cours.');
    return;
  }
  try { multiChild.kill('SIGINT'); } catch (_) {}
}

ipcMain.handle('multi:start', (_e, payload) => startMulti(payload));
ipcMain.handle('multi:stop', () => stopMulti());

// ----- Per-device bot runner -----
const perDeviceChildren = new Map(); // udid -> child
ipcMain.handle('deviceRun:list', () => {
  const devices = listIosDevices();
  return { devices };
});

ipcMain.handle('deviceRun:start', (_e, payload = {}) => {
  const { udid, deviceName, deviceLabel, deviceArgs } = payload;
  if (!udid) return { error: 'UDID manquant' };
  if (perDeviceChildren.has(udid)) {
    mainWindow?.webContents.send('deviceRun:output', { udid, line: '[ui] bot déjà en cours pour cet appareil.' });
    return { ok: true };
  }
  const hingeRoot = path.resolve(__dirname, '..', '..', 'HINGE');
  const nodeBin = process.env.npm_node_execpath || 'node';
  const scriptPath = path.join(hingeRoot, 'bot.js');
  const args = [scriptPath, 'iphonex', 'hinge'];
  // Lire appium_servers.json pour trouver host/port/basepath du device
  let env = { ...process.env };
  try {
    const servers = readServers().servers || [];
    const found = servers.find(s => s.udid === udid) || servers[0];
    if (found) {
      env.APPIUM_HOST = found.host || '127.0.0.1';
      env.APPIUM_PORT = String(found.port || 1265);
      env.APPIUM_BASEPATH = found.basepath || '/wd/hub';
      if (found.udid) env.APPIUM_UDID = found.udid;
      if (found.wdaPort) env.WDA_PORT = String(found.wdaPort);
      // Propager un timeout de session pour éviter les hangs
      env.BOT_SESSION_TIMEOUT_MS = '120000';
    }
  } catch (_) {}
  const child = spawn(nodeBin, args, { cwd: hingeRoot, env });
  perDeviceChildren.set(udid, child);
  mainWindow?.webContents.send('deviceRun:output', { udid, line: `[ui] Start bot.js for ${deviceLabel || deviceName || udid}` });
  child.stdout.on('data', (d) => mainWindow?.webContents.send('deviceRun:output', { udid, line: d.toString() }));
  child.stderr.on('data', (d) => mainWindow?.webContents.send('deviceRun:output', { udid, line: d.toString() }));
  child.on('close', (code) => {
    perDeviceChildren.delete(udid);
    mainWindow?.webContents.send('deviceRun:exit', { udid, code });
  });
  return { ok: true };
});

ipcMain.handle('deviceRun:stop', (_e, udid) => {
  const child = perDeviceChildren.get(udid);
  if (!child) return { ok: true };
  try { child.kill('SIGINT'); } catch (_) {}
  return { ok: true };
});

ipcMain.handle('deviceRun:active', () => {
  return { udids: Array.from(perDeviceChildren.keys()) };
});

// Orchestration: Start Appium + WDA + Bot pour un UDID
ipcMain.handle('deviceRun:startFull', async (_e, payload = {}) => {
  const { udid } = payload;
  if (!udid) return { error: 'UDID manquant' };
  try {
    await startAppiumAndWDA({ udid });
    // Lancer le bot une fois Appium prêt
    await new Promise((r) => setTimeout(r, 1000));
    return await ipcMain.handle('deviceRun:start').call(null, _e, payload);
  } catch (e) {
    return { error: e?.message || String(e) };
  }
});

// Exposer state.json pour affichage de progression
ipcMain.handle('state:read', () => {
  try {
    const hingeRoot = path.resolve(__dirname, '..', '..', 'HINGE');
    const p = path.join(hingeRoot, 'config', 'state.json');
    const json = JSON.parse(fs.readFileSync(p, 'utf8'));
    return json;
  } catch (e) {
    return { error: e?.message || String(e) };
  }
});


ipcMain.handle('script:choose', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Choisir un script Node (bot.js)',
    properties: ['openFile'],
    filters: [
      { name: 'Node Scripts', extensions: ['js', 'mjs', 'cjs'] },
      { name: 'Tous fichiers', extensions: ['*'] },
    ],
  });
  if (res.canceled || !res.filePaths || !res.filePaths[0]) return null;
  return res.filePaths[0];
});

