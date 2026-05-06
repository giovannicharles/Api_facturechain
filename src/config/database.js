const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

mongoose.set('strictQuery', true);

async function connectDatabase() {
  try {
    await mongoose.connect(env.mongodbUri, {
      autoIndex: !env.isProd,
      serverSelectionTimeoutMS: 10000,
    });
    logger.info('[mongo] connecté');
  } catch (err) {
    logger.error(`[mongo] échec de connexion : ${err.message}`);
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => logger.warn('[mongo] déconnecté'));
  mongoose.connection.on('reconnected', () => logger.info('[mongo] reconnecté'));
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase };
