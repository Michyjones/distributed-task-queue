const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

class Logger {
  constructor(level = 'INFO') {
    this.level = LOG_LEVELS[level] || LOG_LEVELS.INFO;
  }

  _log(level, ...args) {
    if (LOG_LEVELS[level] >= this.level) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level}]`, ...args);
    }
  }

  debug(...args) {
    this._log('DEBUG', ...args);
  }

  info(...args) {
    this._log('INFO', ...args);
  }

  warn(...args) {
    this._log('WARN', ...args);
  }

  error(...args) {
    this._log('ERROR', ...args);
  }
}

module.exports = new Logger(process.env.LOG_LEVEL || 'INFO');