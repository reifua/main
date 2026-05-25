document.querySelectorAll('.range-slider').forEach(function(sliderEl) {
    var min = Number(sliderEl.dataset.min);
    var max = Number(sliderEl.dataset.max);
    var step = Number(sliderEl.dataset.step);
    var startMin = Number(sliderEl.dataset.startMin);
    var startMax = Number(sliderEl.dataset.startMax);
    var pipsStep = Number(sliderEl.dataset.pipsStep);

    var pips = [startMin];
    for (var v = pipsStep; v <= max; v += pipsStep) {
        pips.push(v);
    }

    sliderEl.innerHTML = "";
    sliderEl.classList.add("slider-styled");
    noUiSlider.create(sliderEl, {
        start: [startMin, startMax],
        connect: true,
        step: step,
        tooltips: true,
        format: {
            to: function(numberValue) { return Math.round(numberValue); },
            from: function(stringValue) { return Number(stringValue.replace(',-', '')); }
        },
        pips: {
            mode: 'values',
            values: pips,
            density: 4
        },
        range: {
            'min': min,
            'max': max
        },
        handleAttributes: [
            {"aria-label": "Minimum " + sliderEl.getAttribute('name')},
            {"aria-label": "Maximum " + sliderEl.getAttribute('name')}
        ]
    });

    sliderEl.noUiSlider.on("change", function() {
        updatePostGrid(sliderEl);
    });

    mergeTooltips(sliderEl, 15, '–');
});

function mergeTooltips(slider, threshold, separator) {

    var textIsRtl = getComputedStyle(slider).direction === 'rtl';
    var isRtl = slider.noUiSlider.options.direction === 'rtl';
    var isVertical = slider.noUiSlider.options.orientation === 'vertical';
    var tooltips = slider.noUiSlider.getTooltips();
    var origins = slider.noUiSlider.getOrigins();

    tooltips.forEach(function (tooltip, index) {
        if (tooltip) {
            origins[index].appendChild(tooltip);
        }
    });

    slider.noUiSlider.on('update', function (values, handle, unencoded, tap, positions) {

        var pools = [[]];
        var poolPositions = [[]];
        var poolValues = [[]];
        var atPool = 0;

        if (tooltips[0]) {
            pools[0][0] = 0;
            poolPositions[0][0] = positions[0];
            poolValues[0][0] = values[0];
        }

        for (var i = 1; i < positions.length; i++) {
            if (!tooltips[i] || (positions[i] - positions[i - 1]) > threshold) {
                atPool++;
                pools[atPool] = [];
                poolValues[atPool] = [];
                poolPositions[atPool] = [];
            }

            if (tooltips[i]) {
                pools[atPool].push(i);
                poolValues[atPool].push(values[i]);
                poolPositions[atPool].push(positions[i]);
            }
        }

        pools.forEach(function (pool, poolIndex) {
            var handlesInPool = pool.length;

            for (var j = 0; j < handlesInPool; j++) {
                var handleNumber = pool[j];

                if (j === handlesInPool - 1) {
                    var offset = 0;

                    poolPositions[poolIndex].forEach(function (value) {
                        offset += 1000 - value;
                    });

                    var direction = isVertical ? 'bottom' : 'right';
                    var last = isRtl ? 0 : handlesInPool - 1;
                    var lastOffset = 1000 - poolPositions[poolIndex][last];
                    offset = (textIsRtl && !isVertical ? 100 : 0) + (offset / handlesInPool) - lastOffset;

                    var tooltipValues = poolValues[poolIndex].filter(function(v, i, a) { return a.indexOf(v) === i; });

                    tooltips[handleNumber].innerHTML = tooltipValues.join(separator);
                    tooltips[handleNumber].style.display = 'block';
                    tooltips[handleNumber].style[direction] = offset + '%';
                } else {
                    tooltips[handleNumber].style.display = 'none';
                }
            }
        });
    });
}
