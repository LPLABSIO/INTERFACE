const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { TaskPriority } = require('@shared/queue-manager');

/**
 * Routes API pour la gestion de la file d'attente
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
   * GET /api/queue
   * Obtenir l'état de la file d'attente
   */
  router.get('/', async (req, res, next) => {
    try {
      const stats = orchestrator.getQueueStats();

      res.json({
        success: true,
        ...stats
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/queue/task
   * Ajouter une tâche à la file d'attente
   */
  router.post('/task',
    body('type').isIn(['bot', 'test', 'custom']).withMessage('Invalid task type'),
    body('data').isObject().withMessage('Task data is required'),
    body('priority').optional().isIn(['CRITICAL', 'HIGH', 'NORMAL', 'LOW']),
    body('deviceId').optional().notEmpty(),
    body('metadata').optional().isObject(),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const { type, data, priority = 'NORMAL', deviceId, metadata = {} } = req.body;

        const taskData = {
          type,
          ...data,
          ...(deviceId && { deviceId })
        };

        const task = orchestrator.enqueueTask(taskData, {
          priority: TaskPriority[priority],
          metadata: {
            ...metadata,
            createdAt: new Date().toISOString(),
            source: 'api'
          }
        });

        res.status(201).json({
          success: true,
          message: 'Task enqueued successfully',
          task
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/queue/tasks
   * Obtenir la liste des tâches dans la file
   */
  router.get('/tasks',
    query('status').optional().isIn(['pending', 'assigned', 'running', 'completed', 'failed']),
    query('priority').optional().isIn(['CRITICAL', 'HIGH', 'NORMAL', 'LOW']),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const { status, priority, limit = 100 } = req.query;

        // Obtenir toutes les tâches via le queue manager
        const allTasks = orchestrator.queueManager.getAllTasks();

        let filteredTasks = allTasks;

        // Filtrer par statut
        if (status) {
          filteredTasks = filteredTasks.filter(task => task.status === status);
        }

        // Filtrer par priorité
        if (priority) {
          filteredTasks = filteredTasks.filter(task => task.priority === priority);
        }

        // Limiter le nombre de résultats
        const limitedTasks = filteredTasks.slice(0, parseInt(limit));

        res.json({
          success: true,
          total: filteredTasks.length,
          tasks: limitedTasks
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/queue/task/:id
   * Obtenir les détails d'une tâche
   */
  router.get('/task/:id',
    param('id').notEmpty().withMessage('Task ID is required'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const task = orchestrator.queueManager.getTask(req.params.id);

        if (!task) {
          return res.status(404).json({
            success: false,
            error: 'Task not found'
          });
        }

        res.json({
          success: true,
          task
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * DELETE /api/queue/task/:id
   * Annuler une tâche
   */
  router.delete('/task/:id',
    param('id').notEmpty().withMessage('Task ID is required'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const success = orchestrator.queueManager.cancelTask(req.params.id);

        if (!success) {
          return res.status(404).json({
            success: false,
            error: 'Task not found or cannot be cancelled'
          });
        }

        res.json({
          success: true,
          message: 'Task cancelled successfully'
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * PUT /api/queue/task/:id/priority
   * Modifier la priorité d'une tâche
   */
  router.put('/task/:id/priority',
    param('id').notEmpty().withMessage('Task ID is required'),
    body('priority').isIn(['CRITICAL', 'HIGH', 'NORMAL', 'LOW']).withMessage('Invalid priority'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const { priority } = req.body;

        const success = orchestrator.queueManager.updateTaskPriority(
          req.params.id,
          TaskPriority[priority]
        );

        if (!success) {
          return res.status(404).json({
            success: false,
            error: 'Task not found or cannot be updated'
          });
        }

        res.json({
          success: true,
          message: 'Task priority updated successfully'
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * POST /api/queue/pause
   * Mettre en pause la file d'attente
   */
  router.post('/pause', async (req, res, next) => {
    try {
      orchestrator.queueManager.pause();

      res.json({
        success: true,
        message: 'Queue paused successfully'
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/queue/resume
   * Reprendre la file d'attente
   */
  router.post('/resume', async (req, res, next) => {
    try {
      orchestrator.queueManager.resume();

      res.json({
        success: true,
        message: 'Queue resumed successfully'
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/queue/clear
   * Vider la file d'attente
   */
  router.post('/clear',
    body('force').optional().isBoolean(),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const { force = false } = req.body;

        const cleared = orchestrator.queueManager.clear(force);

        res.json({
          success: true,
          message: `Queue cleared. ${cleared} tasks removed.`
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/queue/stats
   * Obtenir les statistiques détaillées de la file
   */
  router.get('/stats', async (req, res, next) => {
    try {
      const stats = orchestrator.getQueueStats();

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/queue/dead-letter
   * Obtenir les tâches de la dead letter queue
   */
  router.get('/dead-letter', async (req, res, next) => {
    try {
      const deadLetterTasks = orchestrator.queueManager.getDeadLetterTasks();

      res.json({
        success: true,
        count: deadLetterTasks.length,
        tasks: deadLetterTasks
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/queue/dead-letter/:id/retry
   * Relancer une tâche de la dead letter queue
   */
  router.post('/dead-letter/:id/retry',
    param('id').notEmpty().withMessage('Task ID is required'),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const success = orchestrator.queueManager.retryDeadLetterTask(req.params.id);

        if (!success) {
          return res.status(404).json({
            success: false,
            error: 'Task not found in dead letter queue'
          });
        }

        res.json({
          success: true,
          message: 'Dead letter task retried successfully'
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
};