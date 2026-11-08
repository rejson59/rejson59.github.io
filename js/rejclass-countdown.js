/* Lekcja odbywa się o 11:10 czasu polskiego; odliczanie nie zależy od strefy przeglądarki. */
(function (window, document) {
  'use strict';
  var date = document.getElementById('countdown-date');
  var clock = document.getElementById('countdown-clock');
  var status = document.getElementById('countdown-status');
  if (!date || !clock || !status) return;
  var target = Date.parse(date.getAttribute('datetime'));
  if (!Number.isFinite(target)) { status.textContent = 'Nie udało się uruchomić odliczania.'; return; }
  var units = ['days', 'hours', 'minutes', 'seconds'].map(function (unit) { return document.getElementById('countdown-' + unit); });
  var timer;
  function render() {
    window.clearTimeout(timer);
    var delta = target - Date.now();
    if (delta <= 0) {
      clock.hidden = true;
      status.textContent = 'Lekcja angielskiego rozpoczęła się.';
      return;
    }
    var remaining = Math.ceil(delta / 1000);
    var values = [Math.floor(remaining / 86400), Math.floor(remaining / 3600) % 24, Math.floor(remaining / 60) % 60, remaining % 60];
    units.forEach(function (node, i) { node.textContent = String(values[i]).padStart(2, '0'); });
    clock.hidden = false;
    status.textContent = 'Do rozpoczęcia lekcji:';
    // Wyliczamy kolejną zmianę z zegara, zamiast odejmować sekundę przy każdym ticku.
    timer = window.setTimeout(render, (delta % 1000) || 1000);
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') render(); });
  window.addEventListener('pageshow', render);
  render();
})(window, document);
