'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('replay', {
  start: (payload) => ipcRenderer.invoke('replay:start', payload),
  stop: () => ipcRenderer.invoke('replay:stop'),
  onOutput: (cb) => ipcRenderer.on('replay:output', (_e, msg) => cb(msg)),
  onExit: (cb) => ipcRenderer.on('replay:exit', (_e, code) => cb(code)),
});

contextBridge.exposeInMainWorld('devices', {
  refresh: () => ipcRenderer.invoke('devices:refresh'),
});

contextBridge.exposeInMainWorld('appium', {
  start: (payload) => ipcRenderer.invoke('appium:start', payload),
  stop: () => ipcRenderer.invoke('appium:stop'),
  onOutput: (cb) => ipcRenderer.on('appium:output', (_e, msg) => cb(msg)),
  onReady: (cb) => ipcRenderer.on('appium:ready', (_e, url) => cb(url)),
  onExit: (cb) => ipcRenderer.on('appium:exit', (_e, code) => cb(code)),
});

contextBridge.exposeInMainWorld('scenario', {
  build: (payload) => ipcRenderer.invoke('scenario:build', payload),
  run: (payload) => ipcRenderer.invoke('scenario:run', payload),
  read: (filePath) => ipcRenderer.invoke('scenario:read', filePath),
  onOutput: (cb) => ipcRenderer.on('scenario:output', (_e, msg) => cb(msg)),
  onReady: (cb) => ipcRenderer.on('scenario:ready', (_e, data) => cb(data)),
  onExit: (cb) => ipcRenderer.on('scenario:exit', (_e, code) => cb(code)),
});

contextBridge.exposeInMainWorld('script', {
  start: (payload) => ipcRenderer.invoke('script:start', payload),
  stop: () => ipcRenderer.invoke('script:stop'),
  choose: () => ipcRenderer.invoke('script:choose'),
  onOutput: (cb) => ipcRenderer.on('script:output', (_e, msg) => cb(msg)),
  onExit: (cb) => ipcRenderer.on('script:exit', (_e, code) => cb(code)),
});

contextBridge.exposeInMainWorld('multi', {
  start: (payload) => ipcRenderer.invoke('multi:start', payload),
  stop: () => ipcRenderer.invoke('multi:stop'),
  onOutput: (cb) => ipcRenderer.on('multi:output', (_e, msg) => cb(msg)),
  onExit: (cb) => ipcRenderer.on('multi:exit', (_e, code) => cb(code)),
});

contextBridge.exposeInMainWorld('deviceRun', {
  list: () => ipcRenderer.invoke('deviceRun:list'),
  start: (payload) => ipcRenderer.invoke('deviceRun:start', payload),
  startFull: (payload) => ipcRenderer.invoke('deviceRun:startFull', payload),
  stop: (udid) => ipcRenderer.invoke('deviceRun:stop', udid),
  onOutput: (cb) => ipcRenderer.on('deviceRun:output', (_e, data) => cb(data)),
  onExit: (cb) => ipcRenderer.on('deviceRun:exit', (_e, data) => cb(data)),
  active: () => ipcRenderer.invoke('deviceRun:active'),
});

contextBridge.exposeInMainWorld('state', {
  read: () => ipcRenderer.invoke('state:read'),
});

