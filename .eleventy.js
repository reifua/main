const pluginTailwind = require('eleventy-plugin-tailwindcss');

module.exports = (config) => {
  config.addPlugin(pluginTailwind, {
    src: 'src/assets/css/*',
    // excludeNonCssFiles is bugged in 
    // eleventy-plugin-tailwindcss@0.3.0 (git+ssh://git@github.com/dafiulh/eleventy-plugin-tailwindcss.git#c8b8d4d7419e2f5fcf4483b8556cce163bd4d0a9).
    // See https://github.com/dafiulh/eleventy-plugin-tailwindcss/pull/34
    excludeNonCssFiles: false
  });

  config.setDataDeepMerge(true);

  config.addPassthroughCopy('src/assets/img/**/*');
  config.addPassthroughCopy({ 'src/posts/img/**/*': 'assets/img/' });

  config.addPassthroughCopy('src/assets/svg/');

  config.addWatchTarget("src/assets/js/");

  config.addLayoutAlias('default', 'layouts/default.njk');
  config.addLayoutAlias('post', 'layouts/post.njk');

  const { normalizeLocation, normalizePrice } = require('./lib/normalize');
  config.addFilter('readableDate', require('./lib/filters/readableDate'));
  config.addFilter('minifyJs', require('./lib/filters/minifyJs'));
  config.addNunjucksFilter("normalizeLocation", (loc) => normalizeLocation(loc));
  config.addNunjucksFilter("normalizePrice", (price) => normalizePrice(price));

  config.addTransform('minifyHtml', require('./lib/transforms/minifyHtml'));

  config.addCollection('posts', require('./lib/collections/posts'));
  config.addCollection('tagList', require('./lib/collections/tagList'));
  config.addCollection('pagedPosts', require('./lib/collections/pagedPosts'));
  config.addCollection('pagedPostsByTag', require('./lib/collections/pagedPostsByTag'));

  // The difference between `uniq` and `unique` is that the former assumes the input collection
  // is already sorted, which lets it drop the duplicates in a more efficient way.
  config.addNunjucksFilter("uniq", sortedColl => sortedColl.filter(function(item, pos, ar) {
        if (pos === 0) { return true; }
        return item != ar[pos - 1];
      }));
  config.addNunjucksFilter("unique", coll => [...new Set(coll)]);
  config.addNunjucksFilter("flatten", coll => coll.flat());
  config.addNunjucksFilter("mapToDbField", (coll, dbField) => coll.map(x => {
    const val = x.data[dbField];
    if (dbField === 'location' && typeof val === 'object') {
      return normalizeLocation(val);
    }
    return val;
  }));
  config.addNunjucksFilter("compact", arr => arr.filter(x => x != null && x !== ''));
  config.addNunjucksFilter("oxfordJoin", coll => coll.length < 2 ? coll.join(", ") : coll.slice(0, -1).join(", ") + ", and " + coll[coll.length-1]);
  config.addNunjucksFilter("isArray", coll => Array.isArray(coll));
  const i18n = require('./src/_data/i18n.json');
  const reverseI18n = Object.fromEntries(Object.entries(i18n).map(([k, v]) => [v, k]));
  config.addNunjucksFilter("t", function(value) { return i18n[value] || value; });
  config.addNunjucksFilter("reverseT", function(value) { return reverseI18n[value] || value; });
  config.addNunjucksFilter("slugify", function(value) {
    if (typeof value !== 'string') return '';
    const map = {
      'а':'a','б':'b','в':'v','г':'h','ґ':'g','д':'d','е':'e','є':'ie','ж':'zh',
      'з':'z','и':'y','і':'i','ї':'i','й':'i','к':'k','л':'l','м':'m','н':'n',
      'о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts',
      'ч':'ch','ш':'sh','щ':'shch','ь':'','ю':'iu','я':'ia',
      'А':'a','Б':'b','В':'v','Г':'h','Ґ':'g','Д':'d','Е':'e','Є':'ie','Ж':'zh',
      'З':'z','И':'y','І':'i','Ї':'i','Й':'i','К':'k','Л':'l','М':'m','Н':'n',
      'О':'o','П':'p','Р':'r','С':'s','Т':'t','У':'u','Ф':'f','Х':'kh','Ц':'ts',
      'Ч':'ch','Ш':'sh','Щ':'shch','Ь':'','Ю':'iu','Я':'ia'
    };
    return value.replace(/['«»,.—]/g, '').replace(/\s+/g, '-').split('').map(c => map[c] || c).join('').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  });

  config.addShortcode("currentYear", () => `${new Date().getFullYear()}`);

  config.setQuietMode(true);

  // Serve GitHub Pages site from a custom domain
  config.addPassthroughCopy("CNAME");

  return {
    dir: {
      input: 'src',
      output: 'dist'
    },
    pathPrefix: "/",
    templateFormats: ['md', 'njk', 'html'],
    dataTemplateEngine: 'njk',
    markdownTemplateEngine: 'njk'
  };
};
