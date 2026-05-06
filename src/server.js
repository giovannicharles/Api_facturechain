const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { connectDatabase } = require('./config/database');

async function bootstrap() {
  await connectDatabase();
  const server = app.listen(env.port, () => {
    logger.info(`[server] FactureChain API à l'écoute sur http://localhost:${env.port}${env.apiPrefix}`);
    logger.info(`[server] Mode : ${env.nodeEnv}`);
    logger.info(`[server] Adapter ENEO : ${env.eneo.mode} | Ledger : ${env.ledger.mode}`);
  });

  const shutdown = (signal) => {
    logger.info(`[server] Signal ${signal} reçu, arrêt en cours…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error(`[server] échec démarrage : ${err.stack || err.message}`);
  process.exit(1);
});
