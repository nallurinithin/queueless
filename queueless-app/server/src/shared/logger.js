/**
 * QueueLess Application Logger
 *
 * Simple structured console logger for development and production.
 */

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = process.env.LOG_LEVEL || 'info';

function shouldLog(level) {
  return levels[level] <= (levels[currentLevel] ?? 2);
}

export const logger = {
  error: (...args) => {
    if (shouldLog('error')) {
      console.error(new Date().toISOString(), '[ERROR]', ...args);
    }
  },
  warn: (...args) => {
    if (shouldLog('warn')) {
      console.warn(new Date().toISOString(), '[WARN]', ...args);
    }
  },
  info: (...args) => {
    if (shouldLog('info')) {
      console.info(new Date().toISOString(), '[INFO]', ...args);
    }
  },
  debug: (...args) => {
    if (shouldLog('debug')) {
      console.debug(new Date().toISOString(), '[DEBUG]', ...args);
    }
  },
};

