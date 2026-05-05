const { Reclamation, Facture, Notification } = require('../models');
const blockchainService = require('../services/blockchain.service');

// Broadcast WebSocket (injecté depuis server.js)
let wsBroadcast = null;
exports.setWsBroadcast = (fn) => { wsBroadcast = fn; };

exports.getReclamations = async (req, res) => {
  try {
    const reclamations = await Reclamation.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json(reclamations);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

exports.getReclamation = async (req, res) => {
  try {
    const r = await Reclamation.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!r) return res.status(404).json({ message: 'Réclamation introuvable' });
    res.json(r);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

exports.createReclamation = async (req, res) => {
  try {
    const { factureRef, motif, description, montantConteste, priorite } = req.body;

    // Trouver la facture
    const facture = await Facture.findOne({ reference: factureRef, userId: req.user._id });
    if (!facture) return res.status(404).json({ message: 'Facture introuvable ou non autorisée' });

    // Preuves uploadées sur Cloudinary (via multer middleware)
    const preuves = (req.files ?? []).map(f => ({
      url: f.path,
      publicId: f.filename,
      type: f.mimetype.startsWith('image') ? 'image' : 'pdf',
      nom: f.originalname,
    }));

    // Certificat blockchain
    const hashPreuve = blockchainService.hashFacture(facture.toObject());
    const certBlockchain =await blockchainService.genererCertificat(hashPreuve, `${req.user._id}-${Date.now()}`);

    const reclamation = await Reclamation.create({
      userId: req.user._id,
      factureId: facture._id,
      factureRef,
      motif,
      description,
      montantConteste: Number(montantConteste) || 0,
      priorite: priorite || 'NORMALE',
      statut: 'SOUMISE',
      preuves,
      hashPreuveBlockchain: certBlockchain.hash,
      certBlockchain: {
        hash: certBlockchain.hash,
        timestamp: certBlockchain.timestamp,
        network: certBlockchain.network,
        transactionHash: certBlockchain.transactionHash,
      },
      historique: [{
        statut: 'SOUMISE',
        commentaire: `Réclamation soumise via FactureChain. Hash blockchain : ${certBlockchain.hash}`,
      }],
    });

    // Mise à jour statut facture
    await Facture.findByIdAndUpdate(facture._id, { statut: 'CONTESTEE' });

    // Notification
    await Notification.create({
      userId: req.user._id,
      type: 'RECLAMATION_UPDATE',
      titre: '📤 Réclamation soumise',
      message: `Votre réclamation ${reclamation.numero} a été enregistrée sur la blockchain.`,
      data: { reclamationId: reclamation._id },
    });

    // Broadcast WebSocket
    if (wsBroadcast) {
      wsBroadcast(req.user._id.toString(), {
        type: 'RECLAMATION_UPDATE',
        payload: {
          reclamationId: reclamation._id,
          numero: reclamation.numero,
          statut: 'SOUMISE',
          message: 'Réclamation enregistrée sur la blockchain',
        }
      });
    }

    res.status(201).json(reclamation);
  } catch (err) {
    console.error('Create reclamation error:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Agent ENEO — mettre à jour le statut
exports.updateStatut = async (req, res) => {
  try {
    const { statut, commentaire, montantRembourse } = req.body;
    const reclamation = await Reclamation.findById(req.params.id);
    if (!reclamation) return res.status(404).json({ message: 'Réclamation introuvable' });

    reclamation.statut = statut;
    reclamation.historique.push({
      statut,
      commentaire,
      agentNom: `${req.user.prenom} ${req.user.nom}`,
      agentId: req.user._id,
    });

    if (statut === 'RESOLUE') {
      reclamation.dateResolution = new Date();
      reclamation.montantRembourse = montantRembourse || 0;
      await Facture.findByIdAndUpdate(reclamation.factureId, { statut: 'NORMALE' });
    }

    await reclamation.save();

    await Notification.create({
      userId: reclamation.userId,
      type: 'RECLAMATION_UPDATE',
      titre: `Réclamation ${reclamation.numero} mise à jour`,
      message: `Statut : ${statut}. ${commentaire}`,
      data: { reclamationId: reclamation._id },
    });

    if (wsBroadcast) {
      wsBroadcast(reclamation.userId.toString(), {
        type: 'RECLAMATION_UPDATE',
        payload: { reclamationId: reclamation._id, numero: reclamation.numero, statut, commentaire }
      });
    }

    res.json(reclamation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};
