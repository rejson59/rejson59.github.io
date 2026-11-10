/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   RejChat — ukrywanie obrazów obok ich pokazywania.

   Oko w nagłówku czatu (publicznego i prywatnego) przełącza tryb „bez obrazów”:
   zdjęcia i miniatury linków zostają w wiadomościach, ale nie są rysowane,
   a przycisk „Pokaż zdjęcie” nie pobiera danych z bazy. Wybór pamiętamy
   w tej przeglądarce, więc nie trzeba go powtarzać po każdej wizycie. */
(function (window, document) {
  'use strict';

  var KEY = 'rejhub_hide_media_v1';
  var BUTTON = 'rj-media-toggle';

  function hidden() {
    return document.documentElement.classList.contains('rj-hide-media');
  }

  function paint() {
    var on = hidden();
    Array.prototype.forEach.call(document.querySelectorAll('#' + BUTTON), function (button) {
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.title = on ? 'Pokaż obrazy w RejChacie' : 'Ukryj obrazy w RejChacie';
      button.setAttribute('aria-label', button.title);
      button.classList.toggle('is-on', on);
      var label = button.querySelector('.rj-media-toggle-label');
      if (label) label.textContent = on ? 'Obrazy ukryte' : 'Ukryj obrazy';
    });
    document.documentElement.dataset.hideMedia = on ? '1' : '0';
  }

  function set(value) {
    document.documentElement.classList.toggle('rj-hide-media', Boolean(value));
    try { localStorage.setItem(KEY, value ? '1' : '0'); } catch (error) {}
    paint();
  }

  function toggle() { set(!hidden()); }

  function build() {
    var button = document.createElement('button');
    button.type = 'button';
    button.id = BUTTON;
    button.className = 'rc-search-toggle rj-media-toggle';
    button.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />' +
        '<circle cx="12" cy="12" r="2.6" />' +
        '<path class="rj-media-slash" d="M4 20 20 4" />' +
      '</svg>' +
      '<span class="sr-only rj-media-toggle-label">Ukryj obrazy</span>';
    button.addEventListener('click', toggle);
    return button;
  }

  function mount(target) {
    if (!target || target.querySelector('#' + BUTTON)) return;
    var button = build();
    var search = target.querySelector('#chat-search-toggle');
    if (search && search.parentNode === target) target.insertBefore(button, search.nextSibling);
    else target.appendChild(button);
    paint();
  }

  function scan() {
    Array.prototype.forEach.call(document.querySelectorAll('.rc-room-actions'), mount);
  }

  /* Tryb ukrycia działa też na zdjęcia już wczytane i na nowe wiadomości. */
  document.addEventListener('click', function (event) {
    if (!hidden()) return;
    var target = event.target && event.target.closest && event.target.closest('[data-photo-id], .rc-link-image');
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  function start() {
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (error) {}
    document.documentElement.classList.toggle('rj-hide-media', saved === '1');
    document.documentElement.dataset.hideMedia = saved === '1' ? '1' : '0';
    scan();
    paint();
    new MutationObserver(scan).observe(document.body || document.documentElement, { childList: true, subtree: true });
    document.addEventListener('keydown', function (event) {
      if (event.altKey && !event.ctrlKey && !event.metaKey && String(event.key).toLowerCase() === 'o') {
        event.preventDefault();
        toggle();
      }
    });
  }

  window.RejChatMedia = {
    hidden: hidden,
    toggle: toggle,
    set: set,
    label: function () { return hidden() ? 'Pokaż obrazy' : 'Ukryj obrazy'; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window, document);
