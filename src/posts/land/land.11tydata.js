const { normalizeLocation } = require('../../../lib/normalize');

module.exports = {
  layout: "layouts/rental_entry.njk",
  eleventyComputed: {
    imageAlt: (data) => `${data.area}-acre ${data.propertyType} in ${normalizeLocation(data.location)}`,
    description: (data) => `${data.price} грн/міс — ${data.area} соток ${data.propertyType.toLowerCase()} в ${normalizeLocation(data.location)}. ${data.summary || ""}`,
    ogImage: (data) => data.image || false
  }
};
