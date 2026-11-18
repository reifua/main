import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import formEngine from '@realtyua/form-engine/adapters/eleventy/lib/form-engine.js';

import site from './src/_data/site.js';
import normalize from './lib/normalize.js';
import readableDate from './lib/filters/readableDate.js';
import minifyJs from './lib/filters/minifyJs.js';
import minifyHtml from './lib/transforms/minifyHtml.js';
import posts from './lib/collections/posts.js';
import tagList from './lib/collections/tagList.js';
import pagedPosts from './lib/collections/pagedPosts.js';
import pagedPostsByTag from './lib/collections/pagedPostsByTag.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default (config) => {
  config.setDataDeepMerge(true);

  config.addPassthroughCopy('src/assets/img/**/*');
  config.addPassthroughCopy({ 'src/posts/img/**/*': 'assets/img/' });

  config.addPassthroughCopy('src/assets/svg/');
  config.addPassthroughCopy('src/assets/data/');

  // Bootstrap 4 stylesheet for the one page that renders `theme: bootstrap4`
  // (src/new.njk). The engine skin ships inline with the baked fragment; the
  // grid, form-control and component look comes from this file.
  config.addPassthroughCopy('src/assets/vendor/bootstrap4.css');

  // Leaflet marker/layer sprites. leaflet.js and leaflet.css are inlined into
  // the baked form fragment (see @realtyua/form-engine eleventy adapter), but
  // the CSS references url(images/...) and doInitMap sets L.Icon.Default.imagePath
  // to /assets/css/images/, so the PNGs have to ship as static files.
  config.addPassthroughCopy('src/assets/css/images/**/*');

  // FormEngine runtime from npm package: ES modules loaded directly by the baked
  // page via <script type="module">. The single entry is assets/js/form-engine/app.js.
  config.addPassthroughCopy({
    'node_modules/@realtyua/form-engine/runtime': 'assets/js/form-engine',
  });

  config.addWatchTarget('src/assets/js/');

  // Bake forms/<name>.yml into fragments and expose them as {% formApp "name" %}.
  // Pass site/dirs/engineDir so the async adapter has no await points and registers
  // shortcodes/hooks synchronously.
  formEngine(config, {
    site,
    siteDir: __dirname,
    dataDir: path.join(__dirname, 'src', '_data'),
    engineDir: path.join(__dirname, 'node_modules', '@realtyua', 'form-engine', 'runtime'),
  });

  config.addLayoutAlias('default', 'layouts/default.njk');
  config.addLayoutAlias('post', 'layouts/post.njk');

  const { normalizeLocation, normalizePrice } = normalize;
  config.addFilter('readableDate', readableDate);
  config.addFilter('minifyJs', minifyJs);
  config.addNunjucksFilter('normalizeLocation', (loc) => normalizeLocation(loc));
  config.addNunjucksFilter('normalizePrice', (price) => normalizePrice(price));

  config.addTransform('minifyHtml', minifyHtml);

  config.addCollection('posts', posts);
  config.addCollection('tagList', tagList);
  config.addCollection('pagedPosts', pagedPosts);
  config.addCollection('pagedPostsByTag', pagedPostsByTag);

  // The difference between `uniq` and `unique` is that the former assumes the input collection
  // is already sorted, which lets it drop the duplicates in a more efficient way.
  config.addNunjucksFilter('uniq', sortedColl => sortedColl.filter(function(item, pos, ar) {
        if (pos === 0) { return true; }
        return item != ar[pos - 1];
      }));
  config.addNunjucksFilter('unique', coll => [...new Set(coll)]);
  config.addNunjucksFilter('flatten', coll => coll.flat());
  config.addNunjucksFilter('mapToDbField', (coll, dbField) => coll.map(x => {
    const val = x.data[dbField];
    if (dbField === 'location' && typeof val === 'object') {
      return normalizeLocation(val);
    }
    return val;
  }));
  config.addNunjucksFilter('compact', arr => arr.filter(x => x != null && x !== ''));
  config.addNunjucksFilter('oxfordJoin', coll => coll.length < 2 ? coll.join(', ') : coll.slice(0, -1).join(', ') + ', and ' + coll[coll.length-1]);
  config.addNunjucksFilter('isArray', coll => Array.isArray(coll));
  const i18n = JSON.parse(readFileSync(path.join(__dirname, 'src', '_data', 'i18n.json'), 'utf8'));
  const reverseI18n = Object.fromEntries(Object.entries(i18n).map(([k, v]) => [v, k]));
  config.addNunjucksFilter('t', function(value) { return i18n[value] || value; });
  config.addNunjucksFilter('reverseT', function(value) { return reverseI18n[value] || value; });
  config.addNunjucksFilter('slugify', function(value) {
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

  // JSON stringify with </script> escaping for safe use in <script type="application/json"> islands.
  config.addNunjucksFilter('jsonify', function(value) {
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  });

  config.addShortcode('currentYear', () => `${new Date().getFullYear()}`);

  config.setQuietMode(true);

  // Serve GitHub Pages site from a custom domain
  config.addPassthroughCopy('CNAME');

  return {
    dir: {
      input: 'src',
      output: 'dist'
    },
    pathPrefix: '/',
    templateFormats: ['md', 'njk', 'html'],
    dataTemplateEngine: 'njk',
    markdownTemplateEngine: 'njk'
  };
};
