/* Oba terminy mają jawny offset czasu polskiego. Zegar nie zależy od strefy przeglądarki. */
(function (window, document) {
  'use strict';
  var entries = Array.prototype.map.call(document.querySelectorAll('[data-countdown]'), function (section) {
    var prefix = section.getAttribute('data-countdown');
    var date = document.getElementById(prefix + '-date');
    var clock = document.getElementById(prefix + '-clock');
    var status = document.getElementById(prefix + '-status');
    var units = ['days', 'hours', 'minutes', 'seconds'].map(function (unit) { return document.getElementById(prefix + '-' + unit); });
    if (!date || !clock || !status || units.some(function (unit) { return !unit; })) return null;
    var target = Date.parse(date.getAttribute('datetime'));
    if (!Number.isFinite(target)) { status.textContent = 'Nie udało się uruchomić odliczania.'; return null; }
    return { target: target, clock: clock, status: status, units: units,
      before: status.textContent, ended: section.getAttribute('data-ended') || 'Wydarzenie już się rozpoczęło.' };
  }).filter(Boolean);
  var timer;
  function render() {
    window.clearTimeout(timer);
    var now = Date.now(), delay = Infinity;
    entries.forEach(function (entry) {
      var delta = entry.target - now;
      if (delta <= 0) { entry.clock.hidden = true; entry.status.textContent = entry.ended; return; }
      var remaining = Math.ceil(delta / 1000);
      var values = [Math.floor(remaining / 86400), Math.floor(remaining / 3600) % 24, Math.floor(remaining / 60) % 60, remaining % 60];
      entry.units.forEach(function (node, i) { node.textContent = String(values[i]).padStart(2, '0'); });
      entry.clock.hidden = false;
      entry.status.textContent = entry.before;
      delay = Math.min(delay, (delta % 1000) || 1000);
    });
    if (Number.isFinite(delay)) timer = window.setTimeout(render, delay);
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') render(); });
  window.addEventListener('pageshow', render);
  render();
})(window, document);
