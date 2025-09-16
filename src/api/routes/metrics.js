const express = require('express');
const { query, validationResult } = require('express-validator');

/**
 * Routes API pour les métriques et analytics
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
   * GET /api/metrics
   * Métriques globales du système
   */
  router.get('/', async (req, res, next) => {
    try {
      const globalStatus = orchestrator.getGlobalStatus();
      const queueStats = orchestrator.getQueueStats();
      const healthStatus = orchestrator.healthMonitor.getHealthStatus();
      const recoveryStats = orchestrator.errorRecovery.getStats();

      const metrics = {
        timestamp: new Date().toISOString(),
        system: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage()
        },
        devices: globalStatus.devices,
        sessions: globalStatus.sessions,
        processes: globalStatus.processes,
        queue: queueStats,
        health: {
          overall: healthStatus.overall,
          componentsHealthy: healthStatus.stats.componentsHealthy,
          componentsUnhealthy: healthStatus.stats.componentsUnhealthy,
          alertsTriggered: healthStatus.stats.alertsTriggered
        },
        recovery: {
          checkpointsSaved: recoveryStats.checkpointsSaved,
          checkpointsRestored: recoveryStats.checkpointsRestored,
          recoveriesAttempted: recoveryStats.recoveriesAttempted,
          recoveriesSucceeded: recoveryStats.recoveriesSucceeded,
          successRate: recoveryStats.recoveriesAttempted > 0
            ? (recoveryStats.recoveriesSucceeded / recoveryStats.recoveriesAttempted * 100).toFixed(2)
            : 0
        }
      };

      res.json({
        success: true,
        metrics
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/metrics/devices
   * Métriques par appareil
   */
  router.get('/devices', async (req, res, next) => {
    try {
      const devices = await orchestrator.scanDevices();
      const deviceMetrics = [];

      for (const device of devices) {
        const status = await orchestrator.getDeviceStatus(device.udid);
        const health = orchestrator.healthMonitor.getComponentHealth(device.udid);
        const sessions = orchestrator.sessionManager.getDeviceSessions(device.udid);

        const metrics = {
          deviceId: device.udid,
          name: device.name,
          type: device.type,
          status: status ? status.status : 'unknown',
          health: health ? health.status : 'unknown',
          sessions: {
            total: sessions.length,
            active: sessions.filter(s => s.state === 'RUNNING').length,
            completed: sessions.filter(s => s.state === 'COMPLETED').length,
            failed: sessions.filter(s => s.state === 'ERROR').length
          },
          performance: status ? status.processMetrics : null,
          lastActivity: sessions.length > 0
            ? sessions[sessions.length - 1].startedAt
            : null
        };

        deviceMetrics.push(metrics);
      }

      res.json({
        success: true,
        devices: deviceMetrics
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/metrics/sessions
   * Métriques des sessions
   */
  router.get('/sessions',
    query('period').optional().isIn(['1h', '24h', '7d', '30d']),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const period = req.query.period || '24h';
        const now = new Date();
        let since = new Date();

        // Calculer la période
        switch (period) {
          case '1h':
            since.setHours(now.getHours() - 1);
            break;
          case '24h':
            since.setDate(now.getDate() - 1);
            break;
          case '7d':
            since.setDate(now.getDate() - 7);
            break;
          case '30d':
            since.setDate(now.getDate() - 30);
            break;
        }

        const allSessions = orchestrator.sessionManager.getAllSessions();
        const periodSessions = allSessions.filter(session =>
          new Date(session.createdAt) >= since
        );

        const metrics = {
          period,
          since: since.toISOString(),
          total: periodSessions.length,
          byState: {},
          byDevice: {},
          avgDuration: 0,
          successRate: 0,
          timeline: []
        };

        // Grouper par état
        periodSessions.forEach(session => {
          metrics.byState[session.state] = (metrics.byState[session.state] || 0) + 1;
          metrics.byDevice[session.deviceId] = (metrics.byDevice[session.deviceId] || 0) + 1;
        });

        // Calculer la durée moyenne
        const completedSessions = periodSessions.filter(s =>
          s.state === 'COMPLETED' && s.completedAt
        );

        if (completedSessions.length > 0) {
          const totalDuration = completedSessions.reduce((sum, session) => {
            const duration = new Date(session.completedAt) - new Date(session.startedAt);
            return sum + duration;
          }, 0);
          metrics.avgDuration = Math.round(totalDuration / completedSessions.length / 1000); // en secondes
        }

        // Calculer le taux de succès
        const finishedSessions = periodSessions.filter(s =>
          s.state === 'COMPLETED' || s.state === 'ERROR' || s.state === 'TERMINATED'
        );
        if (finishedSessions.length > 0) {
          const successfulSessions = finishedSessions.filter(s => s.state === 'COMPLETED');
          metrics.successRate = (successfulSessions.length / finishedSessions.length * 100).toFixed(2);
        }

        // Timeline (sessions par heure pour les dernières 24h)
        if (period === '24h') {
          for (let i = 23; i >= 0; i--) {
            const hourStart = new Date(now);
            hourStart.setHours(now.getHours() - i, 0, 0, 0);
            const hourEnd = new Date(hourStart);
            hourEnd.setHours(hourStart.getHours() + 1);

            const hourSessions = periodSessions.filter(session => {
              const sessionTime = new Date(session.createdAt);
              return sessionTime >= hourStart && sessionTime < hourEnd;
            });

            metrics.timeline.push({
              hour: hourStart.toISOString(),
              sessions: hourSessions.length,
              completed: hourSessions.filter(s => s.state === 'COMPLETED').length,
              failed: hourSessions.filter(s => s.state === 'ERROR').length
            });
          }
        }

        res.json({
          success: true,
          metrics
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/metrics/performance
   * Métriques de performance système
   */
  router.get('/performance', async (req, res, next) => {
    try {
      const systemMetrics = {
        timestamp: new Date().toISOString(),
        system: {
          uptime: process.uptime(),
          memory: {
            used: process.memoryUsage().heapUsed,
            total: process.memoryUsage().heapTotal,
            external: process.memoryUsage().external,
            rss: process.memoryUsage().rss
          },
          cpu: process.cpuUsage()
        },
        processes: orchestrator.processManager.getStats(),
        health: {
          checksPerformed: orchestrator.healthMonitor.stats.checksPerformed,
          checksFailed: orchestrator.healthMonitor.stats.checksFailed,
          alertsTriggered: orchestrator.healthMonitor.stats.alertsTriggered
        }
      };

      // Ajouter les métriques des processus actifs
      const activeProcesses = orchestrator.processManager.getAllProcesses();
      const processMetrics = [];

      for (const process of activeProcesses) {
        try {
          const metrics = await orchestrator.processManager.getProcessMetrics(process.id);
          if (metrics) {
            processMetrics.push({
              id: process.id,
              pid: process.pid,
              status: process.status,
              ...metrics
            });
          }
        } catch (error) {
          // Ignorer les erreurs pour les processus qui ne répondent plus
        }
      }

      systemMetrics.activeProcesses = processMetrics;

      res.json({
        success: true,
        metrics: systemMetrics
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/metrics/queue
   * Métriques de la file d'attente
   */
  router.get('/queue', async (req, res, next) => {
    try {
      const queueStats = orchestrator.getQueueStats();

      res.json({
        success: true,
        metrics: queueStats
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/metrics/health
   * Métriques de santé
   */
  router.get('/health', async (req, res, next) => {
    try {
      const healthStatus = orchestrator.healthMonitor.getHealthStatus();
      const failureStats = orchestrator.errorRecovery.getFailureStats();

      const healthMetrics = {
        overall: healthStatus.overall,
        components: healthStatus.components.map(component => ({
          id: component.id,
          name: component.name,
          type: component.type,
          status: component.status,
          lastCheck: component.lastCheck,
          metrics: component.metrics
        })),
        stats: healthStatus.stats,
        failures: {
          total: failureStats.total,
          byError: failureStats.byError,
          byTask: failureStats.byTask,
          recent: failureStats.recentFailures.slice(0, 10) // 10 échecs les plus récents
        }
      };

      res.json({
        success: true,
        metrics: healthMetrics
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/metrics/export
   * Exporter toutes les métriques en format JSON
   */
  router.get('/export',
    query('format').optional().isIn(['json', 'csv']),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const format = req.query.format || 'json';

        // Collecter toutes les métriques
        const globalMetrics = await new Promise((resolve, reject) => {
          router.handle({ method: 'GET', url: '/metrics' }, {
            json: (data) => resolve(data.metrics)
          }, reject);
        });

        const exportData = {
          exportedAt: new Date().toISOString(),
          format,
          data: globalMetrics
        };

        if (format === 'json') {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', 'attachment; filename="metrics-export.json"');
          res.json(exportData);
        } else if (format === 'csv') {
          // Conversion simple en CSV pour les métriques principales
          const csv = [
            'timestamp,devices_total,devices_connected,sessions_total,sessions_active,queue_pending,health_score',
            `${exportData.exportedAt},${globalMetrics.devices.total},${globalMetrics.devices.connected},${globalMetrics.sessions.total},${globalMetrics.sessions.active},${globalMetrics.queue.global.pendingTasksCount},${globalMetrics.health.overall === 'healthy' ? 100 : 0}`
          ].join('\n');

          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename="metrics-export.csv"');
          res.send(csv);
        }
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
};