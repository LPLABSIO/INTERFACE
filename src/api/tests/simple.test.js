const request = require('supertest');
const APIServer = require('../server');

// Test simple pour vérifier que l'API fonctionne
describe('Simple API Test', () => {
  let apiServer;
  let app;

  beforeAll(async () => {
    // Mock minimal d'un orchestrateur
    const mockOrchestrator = {
      healthMonitor: {
        getHealthStatus: () => ({ overall: 'healthy', components: [], stats: {} }),
        on: () => {},
        emit: () => {},
        removeListener: () => {}
      },
      sessionManager: {
        getAllSessions: () => [],
        on: () => {},
        emit: () => {},
        removeListener: () => {}
      },
      queueManager: {
        getAllTasks: () => [],
        getStats: () => ({}),
        on: () => {},
        emit: () => {},
        removeListener: () => {}
      },
      scanDevices: () => Promise.resolve([]),
      getGlobalStatus: () => ({ devices: {}, sessions: {}, processes: {} }),
      getQueueStats: () => ({ global: {} }),
      on: () => {},
      emit: () => {},
      removeListener: () => {},
      shutdown: () => Promise.resolve()
    };

    apiServer = new APIServer({ port: 3003 });
    await apiServer.start(mockOrchestrator);
    app = apiServer.app;
  });

  afterAll(async () => {
    if (apiServer) {
      await apiServer.stop();
    }
  });

  test('Should start the API server', () => {
    expect(apiServer).toBeDefined();
    expect(app).toBeDefined();
  });

  test('GET /api should return API documentation', async () => {
    const response = await request(app)
      .get('/api')
      .expect(200);

    expect(response.body).toHaveProperty('version');
    expect(response.body).toHaveProperty('endpoints');
  });

  test('GET /api/health/status should return health status', async () => {
    const response = await request(app)
      .get('/api/health/status')
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('overall');
  });

  test('GET /api/devices should return devices list', async () => {
    const response = await request(app)
      .get('/api/devices')
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('devices');
    expect(Array.isArray(response.body.devices)).toBe(true);
  });

  test('GET /api/sessions should return sessions list', async () => {
    const response = await request(app)
      .get('/api/sessions')
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('sessions');
    expect(Array.isArray(response.body.sessions)).toBe(true);
  });

  test('GET /api/queue should return queue stats', async () => {
    const response = await request(app)
      .get('/api/queue')
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
  });

  test('Should return 404 for non-existent routes', async () => {
    const response = await request(app)
      .get('/api/non-existent')
      .expect(404);

    expect(response.body).toHaveProperty('error');
  });
});