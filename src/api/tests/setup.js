// Configuration globale pour les tests Jest
const path = require('path');

// Mock des modules externes qui peuvent causer des problèmes dans les tests
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/tmp/test'),
    getVersion: jest.fn(() => '1.0.0')
  },
  ipcMain: {
    on: jest.fn(),
    handle: jest.fn()
  }
}));

// Configuration des timeouts pour les tests d'intégration
jest.setTimeout(30000);

// Variables d'environnement pour les tests
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';

// Mock de console.log pour réduire le bruit dans les tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: console.warn,
  error: console.error
};

// Fonction utilitaire pour attendre
global.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Nettoyage après chaque test
afterEach(() => {
  jest.clearAllMocks();
});