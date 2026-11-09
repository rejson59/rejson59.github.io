/* Tylko w podglądzie iframe strony głównej, przed kodem projektu.
   Nie zmienia preferencji ani dźwięku otwartego projektu. */
(function () {
  'use strict';
  if (window === window.top) return;
  /* Miniatura nie instaluje workerów projektów dla całej domeny; normalne
     otwarcie projektu nie korzysta z tego skryptu. */
  try {
    if (navigator.serviceWorker) Object.defineProperty(navigator.serviceWorker, 'register', {
      configurable:true, value:function () { return Promise.reject(new Error('Service worker disabled in preview')); }
    });
  } catch (e) { /* Brak service workerów w tej przeglądarce. */ }
  try {
    var proto = window.AudioNode && window.AudioNode.prototype;
    var originalConnect = proto && proto.connect;
    var gates = new WeakMap();
    if (originalConnect) proto.connect = function (target) {
      var context = this.context;
      if (context && target === context.destination && typeof context.createGain === 'function') {
        var gate = gates.get(context);
        if (!gate) {
          gate = context.createGain();
          gate.gain.value = 0;
          originalConnect.call(gate, target);
          gates.set(context, gate);
        }
        var args = Array.prototype.slice.call(arguments);
        args[0] = gate;
        originalConnect.apply(this, args);
        return target;
      }
      return originalConnect.apply(this, arguments);
    };
    var media = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
    if (media) {
      var muted = Object.getOwnPropertyDescriptor(media, 'muted');
      var play = media.play;
      if (muted && muted.set && muted.get) Object.defineProperty(media, 'muted', {
        configurable:muted.configurable, enumerable:muted.enumerable,
        get:function () { return muted.get.call(this); },
        set:function () { muted.set.call(this, true); }
      });
      if (play && muted && muted.set) media.play = function () { muted.set.call(this, true); return play.apply(this, arguments); };
      document.addEventListener('play', function (e) { if (e.target instanceof HTMLMediaElement && muted && muted.set) muted.set.call(e.target, true); }, true);
    }
    window.__rjSilentPreview = true;
  } catch (e) { /* Przeglądarka bez Web Audio lub HTMLMediaElement. */ }
})();
