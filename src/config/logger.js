const winston = require('winston');
const env = require('./env');

const logger = winston.createLogger({
  level: env.isProd ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    env.isProd
      ? winston.format.json()
      : winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level} ${message}`)
  ),
  transports: [new winston.transports.Console()],
});

module.exports = logger;
