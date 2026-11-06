/* Śledzenie końca rozmowy także po późniejszym dorysowaniu reakcji i podglądów. */
(function (window) {
  'use strict';
  function create(list) {
    var following = true, lastHeight = 0, lastClient = 0, frame = 0, intentUntil = 0, reading = null, internalTop = null;
    function nearBottom() { return list.scrollHeight - list.scrollTop - list.clientHeight < 48; }
    function remember() { lastHeight = list.scrollHeight; lastClient = list.clientHeight; }
    function bottom() {
      following = true; reading = null;
      if (list.clientHeight) { list.scrollTop = list.scrollHeight; internalTop = list.scrollTop; }
      remember();
    }
    function userIntent() { intentUntil = Date.now() + 600; internalTop = null; }
    list.addEventListener('wheel', userIntent, {passive:true});
    list.addEventListener('touchmove', userIntent, {passive:true});
    list.addEventListener('pointerdown', userIntent, {passive:true});
    list.addEventListener('keydown', userIntent);
    // Zmiana wysokości wiadomości nie oznacza, że użytkownik przewinął w górę.
    list.addEventListener('scroll', function () {
      if (!list.clientHeight) return;
      // Własne przywrócenie pozycji nie jest przewinięciem czytelnika.
      if (internalTop !== null && Math.abs(list.scrollTop - internalTop) < 1) { internalTop = null; remember(); return; }
      internalTop = null;
      var changedSize = lastHeight !== list.scrollHeight || lastClient !== list.clientHeight;
      if (!changedSize || Date.now() <= intentUntil) {
        following = nearBottom();
        reading = following ? null : capture();
      } else if (nearBottom() && !reading) following = true;
      remember();
    });
    // Reakcje, karty linków i zdjęcia mogą zmienić wysokość już po renderowaniu.
    function maintain() {
      frame = 0;
      if (!list.clientHeight) return;
      if (following) bottom(); else if (reading) restore(reading);
    }
    function schedule() { if (!frame) frame = window.requestAnimationFrame(maintain); }
    var resize = window.ResizeObserver ? new ResizeObserver(schedule) : null;
    function observeChildren() {
      if (resize) {
        resize.disconnect(); resize.observe(list);
        Array.prototype.forEach.call(list.children, function (child) { resize.observe(child); });
      }
      schedule();
    }
    new MutationObserver(observeChildren).observe(list, {childList:true, subtree:!resize});
    if (!resize) list.addEventListener('load', schedule, true);
    observeChildren();
    // Przy pełnym odświeżeniu zachowujemy widoczną wiadomość, nie tylko scrollTop.
    function capture() {
      if (following || !list.clientHeight) return {following:following, top:list.scrollTop};
      var rect = list.getBoundingClientRect(), anchor = null;
      Array.prototype.some.call(list.children, function (el) {
        var r = el.getBoundingClientRect(), id = el.getAttribute('data-chat-id') || el.getAttribute('data-dm-message');
        if (id && r.bottom > rect.top && r.top < rect.bottom) { anchor = {id:id, offset:r.top - rect.top}; return true; }
        return false;
      });
      return {following:false, top:list.scrollTop, anchor:anchor};
    }
    function restore(state) {
      if (state.following) { bottom(); return; }
      following = false; reading = state;
      var anchor = state.anchor && Array.prototype.find.call(list.children, function (el) {
        return (el.getAttribute('data-chat-id') || el.getAttribute('data-dm-message')) === state.anchor.id;
      });
      if (anchor) list.scrollTop += anchor.getBoundingClientRect().top - list.getBoundingClientRect().top - state.anchor.offset;
      else list.scrollTop = state.top;
      internalTop = list.scrollTop;
      remember();
    }
    return {capture:capture, restore:restore, bottom:bottom, reset:bottom};
  }
  window.RJChatScroll = {create:create};
})(window);
