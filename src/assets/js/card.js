function formatCardValue(post, fieldName) {
  var value = post[fieldName];
  if (value == null || value === '') return null;
  var schema = FIELDS_SCHEMA.fields[fieldName];
  if (!schema) return String(value);
  if (schema.render === 'translated') {
    var t = FIELDS_SCHEMA.translations ? FIELDS_SCHEMA.translations[value] : null;
    return t || String(value);
  }
  if (schema.render === 'boolean') {
    return value ? 'Так' : 'Ні';
  }
  var suffix = schema.suffix || '';
  return String(value) + suffix;
}

function renderCardLine(fieldNames, post) {
  var parts = [];
  for (var i = 0; i < fieldNames.length; i++) {
    var val = formatCardValue(post, fieldNames[i]);
    if (val !== null) parts.push(val);
  }
  return parts.join(' · ');
}

function placeholderSvg(post) {
  var colors = {
    "house": "#F0D7DF",
    "apartment": "#D7E8F0",
    "land": "#D7F0D7",
    "vehicle": "#F0E8D7",
    "equipment": "#E8D7F0"
  };
  var typeLabels = {
    "house": "Будинок",
    "apartment": "Квартира",
    "land": "Земельна ділянка",
    "vehicle": "Транспортний засіб",
    "equipment": "Обладнання"
  };
  var typeKey = REVERSE_MAP[post.propertyType] || post.propertyType;
  var bgColor = colors[typeKey] || "#E0E0E0";
  var typeLabel = typeLabels[typeKey] || "Нерухомість";
  var administrativeArea = post.administrativeArea || "";
  var aaLine = administrativeArea ? '<text x="480" y="320"><tspan x="480" dy="0">' + administrativeArea + '</tspan></text>' : "";
  return '<svg class="w-full m-0 rounded-t max-h-72 object-cover object-top" width="960" height="500" viewBox="0 0 960 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" focusable="false">' +
    '<rect width="100%" height="100%" fill="' + bgColor + '"/>' +
    '<g font-family="sans-serif" font-size="28" fill="#555" text-anchor="middle">' +
    '<text x="480" y="220"><tspan x="480" dy="0">Здається</tspan></text>' +
    '<text x="480" y="270" font-size="36" font-weight="bold" fill="#333"><tspan x="480" dy="0">' + typeLabel + '</tspan></text>' +
    aaLine +
    '</g></svg>';
}

function card(post, postUrl) {
  var typeKey = REVERSE_MAP[post.propertyType] || post.propertyType;
  var typeConfig = PROPERTY_TYPES[typeKey];
  if (!typeConfig || !typeConfig.card) {
    typeConfig = { card: { primary: [], secondary: [] } };
  }
  var cardCfg = typeConfig.card;

  var summary = "";
  if (Array.isArray(post.summary)) {
    summary = '<ul class="list-disc">';
    summary += post.summary
          .map(function(bulletPoint) { return '\n<li>\n\t\t' + bulletPoint + '\n\t</li>'; })
          .join("\n");
    summary += '\n</ul>';
  } else if (post.summary != null) {
    summary = '<p>' + post.summary + '</p>';
  }

  var primaryText = renderCardLine(cardCfg.primary || [], post);
  var secondaryText = renderCardLine(cardCfg.secondary || [], post);

  var imgHtml;
  if (post.image) {
    imgHtml = '<img class="w-full m-0 rounded-t lazy max-h-72 object-cover object-top card-thumbnail" src="' + post.image + '" width="960" height="500" alt="' + post.title + '">';
  } else {
    imgHtml = placeholderSvg(post);
  }

  return `
  <div class="postcard">
      <div class="rounded shadow-lg h-full bg-gray-50 hover:shadow-xl">
          <a href="${post.url}">
          ${imgHtml}
          </a>
          <div class="px-6 py-5">
              <div class="font-semibold text-lg mb-2">
                  <a class="text-gray-900 hover:text-gray-700" href="${post.url}">${post.title}</a>
              </div>
              <div class="text-xl font-bold text-teal-700 mb-2">Оплата ${post.price} гривень за місяць</div>
              <div class="my-5 flex flex-wrap justify-between">
                  <p class="text-gray-700 mb-1 max-w-2/5">${primaryText || '—'}</p>
                  <p class="text-gray-700 mb-1 max-w-3/5 break-words text-right">${secondaryText || '—'}</p>
              </div>
              ${summary}
          </div>
      </div>
  </div>
  `;
}
