/* © 2026 rejson59 — wszystkie prawa zastrzeżone. Licencja: /LICENSE
   ==========================================================================
   Trzymanie końca rozmowy.

   Wcześniej lista bywała pusta w chwili, gdy przychodziły wiadomości, więc
   „przewiń na dół” trafiało w element o wysokości 0 i nic się nie działo —
   po wejściu w czat widziało się najstarsze wpisy. Teraz dojazd do końca jest
   ponawiany w kolejnych klatkach, aż lista naprawdę ma wysokość, a każda
   zmiana rozmiaru (obraz, podgląd linku, reakcje) dociąga pozycję, dopóki
   czytelnik nie przewinie w górę.
   ========================================================================== */
(function (window) {
  'use strict';

  function create(list) {
    var following = true;
    var reading = null;
    var lastHeight = 0;
    var lastClient = 0;
    var frame = 0;
    var bottomFrame = 0;
    var intentUntil = 0;
    var internalTop = null;
    var destroyed = false;

    function nearBottom() {
      if (!list.clientHeight) return true;
      return list.scrollHeight - list.scrollTop - list.clientHeight < 48;
    }

    function remember() {
      lastHeight = list.scrollHeight;
      lastClient = list.clientHeight;
    }

    /* Dojazd do końca w kilku klatkach: po wstawieniu HTML obrazki i podglądy
       linków podnoszą wysokość, a przy pierwszym wejściu lista bywa jeszcze
       bez wymiarów. Jedna próba to za mało w obu przypadkach. */
    function bottom(steps) {
      following = true;
      reading = null;
      var left = steps == null ? 8 : steps;
      cancelAnimationFrame(bottomFrame);
      function step() {
        if (destroyed) return;
        if (list.clientHeight && list.scrollHeight > list.clientHeight) {
          list.scrollTop = list.scrollHeight;
          internalTop = list.scrollTop;
          remember();
        }
        if (--left > 0) bottomFrame = window.requestAnimationFrame(step);
        else remember();
      }
      step();
    }

    function userIntent() {
      intentUntil = Date.now() + 600;
      internalTop = null;
    }

    list.addEventListener('wheel', userIntent, { passive: true });
    list.addEventListener('touchmove', userIntent, { passive: true });
    list.addEventListener('pointerdown', userIntent, { passive: true });
    list.addEventListener('keydown', userIntent);

    list.addEventListener('scroll', function () {
      if (!list.clientHeight) return;
      /* Własne przywrócenie pozycji nie jest przewinięciem czytelnika. */
      if (internalTop !== null && Math.abs(list.scrollTop - internalTop) < 1) {
        internalTop = null;
        remember();
        return;
      }
      internalTop = null;
      var changedSize = lastHeight !== list.scrollHeight || lastClient !== list.clientHeight;
      if (!changedSize || Date.now() <= intentUntil) {
        following = nearBottom();
        reading = following ? null : capture();
      } else if (nearBottom() && !reading) {
        following = true;
      }
      remember();
    }, { passive: true });

    function maintain() {
      frame = 0;
      if (!list.clientHeight) { if (following) bottom(3); return; }
      if (following) bottom(2);
      else if (reading) restore(reading);
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(maintain);
    }

    var resize = window.ResizeObserver ? new ResizeObserver(schedule) : null;

    function observeChildren() {
      if (resize) {
        resize.disconnect();
        resize.observe(list);
        Array.prototype.forEach.call(list.children, function (child) { resize.observe(child); });
      }
      schedule();
    }

    new MutationObserver(observeChildren).observe(list, { childList: true, subtree: !resize });
    if (!resize) list.addEventListener('load', schedule, true);
    observeChildren();

    /* Przy pełnym odświeżeniu zachowujemy widoczną wiadomość, nie tylko scrollTop. */
    function capture() {
      if (following || !list.clientHeight) return { following: following, top: list.scrollTop };
      var rect = list.getBoundingClientRect();
      var anchor = null;
      Array.prototype.some.call(list.children, function (el) {
        var r = el.getBoundingClientRect();
        var id = el.getAttribute('data-chat-id') || el.getAttribute('data-dm-message');
        if (id && r.bottom > rect.top && r.top < rect.bottom) {
          anchor = { id: id, offset: r.top - rect.top };
          return true;
        }
        return false;
      });
      return { following: false, top: list.scrollTop, anchor: anchor };
    }

    function restore(state) {
      if (!state) { bottom(); return; }
      if (state.following) { bottom(); return; }
      following = false;
      reading = state;
      var anchor = state.anchor && Array.prototype.find.call(list.children, function (el) {
        return (el.getAttribute('data-chat-id') || el.getAttribute('data-dm-message')) === state.anchor.id;
      });
      if (anchor) list.scrollTop += anchor.getBoundingClientRect().top - list.getBoundingClientRect().top - state.anchor.offset;
      else list.scrollTop = state.top;
      internalTop = list.scrollTop;
      remember();
    }

    return {
      capture: capture,
      restore: restore,
      bottom: bottom,
      reset: bottom,
      nearBottom: nearBottom,
      isFollowing: function () { return following; },
      destroy: function () { destroyed = true; cancelAnimationFrame(bottomFrame); if (resize) resize.disconnect(); }
    };
  }

  window.RJChatScroll = { create: create };
})(window);
