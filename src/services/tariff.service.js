/**
 * Service de tarification ENEO.
 *
 * AVERTISSEMENT — les tarifs ci-dessous sont des valeurs RÉALISTES et plausibles
 * basées sur la grille tarifaire BT résidentielle ENEO (publique). Ils doivent
 * être validés et mis à jour avant toute exploitation réelle.
 *
 * Source de référence à confirmer : grille tarifaire ENEO en vigueur.
 */

const VAT_RATE = 0.1925; // TVA 19.25 % au Cameroun

/**
 * Tranches BT résidentielles (FCFA / kWh).
 * 0–110 kWh   : tarif social
 * 111–400 kWh : tranche normale
 * 401–800 kWh : tranche moyenne
 * 801+ kWh    : tranche élevée
 */
const TARIFF_GRID = {
  BT_SOCIAL: {
    fixedFee: 0,
    tiers: [{ upTo: Infinity, price: 50 }],
  },
  BT_RESIDENTIAL: {
    fixedFee: 700, // redevance fixe mensuelle
    tiers: [
      { upTo: 110, price: 50 },
      { upTo: 400, price: 79 },
      { upTo: 800, price: 94 },
      { upTo: Infinity, price: 99 },
    ],
  },
  BT_PROFESSIONAL: {
    fixedFee: 2500,
    tiers: [{ upTo: Infinity, price: 99 }],
  },
  MT_INDUSTRIAL: {
    fixedFee: 8000,
    tiers: [{ upTo: Infinity, price: 75 }],
  },
};

/**
 * Calcule le détail d'une facture pour une consommation donnée et une catégorie tarifaire.
 * @returns { breakdown, fixedFee, taxes, total, energyHT }
 */
function computeInvoiceAmount(consumptionKwh, tariffCategory = 'BT_RESIDENTIAL') {
  const grid = TARIFF_GRID[tariffCategory] || TARIFF_GRID.BT_RESIDENTIAL;
  const breakdown = [];

  let remaining = Math.max(0, Math.round(consumptionKwh));
  let lowerBound = 0;
  let energyHT = 0;

  for (const tier of grid.tiers) {
    if (remaining <= 0) break;
    const tierCapacity = tier.upTo - lowerBound;
    const qty = Math.min(remaining, tierCapacity);
    if (qty > 0) {
      const amount = qty * tier.price;
      breakdown.push({
        label:
          tier.upTo === Infinity
            ? `Tranche au-delà de ${lowerBound} kWh`
            : `Tranche ${lowerBound + 1}–${tier.upTo} kWh`,
        quantity: qty,
        unitPrice: tier.price,
        amount,
      });
      energyHT += amount;
      remaining -= qty;
      lowerBound = tier.upTo;
    } else {
      lowerBound = tier.upTo;
    }
  }

  const fixedFee = grid.fixedFee;
  const subtotal = energyHT + fixedFee;
  const taxes = Math.round(subtotal * VAT_RATE);
  const total = subtotal + taxes;

  if (fixedFee > 0) {
    breakdown.push({ label: 'Redevance fixe mensuelle', quantity: 1, unitPrice: fixedFee, amount: fixedFee });
  }
  breakdown.push({
    label: `TVA (${(VAT_RATE * 100).toFixed(2)}%)`,
    quantity: 1,
    unitPrice: taxes,
    amount: taxes,
  });

  return { breakdown, fixedFee, taxes, total, energyHT };
}

module.exports = {
  computeInvoiceAmount,
  TARIFF_GRID,
  VAT_RATE,
};
