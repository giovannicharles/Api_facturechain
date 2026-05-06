/**
 * Script de seed FactureChain.
 *
 * Usage :
 *   npm run seed         # ajoute les données si la base est vide
 *   npm run seed:reset   # vide tout et regénère
 *
 * Données injectées :
 *   - Comptes (1 admin, 1 agent, 6 abonnés)
 *   - 6 clients ENEO + 7 compteurs (multi-compteurs : Mbarga a 2 compteurs)
 *   - 12 mois de factures par compteur, avec anomalies injectées sur certains mois
 *   - 4 réclamations dans différents statuts
 *   - 10 signalements de coupures
 *   - 2 annonces
 *
 * Hash chain : chaque facture est scellée chronologiquement, ce qui garantit
 * que le ledger interne est valide dès le premier seed.
 */

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const env = require('../config/env');
const logger = require('../config/logger');
const { connectDatabase, disconnectDatabase } = require('../config/database');

const User = require('../models/User');
const Customer = require('../models/Customer');
const Meter = require('../models/Meter');
const Invoice = require('../models/Invoice');
const IndexReading = require('../models/IndexReading');
const Anomaly = require('../models/Anomaly');
const Claim = require('../models/Claim');
const PowerOutage = require('../models/PowerOutage');
const Announcement = require('../models/Announcement');

const invoiceService = require('../services/invoice.service');
const tariff = require('../services/tariff.service');

const DATA_DIR = path.join(__dirname, 'data');
const args = process.argv.slice(2);
const RESET = args.includes('--reset');

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${name}.json`), 'utf8'));
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}
function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

/**
 * Génère 12 mois de consommation avec une variabilité saisonnière + anomalies injectées.
 * - Mois 6, 7, 8 (saison sèche / chaleur) → +20 % (climatisation)
 * - Si le mois est dans `anomalyMonths`, on injecte un pic franc + un écart de facturation.
 */
function buildMonthlySeries(meterDef, monthsBack = 12) {
  const now = new Date();
  const series = [];
  let lastIndex = randInt(15000, 25000); // index initial plausible

  for (let i = monthsBack; i >= 1; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = d.getMonth() + 1; // 1..12
    const year = d.getFullYear();

    let conso = meterDef.baseConsumption + rand(-meterDef.consumptionVariance, meterDef.consumptionVariance);
    // saisonnalité : juin, juillet, août → climatisation
    if ([6, 7, 8].includes(month)) conso *= 1.2;
    // saison fraîche : décembre, janvier → léger creux
    if ([12, 1].includes(month)) conso *= 0.9;

    let isAnomaly = false;
    let amountOverbilled = 0;

    if (meterDef.anomalyMonths && meterDef.anomalyMonths.includes(month) && i <= 6) {
      // Pic franc : x1.7 + un overbilling artificiel pour simuler une surfacturation
      conso *= 1.7;
      isAnomaly = true;
      amountOverbilled = randInt(2000, 8000); // FCFA en plus
    }

    conso = Math.round(conso);
    const previousIndex = lastIndex;
    const currentIndex = previousIndex + conso;

    const recomputed = tariff.computeInvoiceAmount(conso, meterDef.tariffCategory);
    const amountBilled = recomputed.total + amountOverbilled;

    const issueDate = new Date(year, month, 5); // émise le 5 du mois suivant
    const dueDate = new Date(year, month, 25);

    series.push({
      period: { year, month },
      previousIndex,
      currentIndex,
      consumptionKwh: conso,
      amountBilled,
      issueDate,
      dueDate,
      isAnomaly,
    });

    lastIndex = currentIndex;
  }
  return series;
}

function formatInvoiceNumber(meter, period, seq) {
  const code = meter.meterNumber.split('-')[1] || 'CMR';
  return `ENEO-${period.year}-${String(period.month).padStart(2, '0')}-${code}-${String(seq).padStart(6, '0')}`;
}

async function clearAll() {
  logger.info('[seed] purge de toutes les collections…');
  await Promise.all([
    User.deleteMany({}),
    Customer.deleteMany({}),
    Meter.deleteMany({}),
    Invoice.deleteMany({}),
    IndexReading.deleteMany({}),
    Anomaly.deleteMany({}),
    Claim.deleteMany({}),
    PowerOutage.deleteMany({}),
    Announcement.deleteMany({}),
  ]);
}

async function seed() {
  await connectDatabase();

  const existing = await User.countDocuments();
  if (existing > 0 && !RESET) {
    logger.warn(`[seed] base déjà peuplée (${existing} users). Utilisez --reset pour repartir de zéro.`);
    await disconnectDatabase();
    return;
  }
  if (RESET) await clearAll();

  // 1. Customers
  logger.info('[seed] création des clients ENEO…');
  const customersData = loadJson('customers');
  const customers = await Customer.insertMany(customersData);
  const customerByClientId = new Map(customers.map((c) => [c.clientId, c]));
  logger.info(`[seed]   → ${customers.length} clients`);

  // 2. Users (avec rattachement au customer)
  logger.info('[seed] création des comptes utilisateurs…');
  const usersData = loadJson('users');
  const users = [];
  for (const u of usersData) {
    const passwordHash = await bcrypt.hash(u.password, env.bcryptRounds);
    const linkedCustomer = u.clientId ? customerByClientId.get(u.clientId) : null;
    
    // 🔧 CORRECTION : Empêcher les valeurs null dupliquées sur le champ unique `numeroAbonne`
    // (l'index unique `numeroAbonne_1` est présent dans la collection Users)
    let numeroAbonne;
    if (linkedCustomer) {
      // Pour un abonné, on utilise l'identifiant unique du client (clientId)
      // Si votre modèle Customer possède un champ `numeroAbonne`, remplacez par linkedCustomer.numeroAbonne
      numeroAbonne = linkedCustomer.clientId;
    } else {
      // Pour admin / agent : valeur unique générée pour éviter le `null` dupliqué
      numeroAbonne = `SYS_${u.role}_${u.email}`;
    }
    
    const user = await User.create({
      email: u.email,
      passwordHash,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone,
      role: u.role,
      customerId: linkedCustomer ? linkedCustomer._id : null,
      numeroAbonne, // ← champ désormais renseigné de manière unique
    });
    if (linkedCustomer) {
      linkedCustomer.userId = user._id;
      await linkedCustomer.save();
    }
    users.push(user);
  }
  logger.info(`[seed]   → ${users.length} utilisateurs`);

  // 3. Meters
  logger.info('[seed] création des compteurs…');
  const metersData = loadJson('meters');
  const meters = [];
  for (const m of metersData) {
    const customer = customerByClientId.get(m.clientId);
    if (!customer) continue;
    const created = await Meter.create({
      meterNumber: m.meterNumber,
      customerId: customer._id,
      label: m.label,
      tariffCategory: m.tariffCategory,
      contractedPower: m.contractedPower,
      address: m.address,
      status: 'active',
      installedAt: new Date(Date.now() - randInt(365, 1500) * 86400000),
    });
    meters.push({ doc: created, def: m });
  }
  logger.info(`[seed]   → ${meters.length} compteurs`);

  // 4. Invoices (12 mois par compteur) + anomalies + readings
  logger.info('[seed] génération des factures (12 mois × compteur)…');
  let invoiceSeq = 0;
  let totalInvoices = 0;
  let totalAnomalies = 0;
  let totalReadings = 0;

  for (const { doc: meter, def } of meters) {
    const series = buildMonthlySeries(def, 12);
    for (const s of series) {
      invoiceSeq += 1;
      const invoiceNumber = formatInvoiceNumber(meter, s.period, invoiceSeq);

      const inv = await invoiceService.createInvoice({
        invoiceNumber,
        meterId: meter._id,
        period: s.period,
        previousIndex: s.previousIndex,
        currentIndex: s.currentIndex,
        amountBilled: s.amountBilled,
        issueDate: s.issueDate,
        dueDate: s.dueDate,
        status: s.issueDate < new Date(Date.now() - 60 * 86400000) ? 'paid' : 'pending',
        source: 'SEED',
      });
      totalInvoices += 1;

      // Création d'un IndexReading source SEED correspondant
      await IndexReading.create({
        meterId: meter._id,
        customerId: meter.customerId,
        value: s.currentIndex,
        readingDate: s.issueDate,
        source: 'SEED',
      });
      totalReadings += 1;

      // Compte les anomalies créées (le service les a déjà détectées si applicables)
      const a = await Anomaly.countDocuments({ invoiceId: inv._id });
      totalAnomalies += a;
    }
  }
  logger.info(`[seed]   → ${totalInvoices} factures, ${totalReadings} relevés, ${totalAnomalies} anomalies détectées`);

  // 5. Claims
  logger.info('[seed] création des réclamations de démo…');
  const claimsData = loadJson('claims');
  let claimSeq = 0;
  for (const c of claimsData) {
    const customer = customerByClientId.get(c.clientId);
    if (!customer) continue;
    const customerMeters = meters.filter((x) => String(x.doc.customerId) === String(customer._id));
    const meter = customerMeters[c.meterIndex || 0]?.doc;

    claimSeq += 1;
    const claimNumber = `RCL-${new Date().getFullYear()}-${String(claimSeq).padStart(6, '0')}`;

    const submittedAt = new Date(Date.now() - c.ageDays * 86400000);
    const slaDueAt = new Date(submittedAt.getTime() + 7 * 86400000);

    const history = [{ status: 'submitted', note: 'Soumise par l\'abonné', at: submittedAt }];
    if (['received', 'investigating', 'transmitted_to_eneo', 'resolved'].includes(c.status)) {
      history.push({ status: 'received', note: 'Prise en compte par l\'équipe support', at: new Date(submittedAt.getTime() + 4 * 3600000) });
    }
    if (['investigating', 'transmitted_to_eneo', 'resolved'].includes(c.status)) {
      history.push({ status: 'investigating', note: 'Analyse en cours', at: new Date(submittedAt.getTime() + 12 * 3600000) });
    }
    if (['transmitted_to_eneo', 'resolved'].includes(c.status)) {
      history.push({ status: 'transmitted_to_eneo', note: 'Transmise à ENEO', at: new Date(submittedAt.getTime() + 24 * 3600000) });
    }
    if (c.status === 'resolved') {
      history.push({ status: 'resolved', note: c.resolution || 'Résolue', at: new Date(submittedAt.getTime() + 48 * 3600000) });
    }

    await Claim.create({
      claimNumber,
      customerId: customer._id,
      meterId: meter ? meter._id : null,
      type: c.type,
      title: c.title,
      description: c.description,
      priority: c.priority || 'medium',
      status: c.status,
      statusHistory: history,
      submittedAt,
      slaDueAt,
      resolvedAt: c.status === 'resolved' ? new Date(submittedAt.getTime() + 48 * 3600000) : null,
      resolution: c.resolution || '',
      eneoTransmissionRef: c.status === 'transmitted_to_eneo' || c.status === 'resolved' ? `ENEO-CL-${randInt(10000000, 99999999)}` : null,
    });
  }
  logger.info(`[seed]   → ${claimsData.length} réclamations`);

  // 6. Outages
  logger.info('[seed] création des signalements de coupures…');
  const outagesData = loadJson('outages');
  const subscribers = users.filter((u) => u.role === 'subscriber');
  for (const o of outagesData) {
    const reporter = subscribers[randInt(0, subscribers.length - 1)];
    const start = new Date(Date.now() - o.ageDays * 86400000);
    const end = o.status === 'resolved' ? new Date(start.getTime() + o.duration * 3600000) : null;
    await PowerOutage.create({
      region: o.region,
      city: o.city,
      neighborhood: o.neighborhood,
      startTime: start,
      endTime: end,
      status: o.status,
      confirmations: o.confirmations,
      confirmedByUserIds: subscribers.slice(0, Math.min(o.confirmations, subscribers.length)).map((u) => u._id),
      reporterUserId: reporter._id,
      description: 'Signalement issu de la communauté',
    });
  }
  logger.info(`[seed]   → ${outagesData.length} coupures`);

  // 7. Announcements
  logger.info('[seed] création des annonces…');
  const annData = loadJson('announcements');
  const admin = users.find((u) => u.role === 'admin');
  for (const a of annData) {
    await Announcement.create({ ...a, createdBy: admin._id });
  }
  logger.info(`[seed]   → ${annData.length} annonces`);

  // ---- Récapitulatif ----
  logger.info('');
  logger.info('═══════════════════════════════════════════════');
  logger.info('  ✓ Seed FactureChain terminé.');
  logger.info('═══════════════════════════════════════════════');
  logger.info('  Comptes de démo (mot de passe en clair) :');
  logger.info('    Admin     → admin@facturechain.cm        / Admin@2024');
  logger.info('    Agent     → agent@facturechain.cm        / Agent@2024');
  logger.info('    Abonné    → marie.atangana@example.cm    / Demo@2024');
  logger.info('    Abonné    → patrick.mbarga@example.cm    / Demo@2024');
  logger.info('    Abonné    → sandra.eboa@example.cm       / Demo@2024');
  logger.info('    Abonné    → francis.ngono@example.cm     / Demo@2024');
  logger.info('    Abonné    → rosine.fokou@example.cm      / Demo@2024');
  logger.info('    Abonné    → boris.ekane@example.cm       / Demo@2024');
  logger.info('═══════════════════════════════════════════════');

  await disconnectDatabase();
}

seed().catch(async (err) => {
  logger.error(`[seed] échec : ${err.stack || err.message}`);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});