const express = require('express');
const { body, param, query, validationResult } = require('express-validator');

/**
 * Routes API pour la gestion des appareils
 */
module.exports = (orchestrator) => {
  const router = express.Router();

  // Middleware de validation
  const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  };

  /**
   * GET /api/devices
   * Liste tous les appareils connectés
   */
  router.get('/', async (req, res, next) => {
    try {
      const devices = await orchestrator.scanDevices();
      const devicesWithStatus = await Promise.all(
        devices.map(async (device) => {
          const status = await orchestrator.getDeviceStatus(device.udid);
          return status || device;
        })
      );

      res.json({
        success: true,
        count: devicesWithStatus.length,
        devices: devicesWithStatus
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/devices/:id
   * Obtenir les détails d'un appareil spécifique
   */
  router.get('/:id',
    param('id').notEmpty().withMessage('Device ID is required'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const deviceStatus = await orchestrator.getDeviceStatus(req.params.id);

        if (!deviceStatus) {
          return res.status(404).json({
            success: false,
            error: 'Device not found'
          });
        }

        res.json({
          success: true,
          device: deviceStatus
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /api/devices/:id/execute
   * Exécuter une tâche sur un appareil spécifique
   */
  router.post('/:id/execute',
    param('id').notEmpty().withMessage('Device ID is required'),
    body('task').isObject().withMessage('Task configuration is required'),
    body('task.type').isIn(['bot', 'test', 'custom']).withMessage('Invalid task type'),
    body('priority').optional().isIn(['CRITICAL', 'HIGH', 'NORMAL', 'LOW']),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const { task, priority = 'NORMAL', metadata = {} } = req.body;

        // Vérifier que l'appareil existe
        const device = await orchestrator.getDeviceStatus(req.params.id);
        if (!device) {
          return res.status(404).json({
            success: false,
            error: 'Device not found'
          });
        }

        // Enqueue la tâche avec l'appareil spécifique
        const enqueuedTask = orchestrator.queueManager.submitTask(
          {
            ...task,
            deviceId: req.params.id
          },
          {
            priority,
            metadata: {
              ...metadata,
              requestedAt: new Date().toISOString(),
              deviceId: req.params.id
            }
          }
        );

        res.status(201).json({
          success: true,
          message: 'Task enqueued successfully',
          task: enqueuedTask
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * PUT /api/devices/:id/restart
   * Redémarrer les services d'un appareil
   */
  router.put('/:id/restart',
    param('id').notEmpty().withMessage('Device ID is required'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const device = await orchestrator.getDeviceStatus(req.params.id);
        if (!device) {
          return res.status(404).json({
            success: false,
            error: 'Device not found'
          });
        }

        // Si l'appareil a une session active, la redémarrer
        if (device.activeSession && device.activeSession.processId) {
          await orchestrator.restartProcess(device.activeSession.processId);
        }

        res.json({
          success: true,
          message: 'Device services restarted successfully'
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * DELETE /api/devices/:id/session
   * Arrêter la session active d'un appareil
   */
  router.delete('/:id/session',
    param('id').notEmpty().withMessage('Device ID is required'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const device = await orchestrator.getDeviceStatus(req.params.id);
        if (!device) {
          return res.status(404).json({
            success: false,
            error: 'Device not found'
          });
        }

        if (!device.activeSession) {
          return res.status(400).json({
            success: false,
            error: 'No active session on this device'
          });
        }

        await orchestrator.stopSession(device.activeSession.id);

        res.json({
          success: true,
          message: 'Session stopped successfully'
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/devices/:id/logs
   * Obtenir les logs d'un appareil
   */
  router.get('/:id/logs',
    param('id').notEmpty().withMessage('Device ID is required'),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const device = await orchestrator.getDeviceStatus(req.params.id);
        if (!device) {
          return res.status(404).json({
            success: false,
            error: 'Device not found'
          });
        }

        const limit = parseInt(req.query.limit) || 100;
        let logs = [];

        if (device.activeSession && device.activeSession.processId) {
          logs = orchestrator.getProcessLogs(device.activeSession.processId, limit);
        }

        res.json({
          success: true,
          deviceId: req.params.id,
          logs
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /api/devices/:id/health-check
   * Forcer une vérification de santé sur un appareil
   */
  router.post('/:id/health-check',
    param('id').notEmpty().withMessage('Device ID is required'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        await orchestrator.healthMonitor.forceCheck(req.params.id);

        const health = orchestrator.healthMonitor.getComponentHealth(req.params.id);

        res.json({
          success: true,
          health
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/devices/:id/metrics
   * Obtenir les métriques d'un appareil
   */
  router.get('/:id/metrics',
    param('id').notEmpty().withMessage('Device ID is required'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const device = await orchestrator.getDeviceStatus(req.params.id);
        if (!device) {
          return res.status(404).json({
            success: false,
            error: 'Device not found'
          });
        }

        const health = orchestrator.healthMonitor.getComponentHealth(req.params.id);
        const sessions = orchestrator.sessionManager.getDeviceSessions(req.params.id);

        const metrics = {
          deviceId: req.params.id,
          status: device.status,
          health: health ? health.status : 'unknown',
          sessions: {
            total: sessions.length,
            active: sessions.filter(s => s.state === 'RUNNING').length,
            completed: sessions.filter(s => s.state === 'COMPLETED').length,
            failed: sessions.filter(s => s.state === 'ERROR').length
          },
          performance: device.processMetrics || {},
          lastActivity: device.activeSession ? device.activeSession.startedAt : null
        };

        res.json({
          success: true,
          metrics
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
};