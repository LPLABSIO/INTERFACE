// Module de logging centralisé
const fs = require('fs');
const path = require('path');

// Niveaux de log
const LogLevel = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    VERBOSE: 4
};

class Logger {
    constructor(options = {}) {
        this.name = options.name || 'app';
        this.level = options.level || LogLevel.INFO;
        this.logToFile = options.logToFile !== false;
        this.logToConsole = options.logToConsole !== false;
        this.logDir = options.logDir || path.join(process.cwd(), 'data', 'logs');

        // Créer le dossier de logs s'il n'existe pas
        if (this.logToFile) {
            this.ensureLogDirectory();
            this.logFilePath = this.getLogFilePath();
        }

        this.colors = {
            ERROR: '\x1b[31m', // Rouge
            WARN: '\x1b[33m',  // Jaune
            INFO: '\x1b[36m',  // Cyan
            DEBUG: '\x1b[35m', // Magenta
            VERBOSE: '\x1b[37m', // Blanc
            RESET: '\x1b[0m'
        };
    }

    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    getLogFilePath() {
        const date = new Date();
        const dateStr = date.toISOString().split('T')[0];
        return path.join(this.logDir, `${this.name}-${dateStr}.log`);
    }

    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const levelName = this.getLevelName(level);

        const baseLog = {
            timestamp,
            level: levelName,
            logger: this.name,
            message
        };

        // Ajouter les métadonnées si présentes
        if (Object.keys(meta).length > 0) {
            baseLog.meta = meta;
        }

        return baseLog;
    }

    getLevelName(level) {
        const levelNames = Object.keys(LogLevel);
        return levelNames.find(key => LogLevel[key] === level) || 'UNKNOWN';
    }

    log(level, message, meta = {}) {
        if (level > this.level) return;

        const logEntry = this.formatMessage(level, message, meta);
        const levelName = this.getLevelName(level);

        // Log dans la console
        if (this.logToConsole) {
            const color = this.colors[levelName] || this.colors.RESET;
            const consoleMessage = `${color}[${logEntry.timestamp}] [${levelName}] [${this.name}]${this.colors.RESET} ${message}`;

            if (level === LogLevel.ERROR) {
                console.error(consoleMessage);
                if (meta.error && meta.error.stack) {
                    console.error(meta.error.stack);
                }
            } else if (level === LogLevel.WARN) {
                console.warn(consoleMessage);
            } else {
                console.log(consoleMessage);
            }
        }

        // Log dans un fichier
        if (this.logToFile) {
            const fileEntry = JSON.stringify(logEntry) + '\n';
            fs.appendFileSync(this.logFilePath, fileEntry);
        }

        // Émettre un événement pour l'interface
        if (global.mainWindow) {
            global.mainWindow.webContents.send('log-entry', logEntry);
        }
    }

    error(message, error = null) {
        const meta = error ? { error: { message: error.message, stack: error.stack } } : {};
        this.log(LogLevel.ERROR, message, meta);
    }

    warn(message, meta = {}) {
        this.log(LogLevel.WARN, message, meta);
    }

    info(message, meta = {}) {
        this.log(LogLevel.INFO, message, meta);
    }

    debug(message, meta = {}) {
        this.log(LogLevel.DEBUG, message, meta);
    }

    verbose(message, meta = {}) {
        this.log(LogLevel.VERBOSE, message, meta);
    }

    // Méthode pour obtenir les logs depuis un fichier
    async getLogs(options = {}) {
        const { date = new Date(), lines = 100, level = null } = options;
        const dateStr = date.toISOString().split('T')[0];
        const logFile = path.join(this.logDir, `${this.name}-${dateStr}.log`);

        if (!fs.existsSync(logFile)) {
            return [];
        }

        const content = fs.readFileSync(logFile, 'utf8');
        const logLines = content.split('\n').filter(line => line.trim());

        let logs = logLines.map(line => {
            try {
                return JSON.parse(line);
            } catch (e) {
                return null;
            }
        }).filter(log => log !== null);

        // Filtrer par niveau si spécifié
        if (level !== null) {
            logs = logs.filter(log => LogLevel[log.level] <= level);
        }

        // Retourner les dernières lignes
        return logs.slice(-lines);
    }

    // Méthode pour archiver les vieux logs
    archiveLogs(daysToKeep = 7) {
        const now = Date.now();
        const cutoffTime = now - (daysToKeep * 24 * 60 * 60 * 1000);

        fs.readdirSync(this.logDir).forEach(file => {
            const filePath = path.join(this.logDir, file);
            const stats = fs.statSync(filePath);

            if (stats.mtime.getTime() < cutoffTime) {
                // Créer un dossier d'archives s'il n'existe pas
                const archiveDir = path.join(this.logDir, 'archive');
                if (!fs.existsSync(archiveDir)) {
                    fs.mkdirSync(archiveDir);
                }

                // Déplacer le fichier dans les archives
                const archivePath = path.join(archiveDir, file);
                fs.renameSync(filePath, archivePath);
                this.info(`Archived old log file: ${file}`);
            }
        });
    }

    // Méthode pour nettoyer les logs
    clearLogs() {
        if (this.logFilePath && fs.existsSync(this.logFilePath)) {
            fs.writeFileSync(this.logFilePath, '');
            this.info('Logs cleared');
        }
    }
}

// Créer des instances par défaut pour différents modules
const loggers = new Map();

function getLogger(name = 'app', options = {}) {
    if (!loggers.has(name)) {
        loggers.set(name, new Logger({ name, ...options }));
    }
    return loggers.get(name);
}

module.exports = {
    Logger,
    LogLevel,
    getLogger,

    // Loggers prédéfinis
    appLogger: getLogger('app'),
    botLogger: getLogger('bot'),
    deviceLogger: getLogger('device'),
    networkLogger: getLogger('network')
};