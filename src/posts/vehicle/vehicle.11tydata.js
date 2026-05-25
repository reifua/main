const { normalizeLocation } = require('../../../lib/normalize');

module.exports = {
  layout: "layouts/rental_entry.njk",
  eleventyComputed: {
    imageAlt: (data) => `${data.year} ${data.make} ${data.model} in ${normalizeLocation(data.location)}`,
    description: (data) => `${data.price} грн/міс — ${data.year} ${data.make} ${data.model}, ${data.mileage} км в ${normalizeLocation(data.location)}. ${data.summary || ""}`,
    ogImage: (data) => data.image || false
  }
};
