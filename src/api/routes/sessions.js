const express = require('express');
const { body, param, query, validationResult } = require('express-validator');

/**
 * Routes API pour la gestion des sessions
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
   * GET /api/sessions
   * Liste toutes les sessions avec filtres optionnels
   */
  router.get('/',
    query('state').optional().isIn(['IDLE', 'STARTING', 'RUNNING', 'PAUSED', 'ERROR', 'COMPLETED', 'TERMINATED']),
    query('deviceId').optional().notEmpty(),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    query('offset').optional().isInt({ min: 0 }),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const { state, deviceId, limit = 50, offset = 0 } = req.query;

        let sessions = orchestrator.sessionManager.getAllSessions();

        // Filtrer par état si spécifié
        if (state) {
          sessions = sessions.filter(session => session.state === state);
        }

        // Filtrer par appareil si spécifié
        if (deviceId) {
          sessions = sessions.filter(session => session.deviceId === deviceId);
        }

        // Pagination
        const total = sessions.length;
        const paginatedSessions = sessions.slice(offset, offset + parseInt(limit));

        res.json({
          success: true,
          sessions: paginatedSessions,
          pagination: {
            total,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: offset + parseInt(limit) < total
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/sessions/:id
   * Obtenir les détails d'une session spécifique
   */
  router.get('/:id',
    param('id').notEmpty().withMessage('Session ID is required'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const session = orchestrator.sessionManager.getSession(req.params.id);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

        // Ajouter les logs du processus associé si disponible
        let logs = [];
        if (session.processId) {
          logs = orchestrator.getProcessLogs(session.processId, 100);
        }

        // Ajouter les métriques du processus
        let processMetrics = null;
        if (session.processId) {
          processMetrics = await orchestrator.processManager.getProcessMetrics(session.processId);
        }

        res.json({
          success: true,
          session: {
            ...session,
            logs,
            processMetrics
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /api/sessions
   * Créer une nouvelle session
   */
  router.post('/',
    body('deviceIds').isArray({ min: 1 }).withMessage('At least one device ID is required'),
    body('deviceIds.*').notEmpty().withMessage('Device ID cannot be empty'),
    body('config').optional().isObject(),
    body('config.app').optional().isIn(['hinge', 'tinder', 'bumble']),
    body('config.accountsNumber').optional().isInt({ min: 1, max: 10 }),
    body('config.proxyProvider').optional().notEmpty(),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const { deviceIds, config = {} } = req.body;

        // Vérifier que tous les appareils existent et sont disponibles
        const devices = [];
        for (const deviceId of deviceIds) {
          const device = await orchestrator.getDeviceStatus(deviceId);
          if (!device) {
            return res.status(404).json({
              success: false,
              error: `Device ${deviceId} not found`
            });
          }
          if (device.status === 'busy') {
            return res.status(409).json({
              success: false,
              error: `Device ${deviceId} is currently busy`
            });
          }
          devices.push(device);
        }

        // Lancer les sessions
        const sessions = await orchestrator.launchSession(deviceIds, config);

        res.status(201).json({
          success: true,
          message: `Created ${sessions.length} session(s)`,
          sessions
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * PUT /api/sessions/:id/pause
   * Mettre en pause une session
   */
  router.put('/:id/pause',
    param('id').notEmpty().withMessage('Session ID is required'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const session = orchestrator.sessionManager.getSession(req.params.id);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

        if (session.state !== 'RUNNING') {
          return res.status(400).json({
            success: false,
            error: 'Only running sessions can be paused'
          });
        }

        await orchestrator.sessionManager.pauseSession(req.params.id);

        res.json({
          success: true,
          message: 'Session paused successfully'
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * PUT /api/sessions/:id/resume
   * Reprendre une session en pause
   */
  router.put('/:id/resume',
    param('id').notEmpty().withMessage('Session ID is required'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const session = orchestrator.sessionManager.getSession(req.params.id);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

        if (session.state !== 'PAUSED') {
          return res.status(400).json({
            success: false,
            error: 'Only paused sessions can be resumed'
          });
        }

        await orchestrator.sessionManager.resumeSession(req.params.id);

        res.json({
          success: true,
          message: 'Session resumed successfully'
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * PUT /api/sessions/:id/restart
   * Redémarrer une session
   */
  router.put('/:id/restart',
    param('id').notEmpty().withMessage('Session ID is required'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const session = orchestrator.sessionManager.getSession(req.params.id);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

        // Redémarrer le processus associé
        if (session.processId) {
          await orchestrator.restartProcess(session.processId);
        }

        res.json({
          success: true,
          message: 'Session restarted successfully'
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * DELETE /api/sessions/:id
   * Terminer une session
   */
  router.delete('/:id',
    param('id').notEmpty().withMessage('Session ID is required'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const session = orchestrator.sessionManager.getSession(req.params.id);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

        await orchestrator.stopSession(req.params.id);

        res.json({
          success: true,
          message: 'Session terminated successfully'
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/sessions/:id/logs
   * Obtenir les logs d'une session
   */
  router.get('/:id/logs',
    param('id').notEmpty().withMessage('Session ID is required'),
    query('limit').optional().isInt({ min: 1, max: 10000 }),
    query('level').optional().isIn(['error', 'warn', 'info', 'debug']),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const session = orchestrator.sessionManager.getSession(req.params.id);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

        const limit = parseInt(req.query.limit) || 1000;
        const level = req.query.level;

        let logs = [];
        if (session.processId) {
          logs = orchestrator.getProcessLogs(session.processId, limit);
        }

        // Filtrer par niveau si spécifié
        if (level) {
          logs = logs.filter(log => log.level === level);
        }

        res.json({
          success: true,
          sessionId: req.params.id,
          logs
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/sessions/active
   * Obtenir toutes les sessions actives
   */
  router.get('/active',
    async (req, res, next) => {
      try {
        const activeSessions = orchestrator.sessionManager.getActiveSessions();

        res.json({
          success: true,
          count: activeSessions.length,
          sessions: activeSessions
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/sessions/device/:deviceId
   * Obtenir toutes les sessions d'un appareil
   */
  router.get('/device/:deviceId',
    param('deviceId').notEmpty().withMessage('Device ID is required'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const sessions = orchestrator.sessionManager.getDeviceSessions(req.params.deviceId);

        res.json({
          success: true,
          deviceId: req.params.deviceId,
          count: sessions.length,
          sessions
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /api/sessions/:id/checkpoint
   * Créer un checkpoint pour une session
   */
  router.post('/:id/checkpoint',
    param('id').notEmpty().withMessage('Session ID is required'),
    body('description').optional().isString(),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const session = orchestrator.sessionManager.getSession(req.params.id);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

        const { description = 'Manual checkpoint' } = req.body;

        // Créer un checkpoint via ErrorRecovery
        const checkpointId = await orchestrator.errorRecovery.createCheckpoint(
          session.id,
          {
            sessionState: session.state,
            deviceId: session.deviceId,
            config: session.config,
            timestamp: new Date()
          },
          { description }
        );

        res.status(201).json({
          success: true,
          message: 'Checkpoint created successfully',
          checkpointId
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/sessions/:id/metrics
   * Obtenir les métriques d'une session
   */
  router.get('/:id/metrics',
    param('id').notEmpty().withMessage('Session ID is required'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const session = orchestrator.sessionManager.getSession(req.params.id);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

        const metrics = orchestrator.sessionManager.getSessionMetrics(req.params.id);

        res.json({
          success: true,
          sessionId: req.params.id,
          metrics
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
};