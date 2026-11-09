(function () {
  'use strict';
  var studio = document.querySelector('.studio');
  if (!studio) return;

  // Filtry to tylko wybór widocznych przykładów. Nic nie zmienia witryny.
  var filters = Array.prototype.slice.call(studio.querySelectorAll('[data-filter]'));
  var examples = Array.prototype.slice.call(studio.querySelectorAll('[data-category]'));
  filters.forEach(function (button) {
    button.addEventListener('click', function () {
      var chosen = button.dataset.filter;
      filters.forEach(function (item) { item.setAttribute('aria-pressed', String(item === button)); });
      var count = 0;
      examples.forEach(function (card) {
        var show = chosen === 'all' || card.dataset.category === chosen;
        card.hidden = !show;
        if (show) count++;
      });
      document.getElementById('filter-empty').hidden = count !== 0;
      scheduleLens();
    });
  });

  studio.querySelectorAll('[data-like]').forEach(function (button) {
    button.addEventListener('click', function () {
      var selected = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(selected));
      var label = button.querySelector('span');
      if (label) label.textContent = selected ? 'Podoba Ci się' : 'Podoba mi się';
    });
  });
  studio.querySelectorAll('.sample-dock, .sample-tabs').forEach(function (group) {
    group.addEventListener('click', function (event) {
      var clicked = event.target.closest('button');
      if (!clicked || !group.contains(clicked)) return;
      group.querySelectorAll('button').forEach(function (button) {
        var selected = button === clicked;
        button.setAttribute('aria-pressed', String(selected));
        if (group.classList.contains('sample-dock')) button.classList.toggle('active', selected);
      });
    });
  });

  var motionStatus = document.getElementById('motion-status');
  var reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  studio.querySelectorAll('.play-motion').forEach(function (button) {
    button.addEventListener('click', function () {
      var card = button.closest('.motion-card');
      var object = card.querySelector('[data-motion-object]');
      object.classList.remove('is-playing');
      if (reduced && reduced.matches) {
        motionStatus.textContent = 'Animacje są wyłączone przez ustawienie ograniczonego ruchu w urządzeniu.';
        return;
      }
      // Restart także wtedy, gdy użytkownik ponownie dotknie przycisku w trakcie ruchu.
      void object.offsetWidth;
      object.classList.add('is-playing');
      motionStatus.textContent = 'Odtwarzam: ' + card.querySelector('h3').textContent + '.';
    });
  });
  studio.querySelectorAll('[data-motion-object]').forEach(function (object) {
    object.addEventListener('animationend', function (event) {
      if (event.target === object || event.pseudoElement) object.classList.remove('is-playing');
    });
  });

  // Rzeczywista, delikatna soczewka na wszystkich szklanych próbkach. Każda mapa ma
  // rozmiar tafli; SVG/CSS może nie działać w niektórych przeglądarkach.
  // Wtedy zostaje zwykłe półprzezroczyste szkło z blur (lub kryjący fallback).
  var ns = 'http://www.w3.org/2000/svg';
  var defs = document.getElementById('studio-lens-defs');
  var lenses = Array.prototype.slice.call(studio.querySelectorAll('[data-lens]'));
  var supportsLens = !!(window.CSS && CSS.supports && (CSS.supports('backdrop-filter', 'url(#test)') || CSS.supports('-webkit-backdrop-filter', 'url(#test)')));
  var lensFrame = 0, failed = false, mapCache = new Map();
  function svg(tag, attributes) {
    var node = document.createElementNS(ns, tag);
    Object.keys(attributes).forEach(function (key) { node.setAttribute(key, String(attributes[key])); });
    return node;
  }
  function mapFor(width, height) {
    var band = 36, ratio = Math.min(1, 256 / Math.max(width, height));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    var context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    var image = context.createImageData(canvas.width, canvas.height), pixels = image.data;
    var bx = Math.min(band, width / 2), by = Math.min(band, height / 2);
    var edge = Math.min(band, width / 2, height / 2) * .3;
    var range = Math.max(width, height) / 2 + edge;
    for (var y = 0; y < canvas.height; y++) for (var x = 0; x < canvas.width; x++) {
      var px = (x + .5) * width / canvas.width, py = (y + .5) * height / canvas.height;
      var sx = Math.max(0, 1 - Math.min(px, width - px) / bx);
      var sy = Math.max(0, 1 - Math.min(py, height - py) / by);
      sx = sx * sx * (3 - 2 * sx); sy = sy * sy * (3 - 2 * sy);
      var nx = px < width / 2 ? -1 : 1, ny = py < height / 2 ? -1 : 1;
      var dx = width / 2 - px - nx * edge * sx, dy = height / 2 - py - ny * edge * sy;
      var i = (y * canvas.width + x) * 4;
      pixels[i] = Math.round(127.5 + 127.5 * dx / range);
      pixels[i + 1] = Math.round(127.5 + 127.5 * dy / range);
      pixels[i + 2] = 128; pixels[i + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
  }
  function updateLens() {
    lensFrame = 0;
    if (!supportsLens || failed) return;
    try {
      lenses.forEach(function (element, index) {
        var width = Math.round(element.offsetWidth), height = Math.round(element.offsetHeight);
        if (!width || !height) return;
        var signature = width + 'x' + height;
        if (element.dataset.lensSize === signature) return;
        var id = 'studio-lens-' + index, filter = document.getElementById(id);
        if (!filter) {
          filter = svg('filter', {id: id, filterUnits: 'userSpaceOnUse', x: 0, y: 0, 'color-interpolation-filters': 'sRGB'});
          filter.appendChild(svg('feImage', {x: 0, y: 0, preserveAspectRatio: 'none', result: 'lens-map'}));
          filter.appendChild(svg('feDisplacementMap', {in: 'SourceGraphic', in2: 'lens-map', xChannelSelector: 'R', yChannelSelector: 'G'}));
          defs.appendChild(filter);
        }
        var image = filter.firstElementChild, displacement = filter.lastElementChild;
        filter.setAttribute('width', width); filter.setAttribute('height', height);
        image.setAttribute('width', width); image.setAttribute('height', height);
        if (!mapCache.has(signature)) {
          if (mapCache.size >= 32) mapCache.clear();
          mapCache.set(signature, mapFor(width, height));
        }
        image.setAttribute('href', mapCache.get(signature));
        var edge = .3 * Math.min(36, width / 2, height / 2);
        var scale = 2 * (Math.max(width, height) / 2 + edge) * (1 - 1 / 1.08);
        displacement.setAttribute('scale', scale.toFixed(3));
        element.style.setProperty('--lens-filter', 'url(#' + id + ') blur(1px) saturate(115%)');
        element.dataset.lensSize = signature;
      });
    } catch (error) {
      failed = true;
      lenses.forEach(function (element) { element.style.removeProperty('--lens-filter'); });
    }
  }
  function scheduleLens() {
    if (!supportsLens || failed || lensFrame) return;
    if (window.requestAnimationFrame) lensFrame = window.requestAnimationFrame(updateLens);
    else updateLens();
  }
  if (supportsLens && window.ResizeObserver) {
    var observer = new ResizeObserver(scheduleLens);
    lenses.forEach(function (element) { observer.observe(element); });
  } else if (supportsLens) window.addEventListener('resize', scheduleLens);
  scheduleLens();
})();
