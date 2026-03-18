const winston = require('winston');
const path    = require('path');
const fs      = require('fs');

const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (Object.keys(meta).length > 0) log += ` | ${JSON.stringify(meta)}`;
  if (stack) log += `\n${stack}`;
  return log;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat)
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level:    'error',
      maxsize:  10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize:  20 * 1024 * 1024,
      maxFiles: 10,
      tailable: true
    })
  ]
});

// ── In-memory buffer (500 entries max) để tránh memory leak ──────────────────
const MAX_BUFFER = 500;
const logBuffer  = [];

const originalWrite  = logger.write.bind(logger);
logger.write = function (info) {
  logBuffer.push({
    id:        Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    level:     info.level,
    message:   info.message
  });
  if (logBuffer.length > MAX_BUFFER) logBuffer.shift();
  return originalWrite(info);
};

const getLogBuffer   = () => [...logBuffer].reverse();
const clearLogBuffer = () => { logBuffer.length = 0; };

module.exports = { logger, getLogBuffer, clearLogBuffer };
