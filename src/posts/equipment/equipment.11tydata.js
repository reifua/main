const { normalizeLocation } = require('../../../lib/normalize');

module.exports = {
  layout: "layouts/rental_entry.njk",
  eleventyComputed: {
    imageAlt: (data) => `${data.brand} ${data.model} ${data.equipmentType} in ${normalizeLocation(data.location)}`,
    description: (data) => `${data.price} грн/міс — ${data.brand} ${data.model} ${data.equipmentType} в ${normalizeLocation(data.location)}. ${data.summary || ""}`,
    ogImage: (data) => data.image || false
  }
};
