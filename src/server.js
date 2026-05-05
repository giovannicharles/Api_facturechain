require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { ethers } = require('ethers');
const cloudinary = require('cloudinary').v2;
const connectDB = require('./config/db');
const routes = require('./routes');
const reclCtrl = require('./controllers/reclamations.controller');

const app = express();
const server = http.createServer(app);

// ==========================================
// MIDDLEWARE
// ==========================================

// Configuration CORS flexible via .env
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:4200'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check (amélioré avec infos blockchain + cloudinary)
app.get('/health', async (req, res) => {
  let blockchainStatus = 'unknown';
  let contractAddr = null;
  let walletBalance = null;
  let cloudinaryStatus = 'unknown';
  let cloudinaryConfigOk = false;

  // Vérification blockchain
  try {
    const blockchainService = require('./services/blockchain.service');
    const balance = await blockchainService.provider.getBalance(blockchainService.wallet.address);
    walletBalance = ethers.formatEther(balance);
    contractAddr = blockchainService.contract.target;
    blockchainStatus = 'connected';
  } catch (err) {
    blockchainStatus = 'error';
  }

  // Vérification Cloudinary
  try {
    // Tenter une simple requête pour valider la config
    const testResult = await cloudinary.api.ping();
    if (testResult && testResult.status === 'ok') {
      cloudinaryStatus = 'connected';
      cloudinaryConfigOk = true;
    } else {
      cloudinaryStatus = 'error';
    }
  } catch (err) {
    cloudinaryStatus = 'error';
  }

  res.json({
    status: 'ok',
    service: 'FactureChain API v2',
    db: 'MongoDB Atlas',
    storage: 'Cloudinary',
    blockchain: {
      network: process.env.BLOCKCHAIN_NETWORK || 'ethereum-sepolia',
      status: blockchainStatus,
      contract: contractAddr,
      walletBalance: walletBalance,
    },
    cloudinary: {
      status: cloudinaryStatus,
      configOk: cloudinaryConfigOk,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME ? '✅ défini' : '❌ manquant',
    },
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// API ROUTES
// ==========================================
app.use('/api', routes);

// 404 handler
app.use((req, res) => res.status(404).json({ message: `Route ${req.path} introuvable` }));

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({ message: err.message || 'Erreur serveur interne' });
});

// ==========================================
// WEBSOCKET — Temps reel
// ==========================================
const wss = new WebSocket.Server({ server });
const clients = new Map(); // userId -> Set<WebSocket>

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  let userId = null;

  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.id;
    } catch (e) {}
  }

  if (userId) {
    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(ws);
    console.log(`WebSocket connecte: userId=${userId}`);
  }

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('close', () => {
    if (userId && clients.has(userId)) {
      clients.get(userId).delete(ws);
      if (clients.get(userId).size === 0) clients.delete(userId);
    }
  });
  ws.on('error', () => ws.terminate());
});

// Keepalive ping toutes les 30s
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

const broadcast = (userId, message) => {
  const userClients = clients.get(String(userId));
  if (!userClients) return;
  const data = JSON.stringify(message);
  userClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  });
};

reclCtrl.setWsBroadcast(broadcast);

// ==========================================
// DEMARRAGE
// ==========================================
const PORT = process.env.PORT || 3000;

connectDB().then(async () => {
  // === VÉRIFICATION DE LA CONNEXION BLOCKCHAIN ==========
  try {
    const blockchainService = require('./services/blockchain.service');
    const balance = await blockchainService.provider.getBalance(blockchainService.wallet.address);
    console.log('\n✅ Connexion blockchain établie avec succès');
    console.log(`   📍 Compte : ${blockchainService.wallet.address}`);
    console.log(`   💰 Solde Sepolia : ${ethers.formatEther(balance)} ETH`);
    console.log(`   📄 Contrat : ${blockchainService.contract.target}`);
    console.log(`   🌐 Réseau : ${blockchainService.network}`);
  } catch (err) {
    console.error('\n❌ ATTENTION - Impossible de se connecter à la blockchain :', err.message);
    console.error('   Vérifiez votre fichier .env et que le contrat est déployé.');
  }

  // === VÉRIFICATION DE CLOUDINARY =========================
  try {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    const pingResult = await cloudinary.api.ping();
    if (pingResult && pingResult.status === 'ok') {
      console.log('\n✅ Cloudinary connecté avec succès');
      console.log(`   ☁️  Cloud name : ${process.env.CLOUDINARY_CLOUD_NAME}`);
      console.log(`   📁 Dossier défaut : ${process.env.CLOUDINARY_FOLDER || 'facturechain/preuves'}`);
    } else {
      throw new Error('Ping Cloudinary échoué');
    }
  } catch (err) {
    console.error('\n❌ ATTENTION - Cloudinary non initialisé :', err.message);
    console.error('   Vérifiez les variables d\'environnement CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
  }

  console.log('\n'); // espace avant le démarrage du serveur

  server.listen(PORT, () => {
    console.log(`FactureChain Backend v2.0 demarre sur le port ${PORT}`);
    console.log(`API  -> http://localhost:${PORT}/api`);
    console.log(`WS   -> ws://localhost:${PORT}`);
    console.log(`Health -> http://localhost:${PORT}/health`);
  });
});