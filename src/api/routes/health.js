const express = require('express');
const { body, param, query, validationResult } = require('express-validator');

/**
 * Routes API pour le monitoring de santé
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
   * GET /api/health/status
   * État de santé global du système
   */
  router.get('/status', async (req, res, next) => {
    try {
      const healthStatus = orchestrator.healthMonitor.getHealthStatus();

      res.json({
        success: true,
        ...healthStatus
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/health/devices
   * État de santé des appareils
   */
  router.get('/devices', async (req, res, next) => {
    try {
      const healthStatus = orchestrator.healthMonitor.getHealthStatus();
      const devices = healthStatus.components.filter(component => component.type === 'device');

      res.json({
        success: true,
        count: devices.length,
        devices
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/health/services
   * État de santé des services
   */
  router.get('/services', async (req, res, next) => {
    try {
      const healthStatus = orchestrator.healthMonitor.getHealthStatus();
      const services = healthStatus.components.filter(component => component.type === 'service');

      res.json({
        success: true,
        count: services.length,
        services
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/health/component/:id
   * État de santé d'un composant spécifique
   */
  router.get('/component/:id',
    param('id').notEmpty().withMessage('Component ID is required'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const health = orchestrator.healthMonitor.getComponentHealth(req.params.id);

        if (!health) {
          return res.status(404).json({
            success: false,
            error: 'Component not found'
          });
        }

        res.json({
          success: true,
          component: health
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /api/health/check
   * Forcer une vérification de santé globale
   */
  router.post('/check', async (req, res, next) => {
    try {
      await orchestrator.healthMonitor.forceCheckAll();

      const healthStatus = orchestrator.healthMonitor.getHealthStatus();

      res.json({
        success: true,
        message: 'Health check completed',
        status: healthStatus
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/health/check/:id
   * Forcer une vérification de santé sur un composant
   */
  router.post('/check/:id',
    param('id').notEmpty().withMessage('Component ID is required'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        await orchestrator.healthMonitor.forceCheck(req.params.id);

        const health = orchestrator.healthMonitor.getComponentHealth(req.params.id);

        res.json({
          success: true,
          message: 'Component health check completed',
          component: health
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/health/alerts
   * Obtenir les alertes actives
   */
  router.get('/alerts',
    query('severity').optional().isIn(['low', 'warning', 'high', 'critical']),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        // Note: HealthMonitor n'a pas de méthode getAlerts,
        // nous pourrions l'ajouter ou utiliser les événements récents
        const failureStats = orchestrator.errorRecovery.getFailureStats();

        // Pour cette implémentation, nous utilisons les échecs récents comme alertes
        let alerts = failureStats.recentFailures.map(failure => ({
          id: `failure-${Date.parse(failure.timestamp)}`,
          type: 'error',
          severity: 'high',
          message: failure.error.message,
          component: failure.taskId,
          timestamp: failure.timestamp
        }));

        // Filtrer par sévérité si spécifié
        if (req.query.severity) {
          alerts = alerts.filter(alert => alert.severity === req.query.severity);
        }

        // Limiter les résultats
        const limit = parseInt(req.query.limit) || 50;
        alerts = alerts.slice(0, limit);

        res.json({
          success: true,
          count: alerts.length,
          alerts
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /api/health/register-device
   * Enregistrer un nouvel appareil pour monitoring
   */
  router.post('/register-device',
    body('deviceId').notEmpty().withMessage('Device ID is required'),
    body('config').optional().isObject(),
    body('config.name').optional().notEmpty(),
    body('config.appiumPort').optional().isInt(),
    body('config.wdaPort').optional().isInt(),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const { deviceId, config = {} } = req.body;

        orchestrator.healthMonitor.registerDevice(deviceId, config);

        res.status(201).json({
          success: true,
          message: 'Device registered for health monitoring',
          deviceId
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /api/health/register-service
   * Enregistrer un nouveau service pour monitoring
   */
  router.post('/register-service',
    body('serviceId').notEmpty().withMessage('Service ID is required'),
    body('config').isObject().withMessage('Service configuration is required'),
    body('config.name').notEmpty().withMessage('Service name is required'),
    body('config.checks').isObject().withMessage('Health checks configuration is required'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const { serviceId, config } = req.body;

        orchestrator.healthMonitor.registerService(serviceId, config);

        res.status(201).json({
          success: true,
          message: 'Service registered for health monitoring',
          serviceId
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * DELETE /api/health/component/:id
   * Arrêter le monitoring d'un composant
   */
  router.delete('/component/:id',
    param('id').notEmpty().withMessage('Component ID is required'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        orchestrator.healthMonitor.stopMonitoring(req.params.id);

        res.json({
          success: true,
          message: 'Component monitoring stopped'
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/health/history/:id
   * Obtenir l'historique de santé d'un composant
   */
  router.get('/history/:id',
    param('id').notEmpty().withMessage('Component ID is required'),
    query('period').optional().isIn(['1h', '24h', '7d', '30d']),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        // Note: Ceci nécessiterait une implémentation d'historique dans HealthMonitor
        // Pour l'instant, nous retournons l'état actuel
        const health = orchestrator.healthMonitor.getComponentHealth(req.params.id);

        if (!health) {
          return res.status(404).json({
            success: false,
            error: 'Component not found'
          });
        }

        // Simuler un historique basique
        const history = {
          componentId: req.params.id,
          period: req.query.period || '24h',
          data: [
            {
              timestamp: health.lastCheck,
              status: health.status,
              metrics: health.metrics
            }
          ]
        };

        res.json({
          success: true,
          history
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * PUT /api/health/thresholds
   * Mettre à jour les seuils d'alerte
   */
  router.put('/thresholds',
    body('cpu').optional().isFloat({ min: 0, max: 100 }),
    body('memory').optional().isFloat({ min: 0, max: 100 }),
    body('disk').optional().isFloat({ min: 0, max: 100 }),
    body('responseTime').optional().isInt({ min: 0 }),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const { cpu, memory, disk, responseTime } = req.body;

        // Mettre à jour les seuils dans HealthMonitor
        if (cpu !== undefined) {
          orchestrator.healthMonitor.alertThresholds.cpu = cpu;
        }
        if (memory !== undefined) {
          orchestrator.healthMonitor.alertThresholds.memory = memory;
        }
        if (disk !== undefined) {
          orchestrator.healthMonitor.alertThresholds.disk = disk;
        }
        if (responseTime !== undefined) {
          orchestrator.healthMonitor.alertThresholds.responseTime = responseTime;
        }

        res.json({
          success: true,
          message: 'Alert thresholds updated',
          thresholds: orchestrator.healthMonitor.alertThresholds
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/health/recovery-stats
   * Statistiques de récupération d'erreurs
   */
  router.get('/recovery-stats', async (req, res, next) => {
    try {
      const recoveryStats = orchestrator.errorRecovery.getStats();
      const failureStats = orchestrator.errorRecovery.getFailureStats();

      const stats = {
        recovery: recoveryStats,
        failures: failureStats
      };

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};