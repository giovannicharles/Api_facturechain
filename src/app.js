const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const logger = require('./config/logger');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS interdit pour : ${origin}`));
    },
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

if (!env.isProd) {
  app.use(morgan('dev'));
} else {
  app.use(
    morgan('combined', {
      stream: { write: (msg) => logger.info(msg.trim()) },
    })
  );
}

const limiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Trop de requêtes, réessayez plus tard.' } },
});
app.use(env.apiPrefix, limiter);

app.get('/', (req, res) =>
  res.json({
    name: 'FactureChain API',
    version: '1.0.0',
    docs: `${env.apiPrefix}/health`,
    description: 'Suivi de la consommation électrique des abonnés camerounais.',
  })
);

app.use(env.apiPrefix, routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
