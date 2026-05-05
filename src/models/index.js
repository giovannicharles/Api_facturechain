const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ==========================================
// USER MODEL
// ==========================================
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  prenom: { type: String, required: true },
  nom: { type: String, required: true },
  numeroAbonne: { type: String, required: true, unique: true },
  compteur: { type: String, default: 'CMPT-' + Math.random().toString(36).substring(2, 8).toUpperCase() },
  zone: { type: String, default: 'Yaoundé-Centre' },
  telephone: { type: String },
  role: { type: String, enum: ['ABONNE', 'ADMIN', 'AGENT_ENEO'], default: 'ABONNE' },
  actif: { type: Boolean, default: true },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.verifyPassword = async function (pwd) {
  return bcrypt.compare(pwd, this.password);
};

// ==========================================
// FACTURE MODEL
// ==========================================
const factureSchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  periode: { type: String, required: true },
  dateEmission: { type: Date, required: true },
  dateEcheance: { type: Date, required: true },

  // Consommation
  consommation: { type: Number, required: true }, // kWh facturé
  consommationReelle: { type: Number },           // kWh blockchain
  montant: { type: Number, required: true },       // FCFA facturé

  // Blockchain
  hashBlockchain: { type: String, index: true },
  blockNumber: { type: Number },
  transactionHash: { type: String },
  timestampBlockchain: { type: Date },

  // Anomalie
  statut: {
    type: String,
    enum: ['NORMALE', 'ANOMALIE', 'CONTESTEE', 'PAYEE'],
    default: 'NORMALE',
    index: true
  },
  scoreConfiance: { type: Number, min: 0, max: 100 },
  ecartPourcentage: { type: Number },
  anomalieDetails: {
    type: { type: String },
    description: String,
    montantSurfacturation: Number,
  },

  zone: { type: String, required: true },
  numeroCompteur: { type: String },
}, { timestamps: true });

// Index composé pour stats par zone
factureSchema.index({ zone: 1, statut: 1, createdAt: -1 });
factureSchema.index({ userId: 1, createdAt: -1 });

// ==========================================
// RECLAMATION MODEL
// ==========================================
const reclamationSchema = new mongoose.Schema({
  numero: { type: String, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  factureId: { type: mongoose.Schema.Types.ObjectId, ref: 'Facture', required: true },
  factureRef: { type: String, required: true },

  motif: { type: String, required: true },
  description: { type: String, required: true },
  montantConteste: { type: Number, default: 0 },

  priorite: {
    type: String,
    enum: ['NORMALE', 'HAUTE', 'URGENTE'],
    default: 'NORMALE'
  },

  statut: {
    type: String,
    enum: ['SOUMISE', 'EN_COURS', 'RESOLUE', 'REJETEE'],
    default: 'SOUMISE',
    index: true
  },

  // Preuves stockées sur Cloudinary
  preuves: [{
    url: String,
    publicId: String,
    type: String, // 'image' | 'pdf'
    nom: String,
    uploadedAt: { type: Date, default: Date.now }
  }],

  // Hash blockchain preuve légale
  hashPreuveBlockchain: { type: String },
  certBlockchain: {
    hash: String,
    timestamp: Date,
    network: String,
    transactionHash: String,
  },

  // Historique de traitement
  historique: [{
    date: { type: Date, default: Date.now },
    statut: String,
    commentaire: String,
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    agentNom: String,
  }],

  // Resolution
  dateResolution: Date,
  montantRembourse: Number,
  noteResolution: String,

}, { timestamps: true });

reclamationSchema.pre('save', async function (next) {
  if (!this.numero) {
    const count = await mongoose.model('Reclamation').countDocuments();
    const year = new Date().getFullYear();
    this.numero = `REC-${year}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// ==========================================
// NOTIFICATION MODEL
// ==========================================
const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['ANOMALIE', 'RECLAMATION_UPDATE', 'RESOLUTION', 'INFO'], required: true },
  titre: { type: String, required: true },
  message: { type: String, required: true },
  lue: { type: Boolean, default: false },
  data: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Facture = mongoose.model('Facture', factureSchema);
const Reclamation = mongoose.model('Reclamation', reclamationSchema);
const Notification = mongoose.model('Notification', notificationSchema);

module.exports = { User, Facture, Reclamation, Notification };
