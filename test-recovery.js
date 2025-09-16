#!/usr/bin/env node

const AppOrchestrator = require('./src/core/AppOrchestrator');

/**
 * Test the Error Recovery and Health Monitoring functionality
 */
async function testRecoveryAndHealth() {
  console.log('\n=== Testing Error Recovery & Health Monitoring ===\n');

  const orchestrator = new AppOrchestrator({
    healthCheckInterval: 5000, // Check every 5 seconds for testing
    maxCheckpoints: 5
  });

  try {
    // Initialize
    console.log('1. Initializing orchestrator...');
    await orchestrator.initialize();
    console.log('   ✅ Orchestrator initialized');

    // Test Health Monitoring
    console.log('\n2. Testing Health Monitoring...');

    // Monitor health events
    orchestrator.healthMonitor.on('health:checked', (data) => {
      console.log(`   📊 Health check for ${data.id}: ${data.status}`);
    });

    orchestrator.healthMonitor.on('alert:triggered', (alert) => {
      console.log(`   🚨 Alert: ${alert.message} (severity: ${alert.severity})`);
    });

    orchestrator.healthMonitor.on('component:unhealthy', (component) => {
      console.log(`   ❌ Component unhealthy: ${component.name}`);
    });

    orchestrator.healthMonitor.on('component:recovered', (component) => {
      console.log(`   ✅ Component recovered: ${component.name}`);
    });

    // Register a test service
    orchestrator.healthMonitor.registerService('test-api', {
      name: 'Test API Server',
      checks: {
        http: true,
        port: true
      },
      url: 'http://localhost:3000/health',
      host: 'localhost',
      port: 3000
    });

    // Get health status
    const healthStatus = orchestrator.healthMonitor.getHealthStatus();
    console.log('   Health Status:', JSON.stringify(healthStatus, null, 2));

    // Test Error Recovery
    console.log('\n3. Testing Error Recovery...');

    // Monitor recovery events
    orchestrator.errorRecovery.on('checkpoint:created', (data) => {
      console.log(`   💾 Checkpoint created for task ${data.taskId}`);
    });

    orchestrator.errorRecovery.on('recovery:success', (data) => {
      console.log(`   ✅ Recovery successful for task ${data.taskId} using ${data.strategy} strategy`);
    });

    orchestrator.errorRecovery.on('recovery:failed', (data) => {
      console.log(`   ❌ Recovery failed for task ${data.taskId}: ${data.reason}`);
    });

    // Create a test task
    const testTask = {
      id: 'test-task-001',
      type: 'bot',
      state: 'running',
      data: {
        app: 'hinge',
        accountsNumber: 1
      }
    };

    // Create checkpoints
    console.log('\n4. Creating checkpoints...');
    const checkpoint1 = await orchestrator.errorRecovery.createCheckpoint(
      testTask.id,
      { progress: 25, lastAction: 'login' },
      { description: 'After login' }
    );
    console.log(`   ✅ Checkpoint 1 created: ${checkpoint1}`);

    await new Promise(resolve => setTimeout(resolve, 1000));

    const checkpoint2 = await orchestrator.errorRecovery.createCheckpoint(
      testTask.id,
      { progress: 50, lastAction: 'profile_setup' },
      { description: 'After profile setup' }
    );
    console.log(`   ✅ Checkpoint 2 created: ${checkpoint2}`);

    // Simulate errors and test recovery
    console.log('\n5. Simulating errors and recovery...');

    // Network error - should trigger retry
    const networkError = new Error('Connection refused');
    networkError.code = 'ECONNREFUSED';

    const recovery1 = await orchestrator.errorRecovery.handleError(
      testTask,
      networkError
    );
    console.log(`   Recovery 1 result:`, recovery1);

    // Process crash - should trigger restart
    const crashError = new Error('Process exited unexpectedly');

    const recovery2 = await orchestrator.errorRecovery.handleError(
      testTask,
      crashError
    );
    console.log(`   Recovery 2 result:`, recovery2);

    // Test rollback with checkpoint
    console.log('\n6. Testing checkpoint restoration...');

    const latestCheckpoint = await orchestrator.errorRecovery.getLatestCheckpoint(testTask.id);
    console.log(`   Latest checkpoint:`, latestCheckpoint);

    if (latestCheckpoint) {
      const restored = await orchestrator.errorRecovery.restoreCheckpoint(latestCheckpoint.id);
      console.log(`   Restored state:`, restored);
    }

    // Get recovery statistics
    console.log('\n7. Recovery Statistics:');
    const recoveryStats = orchestrator.errorRecovery.getStats();
    console.log('   Checkpoints saved:', recoveryStats.checkpointsSaved);
    console.log('   Checkpoints restored:', recoveryStats.checkpointsRestored);
    console.log('   Recoveries attempted:', recoveryStats.recoveriesAttempted);
    console.log('   Recoveries succeeded:', recoveryStats.recoveriesSucceeded);
    console.log('   Recoveries failed:', recoveryStats.recoveriesFailed);

    // Get failure analysis
    const failureStats = orchestrator.errorRecovery.getFailureStats();
    console.log('\n8. Failure Analysis:');
    console.log('   Total failures:', failureStats.total);
    console.log('   By error type:', failureStats.byError);
    console.log('   By task:', failureStats.byTask);

    // Test with queue integration
    console.log('\n9. Testing with Queue Manager integration...');

    // Submit a task that will fail
    const failingTask = orchestrator.enqueueTask(
      {
        type: 'test',
        testFile: 'non-existent.js',
        config: { expectFailure: true }
      },
      {
        metadata: { name: 'Failing Test Task' }
      }
    );

    console.log(`   Enqueued failing task: ${failingTask.id}`);

    // Wait for recovery attempts
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Get global status including health and recovery
    console.log('\n10. Global System Status:');
    const globalStatus = orchestrator.getGlobalStatus();
    console.log('   Health:', globalStatus.health);
    console.log('   Recovery:', globalStatus.recovery);

    // Force health check
    console.log('\n11. Forcing health checks...');
    await orchestrator.healthMonitor.forceCheckAll();
    console.log('   ✅ Health checks completed');

    // Shutdown
    console.log('\n12. Shutting down...');
    await orchestrator.shutdown();
    console.log('   ✅ Orchestrator shut down');

    console.log('\n=== Error Recovery & Health Monitoring Test Complete ===\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    await orchestrator.shutdown();
    process.exit(1);
  }
}

// Run test
testRecoveryAndHealth().catch(console.error);