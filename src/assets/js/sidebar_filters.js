function isSliderMinMaxed(slider) {
    return slider.get().length >= 2 && slider.options.range.min === slider.get().at(0) && slider.options.range.max === slider.get().at(-1);
}

function isCheckable(element) {
    return element.type === "radio" || element.type === "checkbox";
}
function getElementValue(element) {
    if (element instanceof HTMLSelectElement) {
       return Array.from(element.options).filter(option => option.selected).map(option => option.value).toString();
    }
    if (element instanceof HTMLInputElement && element.hasAttribute("type")) {
        if (element.type === "checkbox") {
            return Array.from(document.querySelectorAll(`input[name=${element.name}]:checked`)).map(option => option.value).toString();
        } else if (element.type === "text") {
            return element.value;
        }
    }
    if ("noUiSlider" in element) {
        return element.noUiSlider.get().join("-");
    }
    return element.getAttribute("value");
}

function updateUrlSearchParams(element) {
    const urlSearchParams = new URLSearchParams(location.search);
    const value = getElementValue(element);
    const name = element.getAttribute("name");
    if (value === "" || ("noUiSlider" in element && isSliderMinMaxed(element.noUiSlider))) {
        urlSearchParams.delete(name);
    } else if (isCheckable(element) && urlSearchParams.get(name) === value) {
        element.checked = false;
        urlSearchParams.delete(name);
    } else {
        urlSearchParams.set(name, value);
    }
    const isIteratorEmpty = urlSearchParams.keys().next().done;
    if (isIteratorEmpty) {
        history.pushState({}, "", "{{ '/' | url }}");
    } else {
        history.pushState({}, "", "{{ '/' | url }}" + "?" + urlSearchParams);
    }
    syncSidebarFilters();
    syncPaginationButtons();
}

function flipPages(relativeOffset) {
    const pageNo = Number((location.pathname.match(/page\/([0-9]+)/) || ["page/1", "1"])[1]);
    const newPageNo = pageNo + relativeOffset;
    if (newPageNo <= 1) {
        return "{{ '/' | url }}";
    } else {
        return "{{ '/' | url }}" + "page/" + newPageNo;
    }
}

function showPaginationButton(button, relativeOffset, search) {
    button.href = flipPages(relativeOffset);
    button.search = search;
    button.removeAttribute("hidden");
}

function hidePaginationButton(button) {
    button.setAttribute("hidden", true);
}

function syncPaginationButtons() {
    const showingNResults = $("showing-n-results");
    const previousButton = $("previous-button");
    const nextButton = $("next-button");
    const firstButton = $("first-button");
    const lastButton = $("last-button");
    const pageNumbersContainer = $("page-numbers");

    if (!showingNResults || showingNResults.innerText === "Нічого не знайдено.") {
        [previousButton, nextButton, firstButton, lastButton].forEach(hidePaginationButton);
        if (pageNumbersContainer) pageNumbersContainer.innerHTML = "";
        return;
    }

    const match = showingNResults.innerText.match(/Показано (\d+)–(\d+) із (\d+) результат/);
    if (!match) return;

    const start = Number(match[1]);
    const end = Number(match[2]);
    const total = Number(match[3]);
    const postsPerPage = {{ site.paginate }};
    const totalPages = Math.ceil(total / postsPerPage);
    const currentPage = Math.ceil(end / postsPerPage);
    const paramsString = new URLSearchParams(location.search).toString();
    const qs = paramsString ? "?" + paramsString : "";

    pageNumbersContainer.innerHTML = "";
    for (let i = 1; i <= totalPages; i++) {
        const a = document.createElement("a");
        a.textContent = i;
        a.href = (i === 1 ? "{{ '/' | url }}" : "{{ '/' | url }}page/" + i) + qs;
        a.className = "button px-3 py-1 text-xs leading-none";
        if (i === currentPage) a.classList.add("active-page");
        pageNumbersContainer.appendChild(a);
    }

    if (currentPage > 1) {
        showPaginationButton(previousButton, -1, new URLSearchParams(location.search));
        firstButton.href = "{{ '/' | url }}" + qs;
        firstButton.removeAttribute("hidden");
    } else {
        hidePaginationButton(previousButton);
        hidePaginationButton(firstButton);
    }

    if (currentPage < totalPages) {
        showPaginationButton(nextButton, +1, new URLSearchParams(location.search));
        lastButton.href = "{{ '/' | url }}page/" + totalPages + qs;
        lastButton.removeAttribute("hidden");
    } else {
        hidePaginationButton(nextButton);
        hidePaginationButton(lastButton);
    }
}

function updateFilterVisibility(selectedPropertyType) {
    document.querySelectorAll('[data-show-if]').forEach(function(el) {
        var showIf = el.dataset.showIf;
        if (showIf === '*' || !selectedPropertyType) {
            el.style.display = '';
            return;
        }
        var categories = showIf.split(',');
        if (categories.indexOf(selectedPropertyType) !== -1) {
            el.style.display = '';
        } else {
            el.style.display = 'none';
        }
    });
}

function syncSidebarFilters() {
    const urlSearchParams = new URLSearchParams(location.search);
    for (const [fieldName, fieldValue] of urlSearchParams.entries()) {
        let elements = document.getElementsByName(fieldName);
        for (let element of elements) {
            if ("noUiSlider" in element) {
                const slider = element.noUiSlider;
                const fieldValuesArray = fieldValue.split("-");
                slider.set(fieldValuesArray);
            } else if (element instanceof HTMLSelectElement) {
                if (element.multiple) {
                    const options = element.options;
                    const fieldValuesArray = fieldValue.split(",");
                    for (const option of options) {
                        option.selected = fieldValuesArray.includes(option.value);
                    }
                } else {
                    element.value = fieldValue;
                    if (element.selectedIndex === -1) {
                        alert(`Значення ${fieldName} "${fieldValue}" відсутнє в базі даних!\nПовернення до "Будь-який".`);
                        element.selectedIndex = 0;
                        urlSearchParams.delete(fieldName)
                        history.pushState({}, "", "{{ '/' | url }}" + "?" + urlSearchParams);
                        getFilteredRentals().then(filteredRentals => populateRentalGrid(filteredRentals));
                    }
                }
            } else if (element instanceof HTMLInputElement && element.type === "text") {
                element.value = fieldValue;
            } else if (isCheckable(element)) {
                const fieldValuesArray = fieldValue.split(",");
                element.checked = fieldValuesArray.includes(element.value);
            }
        }
    }
}

window.onload = function() {
    resetSidebarFilters(false);
    syncSidebarFilters();
    var urlParams = new URLSearchParams(location.search);
    var selectedType = urlParams.get('propertyType');
    updateFilterVisibility(selectedType);
    syncPaginationButtons()
};

function resetSidebarFilters(resetUrl) {
    const rentalFilters = document.getElementsByClassName("rental-filter");
    for (const rentalFilter of rentalFilters) {
        if (isCheckable(rentalFilter)) {
            rentalFilter.checked = false;
        } else if ("noUiSlider" in rentalFilter) {
            const slider = rentalFilter.noUiSlider;
            slider.set(slider.options.start);
        } else if (rentalFilter instanceof HTMLSelectElement) {
            if (rentalFilter.multiple) {
                const options = rentalFilter.options;
                for (const option of options) {
                    option.selected = false;
                }
            } else {
                rentalFilter.selectedIndex = 0;
            }
        }
    }
    updateFilterVisibility(null);
    if (resetUrl){
        history.pushState({}, "", location.pathname);
        getRentalsJSON().then(filteredRentals => populateRentalGrid(filteredRentals));
    }
}

function updatePostGrid(element) {
    updateUrlSearchParams(element);
    if (element.getAttribute('name') === 'propertyType') {
        updateFilterVisibility(element.value);
    }
    getFilteredRentals().then(filteredRentals => populateRentalGrid(filteredRentals));
}

function toggleFullScreenSidebar() {
    $("sidebar").classList.toggle("hidden");
    $("post-grid-container").classList.toggle("hidden");
    $("menu").classList.add("hidden");
    $("search").classList.add("hidden");
    $("paginator-container").classList.toggle("hidden");
}

$("header-filters-button").addEventListener("click", toggleFullScreenSidebar);
