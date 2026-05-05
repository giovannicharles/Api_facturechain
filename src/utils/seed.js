require('dotenv').config();
const { User, Facture, Reclamation } = require('../models');
const blockchainService = require('../services/blockchain.service');
const connectDB = require('../config/db');

const seed = async () => {
  await connectDB();
  console.log('Nettoyage de la base de donnees...');
  await Promise.all([User.deleteMany(), Facture.deleteMany(), Reclamation.deleteMany()]);

  // UTILISATEURS
  const users = await User.create([
    {
      email: 'demo@facturechain.cm',
      password: 'demo1234',
      prenom: 'Jean-Pierre',
      nom: 'Mbarga',
      numeroAbonne: 'ENEO-CM-00421',
      compteur: 'CMPT-YDE-4821',
      zone: 'Yaounde-Centre',
      telephone: '+237 699 123 456',
      role: 'ABONNE',
    },
    {
      email: 'admin@facturechain.cm',
      password: 'admin2025',
      prenom: 'Admin',
      nom: 'FactureChain',
      numeroAbonne: 'ENEO-CM-00001',
      compteur: 'CMPT-ADM-0001',
      zone: 'Yaounde-Centre',
      role: 'ADMIN',
    },
  ]);

  const demoUser = users[0];

  // FACTURES
  const facturesData = [
    { mois: 'Octobre 2024',  dateEmission: '2024-10-05', dateEcheance: '2024-10-20', consommation: 188, consommationReelle: 185, montant: 22400, statut: 'PAYEE' },
    { mois: 'Novembre 2024', dateEmission: '2024-11-05', dateEcheance: '2024-11-20', consommation: 210, consommationReelle: 195, montant: 24800, statut: 'PAYEE' },
    { mois: 'Decembre 2024', dateEmission: '2024-12-05', dateEcheance: '2024-12-20', consommation: 195, consommationReelle: 192, montant: 23100, statut: 'PAYEE' },
    { mois: 'Janvier 2025',  dateEmission: '2025-01-05', dateEcheance: '2025-01-20', consommation: 230, consommationReelle: 228, montant: 27200, statut: 'PAYEE' },
    { mois: 'Fevrier 2025',  dateEmission: '2025-02-05', dateEcheance: '2025-02-20', consommation: 185, consommationReelle: 183, montant: 21900, statut: 'NORMALE' },
    { mois: 'Mars 2025',     dateEmission: '2025-03-05', dateEcheance: '2025-03-20', consommation: 310, consommationReelle: 200, montant: 42000, statut: 'ANOMALIE' },
  ];

  const facturesToInsert = facturesData.map((fd, i) => {
    const reference = `ENEO-YDE-2025-00${42 + i}`;
    const rawData = { reference, periode: fd.mois, consommation: fd.consommation, consommationReelle: fd.consommationReelle, montant: fd.montant, dateEmission: fd.dateEmission, zone: 'Yaounde-Centre', numeroCompteur: 'CMPT-YDE-4821' };
    const hashBlockchain = blockchainService.hashFacture(rawData);
    const scoreConfiance = blockchainService.calculerScoreConfiance(fd.consommation, fd.consommationReelle);
    const anomalie = blockchainService.detecterAnomalie({ consommation: fd.consommation, consommationReelle: fd.consommationReelle, montant: fd.montant });
    return {
      reference,
      userId: demoUser._id,
      periode: fd.mois,
      dateEmission: new Date(fd.dateEmission),
      dateEcheance: new Date(fd.dateEcheance),
      consommation: fd.consommation,
      consommationReelle: fd.consommationReelle,
      montant: fd.montant,
      hashBlockchain,
      scoreConfiance,
      statut: fd.statut,
      ecartPourcentage: anomalie ? anomalie.ecartPourcentage : undefined,
      anomalieDetails: anomalie || undefined,
      zone: 'Yaounde-Centre',
      numeroCompteur: 'CMPT-YDE-4821',
      timestampBlockchain: new Date(),
    };
  });

  const createdFactures = await Facture.insertMany(facturesToInsert);
  const factureAnomalie = createdFactures[5];

  // RECLAMATION
  const cert = blockchainService.genererCertificat(factureAnomalie.hashBlockchain, `${demoUser._id}-demo`);
  await Reclamation.create({
    userId: demoUser._id,
    factureId: factureAnomalie._id,
    factureRef: factureAnomalie.reference,
    motif: 'Surfacturation — Consommation anormale',
    description: 'Facture de Mars 2025 indique 310 kWh alors que la blockchain enregistre 200 kWh. Ecart de 55%.',
    montantConteste: 18000,
    priorite: 'URGENTE',
    statut: 'EN_COURS',
    hashPreuveBlockchain: cert.hash,
    certBlockchain: { hash: cert.hash, timestamp: cert.timestamp, network: cert.network, transactionHash: cert.transactionHash },
    historique: [
      { date: new Date('2025-03-10'), statut: 'SOUMISE', commentaire: 'Reclamation soumise avec preuve blockchain.' },
      { date: new Date('2025-03-12'), statut: 'EN_COURS', commentaire: 'Prise en charge par service client ENEO.', agentNom: 'Agent ENEO #4521' },
    ],
  });

  console.log('Seed OK! — demo@facturechain.cm / demo1234');
  process.exit(0);
};

seed().catch(err => { console.error('Seed error:', err); process.exit(1); });
