const path = require('path');
const addressFields = require(path.join(__dirname, '../src/_data/address_fields.json'));

const CONVERSION_RATES = {
  usd: 40,
  eur: 45
};

function normalizeLocation(loc) {
  if (!loc) return '';
  if (typeof loc === 'string') return loc;
  if (typeof loc === 'object') {
    const parts = addressFields.map(f => loc[f]).filter(v => v != null && v !== '');
    return parts.length ? parts.join(', ') : '';
  }
  return String(loc);
}

function normalizePrice(price) {
  if (!price && price !== 0) return 0;
  if (typeof price === 'number') {
    return Math.round(price * CONVERSION_RATES.usd);
  }
  if (typeof price === 'object') {
    if (price.uah) return price.uah;
    if (price.eur) return Math.round(price.eur * CONVERSION_RATES.eur);
    if (price.usd) return Math.round(price.usd * CONVERSION_RATES.usd);
  }
  return 0;
}

module.exports = { normalizeLocation, normalizePrice, CONVERSION_RATES };
