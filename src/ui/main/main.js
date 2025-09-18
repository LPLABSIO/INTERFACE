'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const axios = require('axios');
const net = require('net');
const deviceDiscovery = require('../../utils/device-discovery');
const AppOrchestrator = require('../../core/AppOrchestrator');
const setupOrchestratorHandlers = require('./orchestrator-handlers');
const LocationManager = require('../../core/LocationManager');
const ResourceManager = require('../../core/ResourceManager');
const QueueManager = require('../../core/QueueManager');

// Initialiser l'orchestrateur
let orchestrator = null;

// Initialiser les gestionnaires de ressources
let locationManager = null;
let resourceManager = null;
let queueManager = null;

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
  // Nouveau chemin depuis la structure réorganisée
  const projectRoot = path.resolve(__dirname, '../../..');
  serversJsonPath = path.join(projectRoot, 'config', 'app', 'appium_servers.json');
  try { fs.mkdirSync(path.dirname(serversJsonPath), { recursive: true }); } catch (_) {}
  return serversJsonPath;
}

function readDataJson() {
  try {
    const projectRoot = path.resolve(__dirname, '../../..');
    const p = path.join(projectRoot, 'config', 'app', 'data.json');
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
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'iOS Automation Platform',
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // DevTools désactivé - Décommenter uniquement pour le débogage
  // mainWindow.webContents.openDevTools();

  // Log des erreurs de chargement
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`Console [${level}]: ${message} (${sourceId}:${line})`);
  });
}

app.whenReady().then(async () => {
  createWindow();

  // Initialiser les gestionnaires de ressources
  try {
    locationManager = new LocationManager();
    await locationManager.initialize();
    console.log('[Main] LocationManager initialized');

    resourceManager = new ResourceManager();
    await resourceManager.initialize();
    console.log('[Main] ResourceManager initialized');

    queueManager = new QueueManager();
    await queueManager.initialize();
    console.log('[Main] QueueManager initialized');
  } catch (error) {
    console.error('[Main] Error initializing resource managers:', error);
  }

  // Initialiser l'orchestrateur après la création de la fenêtre
  try {
    orchestrator = new AppOrchestrator({
      dbPath: path.join(app.getPath('userData'), 'sessions.db'),
      statePath: path.join(app.getPath('userData'), 'state.json')
    });
    await orchestrator.initialize();
    console.log('[Main] AppOrchestrator initialized successfully');

    // Configurer les handlers IPC pour l'orchestrateur
    setupOrchestratorHandlers(orchestrator, mainWindow);

    // Envoyer le statut initial à l'interface
    if (mainWindow) {
      const status = orchestrator.getGlobalStatus();
      mainWindow.webContents.send('orchestrator:status', status);
    }
  } catch (error) {
    console.error('[Main] Failed to initialize AppOrchestrator:', error);
  }

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
  console.log('listIosDevices called');
  try {
    // Utiliser le chemin complet pour idevice_id sur macOS
    const ideviceIdPath = '/opt/homebrew/bin/idevice_id';
    const ideviceInfoPath = '/opt/homebrew/bin/ideviceinfo';

    console.log('Running idevice_id -l...');
    const res = spawnSync(ideviceIdPath, ['-l'], { encoding: 'utf8' });
    if (res && res.status === 0 && res.stdout) {
      const udids = res.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (udids.length > 0) {
        const devices = [];
        for (const udid of udids) {
          let name = 'iPhone';
          let model = null;
          let ios = null;
          try {
            const info = spawnSync(ideviceInfoPath, ['-u', udid, '-k', 'DeviceName'], { encoding: 'utf8' });
            if (info && info.status === 0 && info.stdout) {
              const n = info.stdout.trim();
              if (n) name = n;
            }
            const modelInfo = spawnSync(ideviceInfoPath, ['-u', udid, '-k', 'ProductType'], { encoding: 'utf8' });
            if (modelInfo && modelInfo.status === 0 && modelInfo.stdout) {
              const m = modelInfo.stdout.trim();
              if (m) model = m;
            }
            const iosInfo = spawnSync(ideviceInfoPath, ['-u', udid, '-k', 'ProductVersion'], { encoding: 'utf8' });
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

// Fonction pour vérifier le statut des services
ipcMain.handle('checkServicesStatus', () => {
  const statuses = {
    script: 'inactive',
    appium: 'stopped',
    wda: 'stopped'
  };

  // Vérifier si le processus enfant du bot est en cours
  if (scriptChild && !scriptChild.killed) {
    statuses.script = 'running';
  }

  // Vérifier si Appium est en cours
  if (appiumChild && !appiumChild.killed) {
    statuses.appium = 'running';
  }

  // Vérifier si une session WDA est active
  if (currentSessionId) {
    statuses.wda = 'running';
  }

  return statuses;
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
  const wdaLocalPort = Number(cfg.baseWdaPort || 8100);
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

  // Get device name if udid is provided
  let deviceName = 'Device';
  if (udid) {
    const devices = listIosDevices();
    const device = devices.find(d => d.udid === udid);
    if (device && device.name) {
      deviceName = device.name;
    }
  }

  // Configuration pour lancement automatique de WDA
  if (udid) {
    console.log('[Main] Configuration de WebDriverAgent...');
    mainWindow?.webContents.send('system-log', {
      message: '📱 Préparation de WebDriverAgent (lancement automatique)...',
      level: 'info',
      udid: udid,
      deviceName: deviceName
    });

    // Configurer le tunnel iproxy pour WDA
    const { exec } = require('child_process');
    const wdaPort = cfg.baseWdaPort || 8100;

    // Tuer les anciens tunnels iproxy
    exec(`pkill -f "iproxy ${wdaPort}" 2>/dev/null || true`, (error) => {
      if (!error) {
        console.log('[Main] Ancien tunnel iproxy fermé');
      }
    });

    // Créer un nouveau tunnel iproxy
    exec(`iproxy ${wdaPort} ${wdaPort} ${udid} &`, (error, stdout, stderr) => {
      if (error) {
        console.error('[Main] Erreur tunnel iproxy:', error);
      } else {
        console.log('[Main] Tunnel iproxy créé sur port', wdaPort);
        mainWindow?.webContents.send('system-log', {
          message: `✅ Tunnel iproxy configuré sur port ${wdaPort}`,
          level: 'info',
          udid: udid,
          deviceName: deviceName
        });
      }
    });

    // Attendre un peu pour que le tunnel soit prêt
    await new Promise(r => setTimeout(r, 1000));

    mainWindow?.webContents.send('system-log', {
      message: '🚀 WebDriverAgent sera lancé automatiquement par Appium',
      level: 'info',
      udid: udid,
      deviceName: deviceName
    });
  }

  // Toujours tuer les processus existants avant de démarrer
  if (appiumChild) {
    try {
      appiumChild.kill('SIGTERM');
      appiumChild = null;
      await new Promise(r => setTimeout(r, 1000));
    } catch (_) {}
  }

  // Nettoyer le port même si appiumChild n'existe pas - mais ne pas tuer Electron
  try {
    const { execSync } = require('child_process');
    // Obtenir les PIDs sur le port mais exclure Electron
    const pidsCmd = `lsof -ti:${desiredPort} 2>/dev/null || true`;
    const pidsStr = execSync(pidsCmd, { encoding: 'utf8' }).trim();

    if (pidsStr) {
      const pids = pidsStr.split('\n');
      for (const pid of pids) {
        if (pid) {
          try {
            // Vérifier que ce n'est pas un processus Electron avant de tuer
            const processInfo = execSync(`ps -p ${pid} -o comm= 2>/dev/null || true`, { encoding: 'utf8' }).trim();
            if (!processInfo.includes('Electron')) {
              execSync(`kill -9 ${pid} 2>/dev/null || true`);
              console.log(`Processus ${pid} sur port ${desiredPort} arrêté`);
            }
          } catch (e) {
            // Ignorer les erreurs
          }
        }
      }
    }
    await new Promise(r => setTimeout(r, 500));
  } catch (_) {}

  const freePort = await findFreePort(desiredPort);
  if (freePort !== desiredPort) {
    try { mainWindow?.webContents.send('appium:output', `[ui] Port ${desiredPort} occupé. Utilisation du port libre ${freePort}.`); } catch (_) {}
  }
  const args = ['-p', String(freePort), '--base-path', basePath, '--log-timestamp', '--log-level', 'debug'];
  appiumChild = spawn('appium', args, { detached: true });
  appiumChild.stdout.on('data', (d) => {
    const message = d.toString();
    mainWindow?.webContents.send('appium:output', message);
    mainWindow?.webContents.send('appium-log', {
      message,
      level: 'info',
      udid: udid || '',
      deviceName: deviceName || 'Device'
    });
  });
  appiumChild.stderr.on('data', (d) => {
    const message = d.toString();
    mainWindow?.webContents.send('appium:output', message);
    mainWindow?.webContents.send('appium-log', {
      message,
      level: 'error',
      udid: udid || '',
      deviceName: deviceName || 'Device'
    });
  });
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
  const projectRoot = path.resolve(__dirname, '../../..');
  const hingeRoot = path.join(projectRoot, 'src', 'bot');
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

function startDeviceBot(_e, payload = {}) {
  const { udid, deviceName, deviceLabel, deviceArgs } = payload;
  if (!udid) return { error: 'UDID manquant' };
  if (perDeviceChildren.has(udid)) {
    mainWindow?.webContents.send('deviceRun:output', { udid, line: '[ui] bot déjà en cours pour cet appareil.' });
    return { ok: true };
  }
  const projectRoot = path.resolve(__dirname, '../../..');
  const hingeRoot = path.join(projectRoot, 'src', 'bot');
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

  // Passer le mode queue si spécifié
  if (payload.useQueue) {
    env.USE_QUEUE = 'true';
    env.QUEUE_DEVICE_ID = udid;
  }

  const child = spawn(nodeBin, args, { cwd: hingeRoot, env });
  perDeviceChildren.set(udid, child);
  mainWindow?.webContents.send('deviceRun:output', { udid, line: `[ui] Start bot.js for ${deviceLabel || deviceName || udid}` });
  // Capturer les logs du script avec meilleure gestion du buffering
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  child.stdout.on('data', (data) => {
    const lines = data.split('\n').filter(line => line.trim());
    lines.forEach(message => {
      mainWindow?.webContents.send('script-log', {
        message,
        level: 'info',
        udid: udid,
        deviceName: deviceName || deviceLabel || udid
      });
    });
  });

  child.stderr.on('data', (data) => {
    const lines = data.split('\n').filter(line => line.trim());
    lines.forEach(message => {
      mainWindow?.webContents.send('script-log', {
        message,
        level: 'error',
        udid: udid,
        deviceName: deviceName || deviceLabel || udid
      });
    });
  });
  child.on('close', (code) => {
    perDeviceChildren.delete(udid);
    mainWindow?.webContents.send('deviceRun:exit', { udid, code });
  });
  return { ok: true };
}

ipcMain.handle('deviceRun:start', (_e, payload = {}) => {
  return startDeviceBot(_e, payload);
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
    return startDeviceBot(_e, payload);
  } catch (e) {
    return { error: e?.message || String(e) };
  }
});

// Exposer state.json pour affichage de progression
ipcMain.handle('state:read', () => {
  try {
    const projectRoot = path.resolve(__dirname, '../../..');
  const hingeRoot = path.join(projectRoot, 'src', 'bot');
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

// ===== NOUVELLES API POUR L'INTERFACE REDESIGNÉE =====

// Gestionnaire pour scanner les appareils iOS
ipcMain.handle('scan-devices', async () => {
  try {
    console.log('Scanning for iOS devices...');
    const devices = listIosDevices();
    console.log('Found devices:', devices);

    const deviceList = devices.map((device, index) => {
      const udid = device.DeviceIdentifier || device.udid || `unknown-${index}`;
      const name = device.DeviceName || device.name || `iPhone ${index + 1}`;

      return {
        udid,
        name,
        status: 'online',
        appiumPort: 1265 + index,
        wdaPort: 8100 + index
      };
    });

    // Envoyer la mise à jour aux fenêtres
    mainWindow?.webContents.send('device-update', deviceList);

    return deviceList;
  } catch (error) {
    console.error('Erreur scan devices:', error);
    return [];
  }
});

// Démarrer le bot pour un appareil spécifique
ipcMain.handle('start-bot', async (_e, config) => {
  const { udid, deviceName, app, appiumPort, wdaPort, accountsNumber, proxyProvider } = config;

  try {
    // Log système
    mainWindow?.webContents.send('system-log', {
      message: `Configuration du bot pour ${deviceName}`,
      level: 'info'
    });

    // Découverte automatique de l'IP de l'iPhone
    let wdaUrl = undefined;
    let discoveredWdaPort = wdaPort;
    try {
      mainWindow?.webContents.send('system-log', {
        message: `Découverte automatique de l'IP pour ${deviceName}...`,
        level: 'info'
      });

      const deviceInfo = await deviceDiscovery.getDeviceIP(udid);
      if (deviceInfo) {
        wdaUrl = deviceInfo.wdaUrl;
        discoveredWdaPort = deviceInfo.wdaPort;

        mainWindow?.webContents.send('system-log', {
          message: `✅ WDA découvert sur ${deviceInfo.ip}:${deviceInfo.wdaPort}`,
          level: 'success'
        });
      }
    } catch (discoveryError) {
      mainWindow?.webContents.send('system-log', {
        message: `⚠️ Découverte automatique échouée, WDA sera lancé par Appium`,
        level: 'warning'
      });
    }

    // Allouer les ressources pour cet appareil
    let allocatedEmail = null;
    let allocatedLocation = null;

    if (app === 'hinge') {
      try {
        // Allouer un email
        if (resourceManager) {
          allocatedEmail = await resourceManager.allocateEmail(udid);
          if (!allocatedEmail) {
            mainWindow?.webContents.send('system-log', {
              message: `⚠️ Aucun email disponible pour ${deviceName}`,
              level: 'warning'
            });
          }
        }

        // Allouer une ville
        if (locationManager) {
          allocatedLocation = await locationManager.allocate(udid);
          if (!allocatedLocation) {
            mainWindow?.webContents.send('system-log', {
              message: `⚠️ Aucune ville disponible pour ${deviceName}`,
              level: 'warning'
            });
          } else {
            mainWindow?.webContents.send('system-log', {
              message: `📍 Ville allouée: ${allocatedLocation.city} pour ${deviceName}`,
              level: 'info'
            });
          }
        }
      } catch (error) {
        console.error('[Main] Error allocating resources:', error);
        mainWindow?.webContents.send('system-log', {
          message: `Erreur allocation ressources: ${error.message}`,
          level: 'error'
        });
      }
    }

    // Démarrer le bot via le système existant
    const projectRoot = path.resolve(__dirname, '../../..');
  const hingeRoot = path.join(projectRoot, 'src', 'bot');
    const nodeBin = process.env.npm_node_execpath || 'node';
    const scriptPath = path.join(hingeRoot, 'bot.js');

    // Arguments pour le bot
    const args = [scriptPath, 'iphonex', app || 'hinge', String(accountsNumber || 1), proxyProvider || 'marsproxies'];

    // Variables d'environnement
    const env = {
      ...process.env,
      APPIUM_HOST: '127.0.0.1',
      APPIUM_PORT: String(appiumPort),
      APPIUM_BASEPATH: '/wd/hub',
      APPIUM_UDID: udid,
      WDA_PORT: String(discoveredWdaPort),
      // Ne PAS passer WDA_URL pour laisser Appium installer et gérer WDA
      // WDA_URL: wdaUrl,  // Commenté pour laisser Appium gérer WDA
      BOT_ACCOUNTS: String(accountsNumber || 1),
      PROXY_PROVIDER: proxyProvider || 'marsproxies',
      NODE_NO_WARNINGS: '1',
      FORCE_COLOR: '0',  // Désactiver les couleurs pour éviter les caractères spéciaux
      // Passer les ressources allouées
      HINGE_EMAIL: allocatedEmail || '',
      HINGE_LOCATION: allocatedLocation ? JSON.stringify(allocatedLocation) : '',
      DEVICE_ID: udid
    };

    const child = spawn(nodeBin, args, {
      cwd: hingeRoot,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Stocker le processus
    perDeviceChildren.set(udid, child);

    // Capturer les logs du script avec meilleure gestion du buffering
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (data) => {
      const lines = data.split('\n').filter(line => line.trim());
      lines.forEach(message => {
        mainWindow?.webContents.send('script-log', {
          message,
          level: 'info',
          udid: udid,
          deviceName: device
        });
      });
    });

    child.stderr.on('data', (data) => {
      const lines = data.split('\n').filter(line => line.trim());
      lines.forEach(message => {
        mainWindow?.webContents.send('script-log', {
          message,
          level: 'error',
          udid: udid,
          deviceName: device
        });
      });
    });

    child.on('close', async (code) => {
      perDeviceChildren.delete(udid);

      // Gérer les ressources selon le résultat
      if (app === 'hinge') {
        try {
          if (code === 0) {
            // Succès : marquer les ressources comme utilisées
            if (resourceManager && allocatedEmail) {
              await resourceManager.markEmailUsed(udid);
              console.log(`[Main] Email marked as used for ${udid}`);
            }
            if (locationManager && allocatedLocation) {
              await locationManager.markUsed(udid, allocatedLocation);
              console.log(`[Main] Location ${allocatedLocation.city} marked as used for ${udid}`);
            }
          } else {
            // Échec : libérer les ressources pour réutilisation
            if (resourceManager && allocatedEmail) {
              await resourceManager.releaseEmail(udid);
              console.log(`[Main] Email released for ${udid}`);
            }
            if (locationManager && allocatedLocation) {
              await locationManager.release(udid, allocatedLocation);
              console.log(`[Main] Location ${allocatedLocation.city} released for ${udid}`);
            }
          }
        } catch (error) {
          console.error('[Main] Error managing resources on close:', error);
        }
      }

      mainWindow?.webContents.send('status-update', {
        deviceId: udid,
        status: code === 0 ? 'online' : 'error'
      });
    });

    return { success: true };
  } catch (error) {
    mainWindow?.webContents.send('system-log', {
      message: `Erreur démarrage bot: ${error.message}`,
      level: 'error'
    });
    throw error;
  }
});

// Obtenir les statistiques des ressources
ipcMain.handle('get-resource-stats', async () => {
  try {
    const locationStats = locationManager ? locationManager.getStats() : null;
    const emailStats = resourceManager ? resourceManager.getStats() : null;

    return {
      locations: locationStats,
      emails: emailStats
    };
  } catch (error) {
    console.error('[Main] Error getting resource stats:', error);
    return { locations: null, emails: null };
  }
});

// Reset des villes
ipcMain.handle('reset-locations', async () => {
  try {
    if (locationManager) {
      await locationManager.reset();
      mainWindow?.webContents.send('system-log', {
        message: '♻️ Toutes les villes ont été recyclées',
        level: 'success'
      });
      return { success: true };
    }
    return { success: false, error: 'LocationManager not initialized' };
  } catch (error) {
    console.error('[Main] Error resetting locations:', error);
    return { success: false, error: error.message };
  }
});

// ===== Queue Management Handlers =====

// Ajouter des tâches à la queue
ipcMain.handle('queue:addBatch', async (_e, count, config) => {
  try {
    if (!queueManager) {
      return { success: false, error: 'QueueManager not initialized' };
    }
    const tasks = await queueManager.addBatch(count, config);
    return { success: true, tasks };
  } catch (error) {
    console.error('[Main] Error adding batch to queue:', error);
    return { success: false, error: error.message };
  }
});

// Récupérer la prochaine tâche pour un appareil
ipcMain.handle('queue:getNext', async (_e, deviceId) => {
  try {
    if (!queueManager) {
      return { success: false, error: 'QueueManager not initialized' };
    }
    const task = await queueManager.getNextTask(deviceId);
    return { success: true, task };
  } catch (error) {
    console.error('[Main] Error getting next task:', error);
    return { success: false, error: error.message };
  }
});

// Marquer une tâche comme complétée
ipcMain.handle('queue:markCompleted', async (_e, deviceId, taskId, result) => {
  try {
    if (!queueManager) {
      return { success: false, error: 'QueueManager not initialized' };
    }
    await queueManager.markCompleted(deviceId, taskId, result);
    return { success: true };
  } catch (error) {
    console.error('[Main] Error marking task completed:', error);
    return { success: false, error: error.message };
  }
});

// Marquer une tâche comme échouée
ipcMain.handle('queue:markFailed', async (_e, deviceId, taskId, error) => {
  try {
    if (!queueManager) {
      return { success: false, error: 'QueueManager not initialized' };
    }
    await queueManager.markFailed(deviceId, taskId, error);
    return { success: true };
  } catch (error) {
    console.error('[Main] Error marking task failed:', error);
    return { success: false, error: error.message };
  }
});

// Obtenir les statistiques de la queue
ipcMain.handle('queue:getStats', async () => {
  try {
    if (!queueManager) {
      return { success: false, error: 'QueueManager not initialized' };
    }
    const stats = queueManager.getStats();
    return { success: true, stats };
  } catch (error) {
    console.error('[Main] Error getting queue stats:', error);
    return { success: false, error: error.message };
  }
});

// Obtenir toutes les tâches
ipcMain.handle('queue:getTasks', async () => {
  try {
    if (!queueManager) {
      return { success: false, error: 'QueueManager not initialized' };
    }
    const tasks = queueManager.getTasks();
    return { success: true, tasks };
  } catch (error) {
    console.error('[Main] Error getting tasks:', error);
    return { success: false, error: error.message };
  }
});

// Vider la queue
ipcMain.handle('queue:clear', async () => {
  try {
    if (!queueManager) {
      return { success: false, error: 'QueueManager not initialized' };
    }
    await queueManager.clearQueue();
    return { success: true };
  } catch (error) {
    console.error('[Main] Error clearing queue:', error);
    return { success: false, error: error.message };
  }
});

// Arrêter le bot
ipcMain.handle('stop-bot', async (_e, config) => {
  try {
    const { udid } = config;
    const child = perDeviceChildren.get(udid);

    if (child) {
      try {
        // Utiliser SIGTERM pour un arrêt plus propre
        child.kill('SIGTERM');
        perDeviceChildren.delete(udid);

        mainWindow?.webContents.send('system-log', {
          message: 'Bot arrêté avec succès',
          level: 'info'
        });
      } catch (error) {
        console.error('Erreur lors de l\'arrêt du bot:', error);
        // Essayer de forcer l'arrêt si SIGTERM échoue
        try {
          child.kill('SIGKILL');
        } catch (e) {
          console.error('Impossible de forcer l\'arrêt:', e);
        }
      }
    }

    // Arrêter aussi Appium et WDA si nécessaire
    if (appiumChild) {
      try {
        const appiumPid = appiumChild.pid;
        appiumChild.kill('SIGTERM');

        // Nettoyer le port mais en excluant le process Electron
        setTimeout(() => {
          const { exec } = require('child_process');
          // Utiliser le PID spécifique d'Appium au lieu de tuer tous les processus sur le port
          if (appiumPid) {
            exec(`kill -9 ${appiumPid} 2>/dev/null || true`, (error) => {
              if (!error) {
                console.log(`Process Appium ${appiumPid} arrêté`);
              }
            });
          }
        }, 500);
      } catch (err) {
        console.error('Erreur lors de l\'arrêt d\'Appium:', err);
      }
      appiumChild = null;
    }

    // Mettre à jour le statut de l'appareil
    if (mainWindow) {
      mainWindow.webContents.send('status-update', {
        deviceId: udid,
        status: 'online'
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Erreur globale dans stop-bot:', error);
    if (mainWindow) {
      mainWindow.webContents.send('system-log', {
        message: `Erreur arrêt bot: ${error.message}`,
        level: 'error'
      });
    }
    // Retourner success même en cas d'erreur pour éviter le crash
    return { success: false, error: error.message };
  }
});

// Démarrer Appium
ipcMain.handle('start-appium', async (_e, config) => {
  const { udid, port, wdaPort } = config;

  try {
    // Utiliser la fonction existante
    const payload = {
      appiumHost: '127.0.0.1',
      appiumPort: port,
      appiumBasepath: '/wd/hub',
      udid: udid,
      wdaPort: wdaPort
    };

    await startAppiumAndWDA(payload);

    // Attendre qu'Appium soit prêt
    await new Promise((resolve) => {
      setTimeout(resolve, 3000); // Attendre 3 secondes
    });

    return { success: true };
  } catch (error) {
    mainWindow?.webContents.send('system-log', {
      message: `Erreur démarrage Appium: ${error.message}`,
      level: 'error'
    });
    throw error;
  }
});

// Arrêter Appium
ipcMain.handle('stop-appium', async () => {
  stopAppium();
  return { success: true };
});

// Démarrer WDA (WebDriverAgent)
ipcMain.handle('start-wda', async (_e, config) => {
  const { udid, port } = config;

  try {
    // WDA est généralement démarré automatiquement par Appium
    // Mais on peut forcer iproxy si nécessaire
    mainWindow?.webContents.send('system-log', {
      message: `WDA configuré sur le port ${port}`,
      level: 'info'
    });

    return { success: true };
  } catch (error) {
    mainWindow?.webContents.send('system-log', {
      message: `Erreur configuration WDA: ${error.message}`,
      level: 'error'
    });
    throw error;
  }
});

// Arrêter WDA
ipcMain.handle('stop-wda', async () => {
  // WDA s'arrête généralement avec Appium
  return { success: true };
});

// Sauvegarder les paramètres
ipcMain.handle('save-settings', async (_e, settings) => {
  try {
    const projectRoot = path.resolve(__dirname, '../../..');
  const hingeRoot = path.join(projectRoot, 'src', 'bot');
    const settingsPath = path.join(hingeRoot, 'config', 'ui-settings.json');

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    mainWindow?.webContents.send('system-log', {
      message: 'Paramètres sauvegardés',
      level: 'success'
    });

    return { success: true };
  } catch (error) {
    mainWindow?.webContents.send('system-log', {
      message: `Erreur sauvegarde paramètres: ${error.message}`,
      level: 'error'
    });
    throw error;
  }
});

// Charger les paramètres
ipcMain.handle('load-settings', async () => {
  try {
    const projectRoot = path.resolve(__dirname, '../../..');
  const hingeRoot = path.join(projectRoot, 'src', 'bot');
    const settingsPath = path.join(hingeRoot, 'config', 'ui-settings.json');

    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return settings;
    }

    // Paramètres par défaut
    return {
      appiumBasePort: 4723,
      wdaBasePort: 8100,
      app: 'hinge',
      accountsNumber: 1,
      proxyProvider: 'marsproxies'
    };
  } catch (error) {
    console.error('Erreur chargement paramètres:', error);
    return null;
  }
});

