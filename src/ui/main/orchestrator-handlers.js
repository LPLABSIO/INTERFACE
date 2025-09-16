const { ipcMain } = require('electron');

/**
 * Configure les handlers IPC pour l'orchestrateur
 */
function setupOrchestratorHandlers(orchestrator, mainWindow) {
  // Obtenir le statut global de l'orchestrateur
  ipcMain.handle('orchestrator:getStatus', async () => {
    if (!orchestrator) {
      return { error: 'Orchestrator not initialized' };
    }
    return orchestrator.getGlobalStatus();
  });

  // Obtenir les sessions actives
  ipcMain.handle('orchestrator:getSessions', async () => {
    if (!orchestrator) {
      return [];
    }
    try {
      const sessions = orchestrator.sessionManager.getActiveSessions();
      // Convertir en objets simples sérialisables
      return sessions.map(session => ({
        id: session.id,
        deviceId: session.deviceId,
        state: session.state,
        startTime: session.startTime,
        endTime: session.endTime,
        retries: session.retries || 0,
        error: session.error || null
      }));
    } catch (error) {
      console.error('[Orchestrator] Error getting sessions:', error);
      return [];
    }
  });

  // Lancer une session avec l'orchestrateur
  ipcMain.handle('orchestrator:launchSession', async (_e, { deviceIds, config }) => {
    if (!orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    try {
      const sessions = await orchestrator.launchSession(deviceIds, config);

      // Convertir les sessions en objets simples sérialisables
      const serializedSessions = sessions.map(session => ({
        id: session.id,
        deviceId: session.deviceId,
        state: session.state,
        startTime: session.startTime,
        endTime: session.endTime,
        retries: session.retries || 0,
        error: session.error || null
      }));

      // Envoyer la mise à jour à l'interface
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('orchestrator:sessions-updated', serializedSessions);
      }

      return { success: true, sessions: serializedSessions };
    } catch (error) {
      console.error('[Main] Failed to launch session:', error);
      return { success: false, error: error.message };
    }
  });

  // Arrêter une session
  ipcMain.handle('orchestrator:stopSession', async (_e, sessionId) => {
    if (!orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    try {
      await orchestrator.stopSession(sessionId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Obtenir les métriques d'une session
  ipcMain.handle('orchestrator:getSessionMetrics', async (_e, sessionId) => {
    if (!orchestrator) {
      return null;
    }

    const session = orchestrator.sessionManager.getSession(sessionId);
    if (!session) {
      return null;
    }

    const metrics = await orchestrator.sessionManager.store.getSessionEvents(sessionId);
    return metrics;
  });

  // Obtenir les logs d'un processus
  ipcMain.handle('orchestrator:getProcessLogs', async (_e, processId) => {
    if (!orchestrator) {
      return [];
    }

    return orchestrator.getProcessLogs(processId, 100);
  });

  // S'abonner aux changements d'état
  ipcMain.handle('orchestrator:subscribe', async (_e, path) => {
    if (!orchestrator) {
      return;
    }

    // Créer un listener qui envoie les mises à jour à l'interface
    const unsubscribe = orchestrator.subscribe(path, (value) => {
      mainWindow?.webContents.send('orchestrator:state-changed', { path, value });
    });

    // Stocker la fonction de désabonnement (à gérer plus tard si nécessaire)
    return true;
  });

  // Obtenir le statut d'un appareil
  ipcMain.handle('orchestrator:getDeviceStatus', async (_e, deviceId) => {
    if (!orchestrator) {
      return null;
    }

    return await orchestrator.getDeviceStatus(deviceId);
  });

  // Scanner les appareils
  ipcMain.handle('orchestrator:scanDevices', async () => {
    if (!orchestrator) {
      return [];
    }

    const devices = await orchestrator.scanDevices();

    // Envoyer la mise à jour à l'interface
    mainWindow?.webContents.send('orchestrator:devices-updated', devices);

    return devices;
  });

  // Redémarrer un processus
  ipcMain.handle('orchestrator:restartProcess', async (_e, processId) => {
    if (!orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    try {
      await orchestrator.restartProcess(processId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Nettoyer les anciennes sessions
  ipcMain.handle('orchestrator:cleanup', async (_e, daysToKeep = 7) => {
    if (!orchestrator) {
      return;
    }

    await orchestrator.cleanup(daysToKeep);
    return { success: true };
  });

  // Queue Manager handlers
  ipcMain.handle('orchestrator:enqueueTask', async (_e, { taskData, options }) => {
    if (!orchestrator) {
      return { success: false, error: 'Orchestrator not initialized' };
    }

    try {
      const task = orchestrator.enqueueTask(taskData, options);
      return { success: true, task };
    } catch (error) {
      console.error('[Orchestrator] Failed to enqueue task:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('orchestrator:getQueueStats', async () => {
    if (!orchestrator) {
      return null;
    }

    try {
      const stats = orchestrator.getQueueStats();
      // Get all tasks from the queue
      const tasks = [
        ...orchestrator.queueManager.taskQueue.getTasks({ state: 'pending' }),
        ...orchestrator.queueManager.taskQueue.getTasks({ state: 'running' }),
        ...orchestrator.queueManager.taskQueue.getTasks({ state: 'completed' }).slice(-10), // Last 10 completed
        ...orchestrator.queueManager.taskQueue.getTasks({ state: 'failed' }).slice(-5) // Last 5 failed
      ];
      return { ...stats, tasks };
    } catch (error) {
      console.error('[Orchestrator] Failed to get queue stats:', error);
      return null;
    }
  });

  ipcMain.handle('orchestrator:cancelTask', async (_e, taskId) => {
    if (!orchestrator) {
      return { success: false, error: 'Orchestrator not initialized' };
    }

    try {
      orchestrator.queueManager.taskQueue.cancel(taskId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('orchestrator:clearCompleted', async () => {
    if (!orchestrator) {
      return { success: false, error: 'Orchestrator not initialized' };
    }

    try {
      orchestrator.queueManager.taskQueue.clear({ state: 'completed' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Configurer un intervalle pour envoyer les mises à jour de statut
  const updateInterval = setInterval(() => {
    if (orchestrator && mainWindow && !mainWindow.isDestroyed()) {
      try {
        const status = orchestrator.getGlobalStatus();
        mainWindow.webContents.send('orchestrator:status-update', status);
      } catch (error) {
        // La fenêtre a été fermée, nettoyer l'intervalle
        console.log('[Orchestrator] Window closed, stopping status updates');
        clearInterval(updateInterval);
      }
    }
  }, 5000); // Toutes les 5 secondes

  // Nettoyer l'intervalle quand la fenêtre est fermée
  if (mainWindow) {
    mainWindow.on('closed', () => {
      clearInterval(updateInterval);
    });
  }
}

module.exports = setupOrchestratorHandlers;