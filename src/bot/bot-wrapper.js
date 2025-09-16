#!/usr/bin/env node

// Wrapper pour forcer le flush des logs du bot
const { spawn } = require('child_process');
const path = require('path');

// Forcer le flush immédiat de stdout/stderr
if (process.stdout._handle) process.stdout._handle.setBlocking(true);
if (process.stderr._handle) process.stderr._handle.setBlocking(true);

// Arguments passés au wrapper
const args = process.argv.slice(2);
const scriptPath = path.join(__dirname, 'bot.js');

// Lancer le bot avec unbuffered output
const child = spawn(process.execPath, [scriptPath, ...args], {
  stdio: 'pipe',
  env: {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    NODE_NO_WARNINGS: '1'
  }
});

// Relay stdout with immediate flush
child.stdout.on('data', (data) => {
  process.stdout.write(data);
  if (process.stdout.isTTY) {
    process.stdout.write(''); // Force flush
  }
});

// Relay stderr with immediate flush
child.stderr.on('data', (data) => {
  process.stderr.write(data);
  if (process.stderr.isTTY) {
    process.stderr.write(''); // Force flush
  }
});

// Relay exit code
child.on('exit', (code) => {
  process.exit(code || 0);
});

// Handle errors
child.on('error', (err) => {
  console.error('Erreur lors du lancement du bot:', err);
  process.exit(1);
});