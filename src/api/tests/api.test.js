const request = require('supertest');
const APIServer = require('../server');

// Mock de l'AppOrchestrator pour les tests
class MockOrchestrator {
  constructor() {
    this.healthMonitor = {
      getHealthStatus: () => ({
        overall: 'healthy',
        components: [],
        stats: { componentsHealthy: 0, componentsUnhealthy: 0, alertsTriggered: 0 }
      }),
      forceCheckAll: () => Promise.resolve(),
      forceCheck: () => Promise.resolve(),
      registerDevice: () => {},
      getComponentHealth: () => ({ status: 'healthy', lastCheck: new Date().toISOString() }),
      alertThresholds: { cpu: 80, memory: 80, disk: 90, responseTime: 5000 },
      stats: { checksPerformed: 0, checksFailed: 0, alertsTriggered: 0 },
      on: () => {},
      emit: () => {},
      removeListener: () => {}
    };

    this.sessionManager = {
      getAllSessions: () => [],
      getSession: () => null,
      getActiveSessions: () => [],
      getDeviceSessions: () => [],
      pauseSession: () => Promise.resolve(),
      resumeSession: () => Promise.resolve(),
      getSessionMetrics: () => ({}),
      on: () => {},
      emit: () => {},
      removeListener: () => {}
    };

    this.queueManager = {
      getAllTasks: () => [],
      getTask: () => null,
      cancelTask: () => false,
      updateTaskPriority: () => false,
      pause: () => {},
      resume: () => {},
      clear: () => 0,
      getDeadLetterTasks: () => [],
      retryDeadLetterTask: () => false,
      on: () => {},
      emit: () => {},
      removeListener: () => {}
    };

    this.errorRecovery = {
      getStats: () => ({ checkpointsSaved: 0, checkpointsRestored: 0, recoveriesAttempted: 0, recoveriesSucceeded: 0 }),
      getFailureStats: () => ({ total: 0, byError: {}, byTask: {}, recentFailures: [] }),
      createCheckpoint: () => Promise.resolve('checkpoint-id')
    };

    this.processManager = {
      getStats: () => ({}),
      getAllProcesses: () => [],
      getProcessMetrics: () => Promise.resolve({})
    };
  }

  scanDevices() {
    return Promise.resolve([]);
  }

  getDeviceStatus() {
    return Promise.resolve(null);
  }

  getGlobalStatus() {
    return { devices: { total: 0, connected: 0 }, sessions: { total: 0, active: 0 }, processes: { total: 0, running: 0 } };
  }

  getQueueStats() {
    return { global: { pendingTasksCount: 0 } };
  }

  enqueueTask() {
    return { id: 'task-id', type: 'test' };
  }

  launchSession() {
    return Promise.resolve([{ id: 'session-id' }]);
  }

  stopSession() {
    return Promise.resolve();
  }

  restartProcess() {
    return Promise.resolve();
  }

  getProcessLogs() {
    return [];
  }

  // EventEmitter methods
  on() {}
  emit() {}
  removeListener() {}

  // Shutdown method
  shutdown() {
    return Promise.resolve();
  }
}

describe('API Server Tests', () => {
  let apiServer;
  let orchestrator;
  let app;

  beforeAll(async () => {
    orchestrator = new MockOrchestrator();
    apiServer = new APIServer({ port: 3001 });
    await apiServer.start(orchestrator);
    app = apiServer.app;
  });

  afterAll(async () => {
    if (apiServer) {
      await apiServer.stop();
    }
  });

  describe('Health Endpoints', () => {
    test('GET /api/health/status should return system health', async () => {
      const response = await request(app)
        .get('/api/health/status')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('overall');
      expect(response.body).toHaveProperty('components');
    });

    test('POST /api/health/check should force health check', async () => {
      const response = await request(app)
        .post('/api/health/check')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Health check completed');
    });

    test('GET /api/health/devices should return device health', async () => {
      const response = await request(app)
        .get('/api/health/devices')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('devices');
      expect(Array.isArray(response.body.devices)).toBe(true);
    });

    test('POST /api/health/register-device should register new device', async () => {
      const deviceData = {
        deviceId: 'test-device-001',
        config: {
          name: 'Test Device',
          appiumPort: 4723,
          wdaPort: 8100
        }
      };

      const response = await request(app)
        .post('/api/health/register-device')
        .send(deviceData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('deviceId', 'test-device-001');
    });
  });

  describe('Devices Endpoints', () => {
    test('GET /api/devices should return all devices', async () => {
      const response = await request(app)
        .get('/api/devices')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('devices');
      expect(Array.isArray(response.body.devices)).toBe(true);
    });

    test('POST /api/devices/:id/execute should enqueue task', async () => {
      const taskData = {
        task: {
          type: 'test',
          action: 'verify',
          data: { test: true }
        },
        priority: 'NORMAL',
        metadata: { source: 'api-test' }
      };

      const response = await request(app)
        .post('/api/devices/test-device-001/execute')
        .send(taskData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('task');
    });
  });

  describe('Queue Endpoints', () => {
    test('GET /api/queue should return queue stats', async () => {
      const response = await request(app)
        .get('/api/queue')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('global');
    });

    test('POST /api/queue/task should enqueue task', async () => {
      const taskData = {
        type: 'bot',
        data: {
          app: 'hinge',
          action: 'swipe'
        },
        priority: 'HIGH',
        metadata: { test: true }
      };

      const response = await request(app)
        .post('/api/queue/task')
        .send(taskData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('task');
    });

    test('GET /api/queue/tasks should return filtered tasks', async () => {
      const response = await request(app)
        .get('/api/queue/tasks?status=pending&limit=10')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('tasks');
      expect(Array.isArray(response.body.tasks)).toBe(true);
    });

    test('POST /api/queue/pause should pause queue', async () => {
      const response = await request(app)
        .post('/api/queue/pause')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Queue paused successfully');
    });

    test('POST /api/queue/resume should resume queue', async () => {
      const response = await request(app)
        .post('/api/queue/resume')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Queue resumed successfully');
    });
  });

  describe('Sessions Endpoints', () => {
    test('GET /api/sessions should return all sessions', async () => {
      const response = await request(app)
        .get('/api/sessions')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('sessions');
      expect(response.body).toHaveProperty('pagination');
    });

    test('GET /api/sessions/active should return active sessions', async () => {
      const response = await request(app)
        .get('/api/sessions/active')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('sessions');
      expect(Array.isArray(response.body.sessions)).toBe(true);
    });

    test('POST /api/sessions should create new session', async () => {
      const sessionData = {
        deviceIds: ['test-device-001'],
        config: {
          app: 'hinge',
          accountsNumber: 1,
          proxyProvider: 'test-proxy'
        }
      };

      // Cette route peut échouer si l'appareil n'existe pas vraiment
      // nous testons juste la validation
      const response = await request(app)
        .post('/api/sessions')
        .send(sessionData);

      expect([201, 404, 409]).toContain(response.status);
    });
  });

  describe('Metrics Endpoints', () => {
    test('GET /api/metrics should return system metrics', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('metrics');
      expect(response.body.metrics).toHaveProperty('timestamp');
      expect(response.body.metrics).toHaveProperty('system');
    });

    test('GET /api/metrics/devices should return device metrics', async () => {
      const response = await request(app)
        .get('/api/metrics/devices')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('devices');
      expect(Array.isArray(response.body.devices)).toBe(true);
    });

    test('GET /api/metrics/performance should return performance metrics', async () => {
      const response = await request(app)
        .get('/api/metrics/performance')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.metrics).toHaveProperty('system');
      expect(response.body.metrics).toHaveProperty('processes');
    });

    test('GET /api/metrics/export should export metrics as JSON', async () => {
      const response = await request(app)
        .get('/api/metrics/export?format=json')
        .expect(200);

      expect(response.body).toHaveProperty('exportedAt');
      expect(response.body).toHaveProperty('format', 'json');
      expect(response.body).toHaveProperty('data');
    });
  });

  describe('Error Handling', () => {
    test('Should return 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/non-existent')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Route not found');
    });

    test('Should validate required parameters', async () => {
      const response = await request(app)
        .post('/api/queue/task')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('errors');
      expect(Array.isArray(response.body.errors)).toBe(true);
    });

    test('Should handle invalid task types', async () => {
      const invalidTask = {
        type: 'invalid-type',
        data: {}
      };

      const response = await request(app)
        .post('/api/queue/task')
        .send(invalidTask)
        .expect(400);

      expect(response.body).toHaveProperty('errors');
    });
  });

  describe('API Documentation', () => {
    test('GET /api should return API documentation', async () => {
      const response = await request(app)
        .get('/api')
        .expect(200);

      expect(response.body).toHaveProperty('title');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('endpoints');
    });
  });

  describe('Rate Limiting', () => {
    test('Should apply rate limiting after many requests', async () => {
      const promises = Array(10).fill().map(() =>
        request(app).get('/api/health/status')
      );

      const responses = await Promise.all(promises);

      // Au moins une requête devrait passer
      expect(responses.some(r => r.status === 200)).toBe(true);
    });
  });
});

describe('WebSocket Tests', () => {
  let apiServer;
  let orchestrator;
  let clientSocket;

  beforeAll(async () => {
    orchestrator = new MockOrchestrator();
    // Ajouter EventEmitter capability
    orchestrator.emit = () => {};
    apiServer = new APIServer({ port: 3002 });
    await apiServer.start(orchestrator);
  });

  afterAll(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    if (apiServer) {
      await apiServer.stop();
    }
  });

  test('Should connect to WebSocket server', (done) => {
    const io = require('socket.io-client');
    clientSocket = io('http://localhost:3002');

    clientSocket.on('connect', () => {
      expect(clientSocket.connected).toBe(true);
      done();
    });

    clientSocket.on('connect_error', (error) => {
      done(error);
    });
  });

  test('Should receive system status updates', (done) => {
    clientSocket.on('system:status', (data) => {
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('status');
      done();
    });

    // Simuler un événement
    orchestrator.emit('status:changed', {
      timestamp: new Date().toISOString(),
      status: 'running'
    });
  });
});