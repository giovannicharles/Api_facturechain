const { Facture, Reclamation } = require('../models');

exports.getStatsZones = async (req, res) => {
  try {
    const zones = await Facture.aggregate([
      {
        $group: {
          _id: '$zone',
          totalFactures: { $sum: 1 },
          anomalies: { $sum: { $cond: [{ $eq: ['$statut', 'ANOMALIE'] }, 1, 0] } },
          montantConteste: { $sum: { $ifNull: ['$anomalieDetails.montantSurfacturation', 0] } },
        }
      },
      {
        $project: {
          zone: '$_id',
          _id: 0,
          totalFactures: 1,
          anomalies: 1,
          montantConteste: 1,
          tauxAnomalies: {
            $round: [{ $multiply: [{ $divide: ['$anomalies', '$totalFactures'] }, 100] }, 1]
          },
          ville: {
            $cond: [
              { $regexMatch: { input: '$_id', regex: /Yaoundé/i } },
              'Yaoundé',
              { $cond: [{ $regexMatch: { input: '$_id', regex: /Douala/i } }, 'Douala', 'Autre'] }
            ]
          }
        }
      },
      { $sort: { anomalies: -1 } },
      { $limit: 10 }
    ]);

    // Enrichir avec réclamations résolues
    const enriched = await Promise.all(zones.map(async z => {
      const reclamationsResolues = await Reclamation.countDocuments({
        statut: 'RESOLUE',
        factureRef: { $regex: z.zone, $options: 'i' }
      });
      return { ...z, reclamationsResolues };
    }));

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

exports.getDashboardPublic = async (req, res) => {
  try {
    const [totalFactures, anomalies, reclamationsResolues] = await Promise.all([
      Facture.countDocuments(),
      Facture.countDocuments({ statut: 'ANOMALIE' }),
      Reclamation.countDocuments({ statut: 'RESOLUE' }),
    ]);

    const economiesResult = await Reclamation.aggregate([
      { $match: { statut: 'RESOLUE' } },
      { $group: { _id: null, total: { $sum: '$montantRembourse' } } }
    ]);

    res.json({
      totalFactures,
      anomalies,
      reclamationsResolues,
      economiesTotal: economiesResult[0]?.total ?? 0,
      tauxAnomalies: totalFactures > 0 ? Math.round((anomalies / totalFactures) * 1000) / 10 : 0,
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
};
