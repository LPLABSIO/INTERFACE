const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { log } = require('./utils');

const DEVICES_PATH = path.join(__dirname, '..', 'config', 'devices.json');

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function listConnectedUdids() {
  const result = spawnSync('idevice_id', ['-l'], { encoding: 'utf-8' });
  if (result.error) {
    throw new Error('idevice_id introuvable. Installe libimobiledevice: brew install --HEAD libimobiledevice');
  }
  if (result.status !== 0) {
    throw new Error(`idevice_id failed: ${result.stderr || result.stdout}`);
  }
  const lines = result.stdout.split('\n').map(x => x.trim()).filter(Boolean);
  return lines;
}

function saveDevices(udids) {
  writeJSON(DEVICES_PATH, udids);
  log(`Saved ${udids.length} device(s) to devices.json`);
}

function loadDevices() {
  const data = readJSON(DEVICES_PATH);
  return Array.isArray(data) ? data : [];
}

module.exports = {
  listConnectedUdids,
  saveDevices,
  loadDevices,
};

