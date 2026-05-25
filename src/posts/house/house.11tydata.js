const { normalizeLocation } = require('../../../lib/normalize');

module.exports = {
  layout: "layouts/rental_entry.njk",
  eleventyComputed: {
    imageAlt: (data) => `${data.bedrooms}-bedroom ${data.propertyType} in ${normalizeLocation(data.location)}`,
    description: (data) => `${data.price} грн/міс — ${data.bedrooms} кімн., ${data.bathrooms} ван. ${data.propertyType.toLowerCase()} в ${normalizeLocation(data.location)}. ${data.area} м². ${data.summary || ""}`,
    ogImage: (data) => data.image || false
  }
};
