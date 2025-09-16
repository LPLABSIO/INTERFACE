const { spawn } = require('child_process');
const EventEmitter = require('events');
const pidusage = require('pidusage');
const treeKill = require('tree-kill');

/**
 * Gestionnaire de processus avec monitoring et contrôle
 */
class ProcessManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.processes = new Map(); // Map<id, ProcessInfo>
    this.monitoringInterval = options.monitoringInterval || 5000; // 5 secondes
    this.autoRestartDelay = options.autoRestartDelay || 3000; // 3 secondes
    this.maxRestarts = options.maxRestarts || 3;
    this.memoryThreshold = options.memoryThreshold || 500 * 1024 * 1024; // 500MB
    this.cpuThreshold = options.cpuThreshold || 80; // 80%

    this.monitorTimer = null;
    this.startMonitoring();
  }

  /**
   * Démarrer un nouveau processus
   */
  async spawnProcess(id, command, args = [], options = {}) {
    if (this.processes.has(id)) {
      throw new Error(`Process with id ${id} already exists`);
    }

    const processInfo = {
      id,
      command,
      args,
      options,
      process: null,
      pid: null,
      status: 'starting',
      restarts: 0,
      startTime: Date.now(),
      metrics: {
        cpu: 0,
        memory: 0,
        ppid: null,
        elapsed: 0
      },
      logs: [],
      errors: []
    };

    try {
      // Spawn le processus
      const childProcess = spawn(command, args, {
        ...options,
        detached: false,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      processInfo.process = childProcess;
      processInfo.pid = childProcess.pid;
      processInfo.status = 'running';

      // Capturer stdout
      childProcess.stdout.on('data', (data) => {
        const log = data.toString();
        processInfo.logs.push({
          timestamp: new Date().toISOString(),
          type: 'stdout',
          message: log
        });

        this.emit('process:output', {
          id,
          type: 'stdout',
          data: log
        });
      });

      // Capturer stderr
      childProcess.stderr.on('data', (data) => {
        const error = data.toString();
        processInfo.errors.push({
          timestamp: new Date().toISOString(),
          type: 'stderr',
          message: error
        });

        this.emit('process:output', {
          id,
          type: 'stderr',
          data: error
        });
      });

      // Gérer la fermeture
      childProcess.on('close', (code) => {
        processInfo.status = code === 0 ? 'stopped' : 'crashed';
        processInfo.exitCode = code;
        processInfo.endTime = Date.now();

        this.emit('process:exit', {
          id,
          code,
          status: processInfo.status
        });

        // Auto-restart si configuré
        if (code !== 0 && options.autoRestart && processInfo.restarts < this.maxRestarts) {
          setTimeout(() => {
            this.restartProcess(id);
          }, this.autoRestartDelay);
        }
      });

      // Gérer les erreurs
      childProcess.on('error', (error) => {
        processInfo.status = 'error';
        processInfo.lastError = error.message;

        this.emit('process:error', {
          id,
          error: error.message
        });
      });

      this.processes.set(id, processInfo);

      this.emit('process:started', {
        id,
        pid: childProcess.pid
      });

      return processInfo;

    } catch (error) {
      processInfo.status = 'error';
      processInfo.lastError = error.message;
      this.processes.set(id, processInfo);

      throw error;
    }
  }

  /**
   * Redémarrer un processus
   */
  async restartProcess(id) {
    const processInfo = this.processes.get(id);
    if (!processInfo) {
      throw new Error(`Process ${id} not found`);
    }

    console.log(`[ProcessManager] Restarting process ${id} (attempt ${processInfo.restarts + 1}/${this.maxRestarts})`);

    // Tuer le processus existant
    await this.killProcess(id, false);

    // Incrémenter le compteur de redémarrage
    processInfo.restarts++;

    // Redémarrer avec les mêmes paramètres
    this.processes.delete(id);

    return this.spawnProcess(id, processInfo.command, processInfo.args, processInfo.options);
  }

  /**
   * Tuer un processus
   */
  async killProcess(id, removeFromMap = true) {
    const processInfo = this.processes.get(id);
    if (!processInfo) {
      return;
    }

    return new Promise((resolve) => {
      if (processInfo.process && processInfo.pid && processInfo.status === 'running') {
        processInfo.status = 'stopping';

        treeKill(processInfo.pid, 'SIGTERM', (err) => {
          if (err && err.code !== 'ESRCH') {
            console.error(`[ProcessManager] Error killing process ${id}:`, err);
            // Forcer SIGKILL si SIGTERM échoue
            try {
              process.kill(processInfo.pid, 'SIGKILL');
            } catch (e) {
              // Ignorer si le processus est déjà mort
            }
          }

          processInfo.status = 'stopped';
          processInfo.endTime = Date.now();

          if (removeFromMap) {
            this.processes.delete(id);
          }

          this.emit('process:killed', { id });
          resolve();
        });
      } else {
        if (removeFromMap) {
          this.processes.delete(id);
        }
        resolve();
      }
    });
  }

  /**
   * Obtenir les métriques d'un processus
   */
  async getProcessMetrics(id) {
    const processInfo = this.processes.get(id);
    if (!processInfo || !processInfo.pid) {
      return null;
    }

    try {
      const stats = await pidusage(processInfo.pid);

      processInfo.metrics = {
        cpu: stats.cpu,
        memory: stats.memory,
        ppid: stats.ppid,
        elapsed: stats.elapsed,
        timestamp: Date.now()
      };

      return processInfo.metrics;
    } catch (error) {
      // Le processus n'existe plus
      if (error.code === 'ENOENT' || error.code === 'ESRCH') {
        processInfo.status = 'stopped';
      }
      return null;
    }
  }

  /**
   * Démarrer le monitoring des processus
   */
  startMonitoring() {
    if (this.monitorTimer) {
      return;
    }

    this.monitorTimer = setInterval(async () => {
      for (const [id, processInfo] of this.processes) {
        if (processInfo.status === 'running') {
          const metrics = await this.getProcessMetrics(id);

          if (metrics) {
            // Vérifier les seuils
            if (metrics.memory > this.memoryThreshold) {
              this.emit('process:warning', {
                id,
                type: 'memory',
                value: metrics.memory,
                threshold: this.memoryThreshold
              });
            }

            if (metrics.cpu > this.cpuThreshold) {
              this.emit('process:warning', {
                id,
                type: 'cpu',
                value: metrics.cpu,
                threshold: this.cpuThreshold
              });
            }

            // Émettre les métriques
            this.emit('process:metrics', {
              id,
              metrics
            });
          }
        }
      }
    }, this.monitoringInterval);
  }

  /**
   * Arrêter le monitoring
   */
  stopMonitoring() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  /**
   * Obtenir l'état d'un processus
   */
  getProcessStatus(id) {
    const processInfo = this.processes.get(id);
    if (!processInfo) {
      return null;
    }

    return {
      id: processInfo.id,
      pid: processInfo.pid,
      status: processInfo.status,
      command: processInfo.command,
      args: processInfo.args,
      startTime: processInfo.startTime,
      endTime: processInfo.endTime,
      restarts: processInfo.restarts,
      metrics: processInfo.metrics,
      lastError: processInfo.lastError
    };
  }

  /**
   * Obtenir tous les processus
   */
  getAllProcesses() {
    const processes = [];

    for (const [id, info] of this.processes) {
      processes.push(this.getProcessStatus(id));
    }

    return processes;
  }

  /**
   * Obtenir les logs d'un processus
   */
  getProcessLogs(id, limit = 100) {
    const processInfo = this.processes.get(id);
    if (!processInfo) {
      return [];
    }

    return processInfo.logs.slice(-limit);
  }

  /**
   * Obtenir les erreurs d'un processus
   */
  getProcessErrors(id, limit = 100) {
    const processInfo = this.processes.get(id);
    if (!processInfo) {
      return [];
    }

    return processInfo.errors.slice(-limit);
  }

  /**
   * Nettoyer les logs d'un processus
   */
  clearProcessLogs(id) {
    const processInfo = this.processes.get(id);
    if (processInfo) {
      processInfo.logs = [];
      processInfo.errors = [];
    }
  }

  /**
   * Obtenir les statistiques globales
   */
  getStats() {
    let totalCpu = 0;
    let totalMemory = 0;
    let runningCount = 0;
    let crashedCount = 0;
    let totalRestarts = 0;

    for (const info of this.processes.values()) {
      if (info.status === 'running') {
        runningCount++;
        totalCpu += info.metrics.cpu || 0;
        totalMemory += info.metrics.memory || 0;
      } else if (info.status === 'crashed') {
        crashedCount++;
      }
      totalRestarts += info.restarts;
    }

    return {
      totalProcesses: this.processes.size,
      runningProcesses: runningCount,
      crashedProcesses: crashedCount,
      totalCpu,
      totalMemory,
      totalRestarts,
      averageCpu: runningCount > 0 ? totalCpu / runningCount : 0,
      averageMemory: runningCount > 0 ? totalMemory / runningCount : 0
    };
  }

  /**
   * Arrêter proprement le gestionnaire
   */
  async shutdown() {
    console.log('[ProcessManager] Shutting down...');

    // Arrêter le monitoring
    this.stopMonitoring();

    // Tuer tous les processus
    const killPromises = [];
    for (const id of this.processes.keys()) {
      killPromises.push(this.killProcess(id));
    }

    await Promise.all(killPromises);

    this.removeAllListeners();

    console.log('[ProcessManager] Shutdown complete');
  }
}

module.exports = ProcessManager;