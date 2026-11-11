/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Kopiowanie i ponowne użycie bez pisemnej zgody zabronione. Licencja: /LICENSE, /licencja */
/*!
 * RejHub 2.0 — przełącznik „Plakaty / Podglądy na żywo” (v1).
 *
 * Steruje tym samym silnikiem co `js/loader.js`:
 *   RJLoader.setPreviewMode('poster' | 'live' | 'auto')
 *
 * Zasady:
 *   - domyślnie plakaty (na słabszym sprzęcie to jedyna rozsądna opcja),
 *   - wybór jest zapamiętywany w przeglądarce (robi to loader),
 *   - klik „Na żywo” od razu montuje podglądy (silnik sam dba, żeby jedna
 *     ramka startowała naraz),
 *   - klik „Plakaty” natychmiast zwalnia wszystkie żywe ramki,
 *   - stan jest czytany z powrotem z loadera, więc przełącznik nigdy nie
 *     kłamie (np. gdy tryb wymuszono adresem `?previews=live`).
 *
 * Plik nie zawiera żadnego stylu ani tekstu interfejsu — wygląd jest w
 * `hub/glass2.css`, treść w HTML-u.
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-preview-toggle]');
  if (!root) return;

  var buttons = Array.prototype.slice.call(root.querySelectorAll('[data-preview-mode]'));
  var stateNode = root.querySelector('[data-preview-state]');
  var noteNode = root.querySelector('[data-preview-note]');

  var LABELS = {
    poster: 'Plakaty — najlżejszy tryb',
    live: 'Podglądy na żywo — mogą powodować lagi'
  };

  function loader() {
    return window.RJLoader || null;
  }

  function currentMode() {
    var api = loader();
    if (!api) return 'auto';
    if (typeof api.previewMode !== 'function') return 'auto';
    return api.previewMode();
  }

  /* Co pokazać jako wybrane. Tryb „auto” nie jest osobnym przyciskiem —
     pokazujemy to, co realnie robi silnik na tym urządzeniu. */
  function resolved() {
    var api = loader();
    var mode = currentMode();
    if (mode === 'poster' || mode === 'live') return mode;
    if (api && typeof api.liveAllowed === 'function') {
      return api.liveAllowed() ? 'live' : 'poster';
    }
    return 'poster';
  }

  function render() {
    var selected = resolved();
    var mode = currentMode();

    buttons.forEach(function (button) {
      var pressed = button.getAttribute('data-preview-mode') === selected;
      button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    });

    root.setAttribute('data-mode', mode === 'auto' ? selected : mode);

    if (stateNode) {
      if (mode === 'auto') {
        stateNode.textContent = selected === 'live'
          ? 'Automatycznie: podglądy (mocny sprzęt)'
          : 'Automatycznie: plakaty (słabszy sprzęt)';
      } else {
        stateNode.textContent = LABELS[selected] || '';
      }
    }
  }

  function choose(mode) {
    var api = loader();
    if (!api || typeof api.setPreviewMode !== 'function') return false;
    api.setPreviewMode(mode);
    render();
    return true;
  }

  buttons.forEach(function (button) {
    button.addEventListener('click', function (event) {
      event.preventDefault();
      var mode = button.getAttribute('data-preview-mode');
      if (mode !== 'poster' && mode !== 'live') return;
      if (!choose(mode)) {
        /* Loader jeszcze się nie wczytał (defer + wolna sieć). Chwila
           cierpliwości zamiast cichego ignorowania kliknięcia. */
        setTimeout(function () { choose(mode); }, 300);
        return;
      }
      /* Fokus zostaje na przycisku (klawiatura), ale bez obwódki po kliknięciu. */
      try { button.blur(); } catch (error) { /* trudno */ }
    });
  });

  /* Loader i tak nie zmienia trybu sam, ale inne skrypty mogą — np. adres
     `?previews=poster`. Nasłuchujemy więc zdarzenia i odświeżamy stan. */
  window.addEventListener('rj-shell-updated', render);
  window.addEventListener('pageshow', render);

  if (loader()) {
    render();
  } else {
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (loader() || tries > 40) {
        clearInterval(timer);
        render();
      }
    }, 100);
  }

  window.RJPreviewToggle = {
    refresh: render,
    select: choose,
    mode: resolved
  };
})();
