#!/usr/bin/env node

const AppOrchestrator = require('./src/core/AppOrchestrator');
const { TaskPriority } = require('./packages/@shared/queue-manager');

/**
 * Test the Queue Manager functionality
 */
async function testQueueManager() {
  console.log('\n=== Testing Queue Manager ===\n');

  const orchestrator = new AppOrchestrator({
    maxConcurrentTasks: 2,
    allocationStrategy: 'round-robin'
  });

  try {
    // Initialize
    console.log('1. Initializing orchestrator...');
    await orchestrator.initialize();
    console.log('   ✅ Orchestrator initialized');

    // Enqueue tasks with different priorities
    console.log('\n2. Enqueuing tasks...');

    const task1 = orchestrator.enqueueTask(
      {
        type: 'bot',
        app: 'hinge',
        accountsNumber: 1,
        proxyProvider: 'marsproxies',
        config: { timeout: 30000 }
      },
      {
        priority: TaskPriority.HIGH,
        metadata: { name: 'Task 1 - High Priority' }
      }
    );
    console.log(`   ✅ Enqueued task ${task1.id} (HIGH priority)`);

    const task2 = orchestrator.enqueueTask(
      {
        type: 'bot',
        app: 'hinge',
        accountsNumber: 1,
        proxyProvider: 'marsproxies',
        config: { timeout: 30000 }
      },
      {
        priority: TaskPriority.NORMAL,
        metadata: { name: 'Task 2 - Normal Priority' }
      }
    );
    console.log(`   ✅ Enqueued task ${task2.id} (NORMAL priority)`);

    const task3 = orchestrator.enqueueTask(
      {
        type: 'bot',
        app: 'hinge',
        accountsNumber: 1,
        proxyProvider: 'marsproxies',
        config: { timeout: 30000 }
      },
      {
        priority: TaskPriority.CRITICAL,
        metadata: { name: 'Task 3 - Critical Priority' }
      }
    );
    console.log(`   ✅ Enqueued task ${task3.id} (CRITICAL priority)`);

    // Schedule a future task
    console.log('\n3. Scheduling a future task...');
    const scheduledTaskId = orchestrator.scheduleTask(
      {
        type: 'test',
        testFile: 'test.spec.js'
      },
      5000, // 5 seconds from now
      {
        priority: TaskPriority.LOW,
        metadata: { name: 'Scheduled Test Task' }
      }
    );
    console.log(`   ✅ Scheduled task ${scheduledTaskId} to run in 5 seconds`);

    // Get queue stats
    console.log('\n4. Queue Statistics:');
    const stats = orchestrator.getQueueStats();
    console.log('   Queue sizes:', stats.queue.queueSizes);
    console.log('   Task states:', stats.queue.taskStates);
    console.log('   Global stats:', stats.global);
    console.log('   Device utilization:', stats.devices);

    // Test queue events
    console.log('\n5. Monitoring queue events for 10 seconds...');

    orchestrator.queueManager.on('task:assigned', ({ task, device }) => {
      console.log(`   📋 Task ${task.id} assigned to device ${device.id}`);
    });

    orchestrator.queueManager.on('task:started', (task) => {
      console.log(`   ▶️  Task ${task.id} started`);
    });

    orchestrator.queueManager.on('task:completed', ({ task, result }) => {
      console.log(`   ✅ Task ${task.id} completed`);
    });

    orchestrator.queueManager.on('task:failed', ({ task, error }) => {
      console.log(`   ❌ Task ${task.id} failed: ${error.message}`);
    });

    orchestrator.queueManager.on('task:retry', (task) => {
      console.log(`   🔄 Task ${task.id} retrying (attempt ${task.retries})`);
    });

    // Wait for some processing
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Final stats
    console.log('\n6. Final Queue Statistics:');
    const finalStats = orchestrator.getQueueStats();
    console.log('   Tasks scheduled:', finalStats.global.tasksScheduled);
    console.log('   Tasks completed:', finalStats.global.tasksCompleted);
    console.log('   Tasks failed:', finalStats.global.tasksFailed);
    console.log('   Active tasks:', finalStats.global.activeTasksCount);

    // Test dead letter queue (if any)
    if (finalStats.deadLetter) {
      console.log('\n7. Dead Letter Queue:');
      console.log('   Total items:', finalStats.deadLetter.queueSizes.total);
    }

    // Shutdown
    console.log('\n8. Shutting down...');
    await orchestrator.shutdown();
    console.log('   ✅ Orchestrator shut down');

    console.log('\n=== Queue Manager Test Complete ===\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    await orchestrator.shutdown();
    process.exit(1);
  }
}

// Run test
testQueueManager().catch(console.error);