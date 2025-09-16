const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');

/**
 * Système de logging centralisé
 * Gère les logs pour toute la plateforme
 */
class Logger {
  constructor() {
    this.loggers = new Map();
    this.logsDir = path.join(process.cwd(), 'logs');

    // Créer le dossier logs s'il n'existe pas
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }

    // Configuration par défaut
    this.defaultConfig = {
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: this.getDefaultTransports()
    };
  }

  /**
   * Transports par défaut
   */
  getDefaultTransports() {
    const transports = [];

    // Console avec couleurs
    transports.push(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, ...rest }) => {
          const meta = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '';
          return `${timestamp} [${level}]: ${message} ${meta}`;
        })
      )
    }));

    // Fichier rotatif pour tous les logs
    transports.push(new DailyRotateFile({
      filename: path.join(this.logsDir, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }));

    // Fichier séparé pour les erreurs
    transports.push(new winston.transports.File({
      filename: path.join(this.logsDir, 'error.log'),
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }));

    return transports;
  }

  /**
   * Obtenir ou créer un logger pour un module
   */
  getLogger(moduleName = 'default') {
    if (!this.loggers.has(moduleName)) {
      const logger = winston.createLogger({
        ...this.defaultConfig,
        defaultMeta: { module: moduleName }
      });

      this.loggers.set(moduleName, logger);
    }

    return this.loggers.get(moduleName);
  }

  /**
   * Créer un logger personnalisé
   */
  createLogger(options) {
    return winston.createLogger({
      ...this.defaultConfig,
      ...options
    });
  }

  /**
   * Logger pour les scripts de bot
   */
  createBotLogger(botName, deviceId) {
    const botLogsDir = path.join(this.logsDir, 'bots', botName);

    if (!fs.existsSync(botLogsDir)) {
      fs.mkdirSync(botLogsDir, { recursive: true });
    }

    return this.createLogger({
      defaultMeta: { bot: botName, device: deviceId },
      transports: [
        ...this.getDefaultTransports(),
        new winston.transports.File({
          filename: path.join(botLogsDir, `${deviceId}-${Date.now()}.log`),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      ]
    });
  }

  /**
   * Logger pour Appium
   */
  createAppiumLogger(deviceId, port) {
    const appiumLogsDir = path.join(this.logsDir, 'appium');

    if (!fs.existsSync(appiumLogsDir)) {
      fs.mkdirSync(appiumLogsDir, { recursive: true });
    }

    return this.createLogger({
      defaultMeta: { service: 'appium', device: deviceId, port },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp({ format: 'HH:mm:ss' }),
            winston.format.printf(({ timestamp, message }) => {
              return chalk.cyan(`[Appium:${port}] ${timestamp} ${message}`);
            })
          )
        }),
        new winston.transports.File({
          filename: path.join(appiumLogsDir, `${deviceId}-port-${port}.log`),
          format: winston.format.json()
        })
      ]
    });
  }

  /**
   * Méthodes de logging simplifiées
   */
  info(message, meta) {
    this.getLogger().info(message, meta);
  }

  error(message, meta) {
    this.getLogger().error(message, meta);
  }

  warn(message, meta) {
    this.getLogger().warn(message, meta);
  }

  debug(message, meta) {
    this.getLogger().debug(message, meta);
  }

  /**
   * Nettoyer les anciens logs
   */
  cleanOldLogs(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const cleanDirectory = (dir) => {
      if (!fs.existsSync(dir)) return;

      fs.readdirSync(dir).forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          cleanDirectory(filePath);
        } else if (stat.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          this.debug(`Deleted old log file: ${filePath}`);
        }
      });
    };

    cleanDirectory(this.logsDir);
  }
}

// Export singleton
module.exports = new Logger();