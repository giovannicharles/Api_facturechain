const crypto = require('crypto');
const { ethers } = require('ethers');
require('dotenv').config();

// ABI du contrat – seules les fonctions utilisées
const CONTRACT_ABI = [
  "function enregistrerFacture(string memory _factureHash) public returns (bytes32)",
  "function certificats(bytes32) public view returns (string factureHash, uint256 timestamp, address sender)"
];

/**
 * Service Blockchain FactureChain
 * Gère le hachage SHA-256, détection d'anomalies, score de confiance
 * ET enregistrement réel sur Ethereum Sepolia
 */
class BlockchainService {
  constructor() {
    // Connexion à Sepolia
    this.provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
    this.contract = new ethers.Contract(
      process.env.BLOCKCHAIN_CONTRACT_ADDRESS,
      CONTRACT_ABI,
      this.wallet
    );
    this.network = process.env.BLOCKCHAIN_NETWORK || 'sepolia';
  }

  /**
   * Génère le hash SHA-256 d'une facture (inchangé)
   */
  hashFacture(facture) {
    const payload = JSON.stringify({
      reference: facture.reference,
      periode: facture.periode,
      consommation: facture.consommationReelle ?? facture.consommation,
      montantBase: facture.montant,
      dateEmission: facture.dateEmission,
      numeroCompteur: facture.numeroCompteur,
      zone: facture.zone,
    });
    return '0x' + crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Calcule le score de confiance (0-100) – inchangé
   */
  calculerScoreConfiance(consommationFacturee, consommationReelle) {
    if (!consommationReelle) return 100;
    const ecart = Math.abs((consommationFacturee - consommationReelle) / consommationReelle);
    if (ecart <= 0.05) return 98;
    if (ecart <= 0.10) return 90;
    if (ecart <= 0.20) return 75;
    if (ecart <= 0.35) return 55;
    if (ecart <= 0.50) return 35;
    return 15;
  }

  /**
   * Détecte une anomalie – inchangé
   */
  detecterAnomalie(facture) {
    const { consommation, consommationReelle, montant } = facture;
    if (!consommationReelle) return null;

    const ecartKwh = consommation - consommationReelle;
    const ecartPourcentage = (ecartKwh / consommationReelle) * 100;
    const seuilAnomalie = 20;

    if (Math.abs(ecartPourcentage) <= seuilAnomalie) return null;

    const montantSurfacturation = Math.round((ecartKwh / consommation) * montant);

    return {
      type: ecartKwh > 0 ? 'SURFACTURATION' : 'SOUS_FACTURATION',
      description: ecartKwh > 0
        ? `Consommation facturée (${consommation} kWh) supérieure à la consommation réelle (${consommationReelle} kWh)`
        : `Consommation facturée (${consommation} kWh) inférieure à la consommation réelle (${consommationReelle} kWh)`,
      ecartKwh: Math.abs(ecartKwh),
      ecartPourcentage: Math.round(Math.abs(ecartPourcentage)),
      montantSurfacturation,
    };
  }

  /**
   * Enregistre VRAIMENT le hash sur la blockchain Sepolia
   * Retourne un certificat avec les preuves de la transaction
   */
  async genererCertificat(factureHash, reclamationId) {
    try {
      // 1. Envoi de la transaction au contrat
      const tx = await this.contract.enregistrerFacture(factureHash);
      // 2. Attente d'une confirmation (bloc)
      const receipt = await tx.wait(1);

      // 3. Récupération de l'événement pour obtenir l'identifiant on-chain
      const event = receipt.logs
        .map(log => {
          try {
            return this.contract.interface.parseLog(log);
          } catch (e) {
            return null;
          }
        })
        .find(event => event && event.name === 'FactureEnregistree');

      const onChainId = event ? event.args.id : null;

      // 4. Construction du certificat avec les vraies données blockchain
      const certificat = {
        hash: onChainId ? onChainId : tx.hash,
        factureHash,
        reclamationId,
        timestamp: new Date(),
        network: this.network,
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        contractAddress: this.contract.target,
        from: this.wallet.address,
        valeurLegale: true,
        message: 'Ce certificat constitue une preuve légale recevable auprès de l\'ARSEL et de tout tribunal compétent.',
      };

      return certificat;
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement sur la blockchain :', error);
      throw new Error(`Échec de l'enregistrement sur la blockchain : ${error.message}`);
    }
  }
}

module.exports = new BlockchainService();