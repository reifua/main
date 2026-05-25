const path = require('path');
const dbFields = require(path.join(__dirname, '../_data/db_fields.json'));
const { normalizeLocation, normalizePrice } = require(path.join(__dirname, '../../lib/normalize'));

module.exports = {
  eleventyComputed: {
    administrativeArea: (data) => {
      const loc = data.location;
      if (!loc) return '';
      if (typeof loc === 'string') return loc.split(',')[0].trim();
      if (typeof loc === 'object') return loc.administrativeArea || '';
      return '';
    },
    price: (data) => normalizePrice(data.price),
    permalink: (data) => `${data.page.filePathStem.replace('/posts/', '')}/index.html`,
    _pageData: (data) => {
      const result = {};
      for (const f of dbFields) {
        if (f === 'location') {
          result[f] = normalizeLocation(data[f]);
        } else if (f === 'price') {
          result[f] = normalizePrice(data[f]);
        } else {
          result[f] = data[f];
        }
      }
      return result;
    }
  }
};
