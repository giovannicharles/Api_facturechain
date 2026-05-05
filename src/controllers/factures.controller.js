const { Facture, Notification } = require('../models');
const blockchainService = require('../services/blockchain.service');

exports.getFactures = async (req, res) => {
  try {
    const { page = 1, limit = 10, statut } = req.query;
    const filter = { userId: req.user._id };
    if (statut && statut !== 'ALL') filter.statut = statut;

    const total = await Facture.countDocuments(filter);
    const data = await Facture.find(filter)
      .sort({ dateEmission: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    res.json({ data, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

exports.getFacture = async (req, res) => {
  try {
    const facture = await Facture.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!facture) return res.status(404).json({ message: 'Facture introuvable' });
    res.json(facture);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

exports.verifyFacture = async (req, res) => {
  try {
    const facture = await Facture.findOne({ reference: req.params.reference }).lean();
    if (!facture) return res.status(404).json({ message: 'Facture introuvable sur la blockchain' });
    res.json(facture);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Admin — créer une facture (simule l'import depuis ENEO)
exports.createFacture = async (req, res) => {
  try {
    const { reference, userId, periode, dateEmission, dateEcheance, consommation, consommationReelle, montant, zone, numeroCompteur } = req.body;

    // Calcul blockchain
    const factureData = { reference, periode, consommation, consommationReelle, montant, dateEmission, zone, numeroCompteur };
    const hashBlockchain = blockchainService.hashFacture(factureData);
    const scoreConfiance = blockchainService.calculerScoreConfiance(consommation, consommationReelle);
    const anomalie = blockchainService.detecterAnomalie({ consommation, consommationReelle, montant });

    const facture = await Facture.create({
      reference, userId, periode, dateEmission, dateEcheance,
      consommation, consommationReelle, montant, zone, numeroCompteur,
      hashBlockchain, scoreConfiance,
      statut: anomalie ? 'ANOMALIE' : 'NORMALE',
      ecartPourcentage: anomalie?.ecartPourcentage,
      anomalieDetails: anomalie ?? undefined,
      timestampBlockchain: new Date(),
    });

    // Notifier l'abonné si anomalie
    if (anomalie) {
      await Notification.create({
        userId,
        type: 'ANOMALIE',
        titre: '⚠ Anomalie détectée sur votre facture',
        message: `Votre facture ${reference} (${periode}) présente une anomalie de ${anomalie.ecartPourcentage}%. Vous pouvez déposer une réclamation.`,
        data: { factureId: facture._id, reference },
      });
    }

    res.status(201).json(facture);
  } catch (err) {
    console.error(err);
    if (err.code === 11000) return res.status(409).json({ message: 'Référence de facture déjà existante' });
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user._id;
    const [totalFactures, anomaliesDetectees, reclamationsEnCours, evolutionRaw] = await Promise.all([
      Facture.countDocuments({ userId }),
      Facture.countDocuments({ userId, statut: 'ANOMALIE' }),
      require('../models').Reclamation.countDocuments({ userId, statut: { $in: ['SOUMISE', 'EN_COURS'] } }),
      Facture.find({ userId }).sort({ dateEmission: -1 }).limit(6).lean(),
    ]);

    const derniereFacture = evolutionRaw[0] ?? null;
    const economiesRealisees = await require('../models').Reclamation.aggregate([
      { $match: { userId, statut: 'RESOLUE' } },
      { $group: { _id: null, total: { $sum: '$montantRembourse' } } }
    ]).then(r => r[0]?.total ?? 0);

    const evolutionConso = evolutionRaw.reverse().map(f => ({
      mois: new Date(f.dateEmission).toLocaleDateString('fr-CM', { month: 'short' }),
      conso: f.consommation,
      montant: f.montant,
    }));

    res.json({
      totalFactures,
      anomaliesDetectees,
      reclamationsEnCours,
      economiesRealisees,
      tauxAnomalies: totalFactures > 0 ? Math.round((anomaliesDetectees / totalFactures) * 100 * 10) / 10 : 0,
      derniereFacture,
      evolutionConso,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};
