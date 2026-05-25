function slugify(str) {
  if (typeof str !== 'string') return '';
  var map = {
    'а':'a','б':'b','в':'v','г':'h','ґ':'g','д':'d','е':'e','є':'ie','ж':'zh',
    'з':'z','и':'y','і':'i','ї':'i','й':'i','к':'k','л':'l','м':'m','н':'n',
    'о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts',
    'ч':'ch','ш':'sh','щ':'shch','ь':'','ю':'iu','я':'ia',
    'А':'a','Б':'b','В':'v','Г':'h','Ґ':'g','Д':'d','Е':'e','Є':'ie','Ж':'zh',
    'З':'z','И':'y','І':'i','Ї':'i','Й':'i','К':'k','Л':'l','М':'m','Н':'n',
    'О':'o','П':'p','Р':'r','С':'s','Т':'t','У':'u','Ф':'f','Х':'kh','Ц':'ts',
    'Ч':'ch','Ш':'sh','Щ':'shch','Ь':'','Ю':'iu','Я':'ia'
  };
  return str.replace(/['«»,.—]/g, '').replace(/\s+/g, '-').split('').map(function(c) { return map[c] || c; }).join('').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

async function getRentalsJSON() {
    return fetch("{{ '/rentals_metadata.json' | url }}").then(res => res.json());
}

function isRentalConforming(query, rentalData) {
  for (const [queryKey, value] of query) {
    if (value.includes("-") && value.split("-").every(s => !isNaN(Number(s)) && s !== "")) {
      let lowerbound, upperbound;
      [lowerbound, upperbound] = value.split("-").map(Number);
      if (isNaN(lowerbound)) continue;
      if (upperbound === undefined && !isNaN(lowerbound)) {
        upperbound = lowerbound;
      }
      const numericValue = Number(rentalData[queryKey]);
      if (isNaN(numericValue)) continue;
      if (!(lowerbound <= numericValue && numericValue <= upperbound)) {
        return false;
      }
    } else if (rentalData[queryKey] instanceof Array) {
        const selectedValues = value.split(",");
        const mappedSelected = selectedValues.map(v => VALUE_MAP[v] || v);
        if (!mappedSelected.some(x => new Set(rentalData[queryKey]).has(x))) {
            return false;
        }

    } else if (queryKey === "search") {
        let isConformingToTypedSearch = (word) => ["title", "location", "summary"]
            .map(fieldN => rentalData[fieldN] && String(rentalData[fieldN]).toLowerCase().indexOf(word.toLowerCase()) !== -1)
            .some(Boolean);
        if (!value.split(" ").every(isConformingToTypedSearch)) {
            return false;
        }
    } else {
      const mappedValue = VALUE_MAP[value] || value;
      if (rentalData[queryKey] !== mappedValue && rentalData[queryKey] !== (mappedValue === "true") && slugify(String(rentalData[queryKey])) !== mappedValue) {
        return false;
      }
    }
  }
  return true;
}

async function getFilteredRentals() {
    const searchParams = new URLSearchParams(location.search);
    return getRentalsJSON().then(rentalsJSON => rentalsJSON.filter(rental => isRentalConforming(searchParams, rental)));
}

async function populateRentalGrid(filteredRentals) {
    const postGrid = $("post-grid");
    postGrid.innerHTML = "";
    const postsPerPage = {{ site.paginate }};
    const pageNo = Number((location.pathname.match(/page\/([0-9]+)/) || ["page/1", "1"])[1]);
    const offset = (pageNo - 1) * postsPerPage;
    const slicedRentals = filteredRentals.slice(offset, offset+postsPerPage);
    if (filteredRentals.length === 0) {
        $("showing-n-results").innerText = "Нічого не знайдено.";
    } else if (offset < filteredRentals.length) {
      $("showing-n-results").innerText = `Показано ${offset + 1}–${Math.min(offset + postsPerPage, filteredRentals.length)} із ${filteredRentals.length} результатів.`;
    } else {
      $("showing-n-results").innerText = `Показано 0–0 із ${filteredRentals.length} результатів.`;
      const amountOfPages = Math.ceil(filteredRentals.length/postsPerPage);
      if (amountOfPages === 1) {
          $("showing-n-results").innerText += ` Для цього пошуку є лише 1 сторінка, а не ${pageNo}.`;
      } else {
          $("showing-n-results").innerText += ` Для цього пошуку є лише ${amountOfPages} сторінок, а не ${pageNo}.`;
      }
    }
    syncPaginationButtons();
    for (const post of slicedRentals) {
      postGrid.innerHTML += card(post, post.url);
    }
}

const pageRegExp = new RegExp("{{ '/page/' | url }}[0-9]+");
if (location.pathname === "{{'/' | url }}" || pageRegExp.test(location.pathname)) {
    getFilteredRentals().then(filteredRentals => populateRentalGrid(filteredRentals));
}
