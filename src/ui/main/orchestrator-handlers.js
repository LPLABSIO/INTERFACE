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
    return orchestrator.sessionManager.getActiveSessions();
  });

  // Lancer une session avec l'orchestrateur
  ipcMain.handle('orchestrator:launchSession', async (_e, { deviceIds, config }) => {
    if (!orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    try {
      const sessions = await orchestrator.launchSession(deviceIds, config);

      // Envoyer la mise à jour à l'interface
      mainWindow?.webContents.send('orchestrator:sessions-updated', sessions);

      return { success: true, sessions };
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

  // Configurer un intervalle pour envoyer les mises à jour de statut
  setInterval(() => {
    if (orchestrator && mainWindow) {
      const status = orchestrator.getGlobalStatus();
      mainWindow.webContents.send('orchestrator:status-update', status);
    }
  }, 5000); // Toutes les 5 secondes
}

module.exports = setupOrchestratorHandlers;