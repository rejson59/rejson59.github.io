/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   ============================================================================
   Wejście strony — fala szkła od prawego górnego do lewego dolnego rogu.
   ----------------------------------------------------------------------------
   Po zniknięciu loadera każda szklana tafla i każdy przycisk dostaje jedną
   z animacji znanych ze Szklanego studia (losowo, ale bez powtórek pod rząd),
   a nagłówki rozsypują się na litery i podskakują jedna po drugiej.

   Kolejność: elementy są sortowane po przekątnej `top - left`, więc fala
   zaczyna się w prawym górnym rogu i schodzi do lewego dolnego.

   Animacje idą przez Web Animations API z `fill: both` i są anulowane po
   zakończeniu — dzięki temu nie zostawiają na elementach transformacji,
   które blokowałyby późniejsze efekty hover.
   ========================================================================== */
(function (window, document) {
  "use strict";

  var root = document.documentElement;
  var MAX_ELEMENTS = 110;
  var MAX_LETTERS = 320;
  var started = false;
  var tracked = [];

  /* Świadome wyłączenie ruchu w studiu / `?motion=off` ma pierwszeństwo.
     Systemowe `prefers-reduced-motion` jest neutralizowane przez motion-unlock. */
  if (window.RejMotion && window.RejMotion.status && window.RejMotion.status() === "off") return;
  if (!window.Element || !window.Element.prototype || !window.Element.prototype.animate) return;

  var SURFACES = [
    "main .card", "main .panel", "main .tool", "main .service-card",
    "main .wid-card", "main .wid-demo", "main .wid-cta", "main .kpi-card",
    "main .profile-card", "main .auth-card", "main .adm-card", "main .adm-kpi",
    "main .toolbar-card", "main .inspector-card", "main .rjc-subject",
    "main .rjc-workspace", "main .file-item", "main .store-card",
    "main .timeline-card", "main .dropzone", "main .comm-card",
    "main .partner-option", "main .partner-form-card", "main .rj-cta",
    "main .rj-premium", "main .universe-links a", "main .notfound > div"
  ];

  var SELECTOR = [
    ".rj-shared-header .brand",
    ".rj-shared-header .site-nav > a",
    ".rj-shared-header .site-nav > details",
    ".rj-shared-header .rj-home-link",
    ".rj-shared-header .rj-chat-alerts",
    ".rj-shared-header .mobile-account",
    ".rj-shared-header .hamburger-btn",
    ".rj-shared-header .rj-header-profile",
    "main button",
    "main .btn",
    "main .button",
    "main .hero-lead",
    "main .lead",
    "main .section-head > p",
    "main .hero-copy > p",
    "main .eyebrow",
    "main .kicker",
    "main .section-kicker"
  ].concat(SURFACES).join(",");

  var HEADINGS = "main h1, main h2, main h3";

  /* ---------- warianty ruchu (język Szklanego studia) ---------- */

  var VARIANTS = [
    {
      name: "drop",
      frames: [
        { opacity: 0, transform: "translate3d(8px,-18px,0) scale(.94)", filter: "blur(6px)" },
        { opacity: 1, transform: "translate3d(0,0,0) scale(1)", filter: "blur(0)" }
      ]
    },
    {
      name: "rise",
      frames: [
        { opacity: 0, transform: "translate3d(-6px,22px,0) scale(.96)", filter: "blur(8px)" },
        { opacity: 1, transform: "translate3d(0,0,0) scale(1)", filter: "blur(0)" }
      ]
    },
    {
      name: "tilt",
      frames: [
        { opacity: 0, transform: "translate3d(16px,8px,0) rotate(1.6deg) scale(.95)", filter: "blur(5px)" },
        { opacity: 1, transform: "translate3d(0,0,0) rotate(0deg) scale(1)", filter: "blur(0)" }
      ]
    },
    {
      name: "slide",
      frames: [
        { opacity: 0, transform: "translate3d(28px,0,0) scale(.97)", filter: "blur(9px)" },
        { opacity: 1, transform: "translate3d(0,0,0) scale(1)", filter: "blur(0)" }
      ]
    },
    {
      name: "pop",
      frames: [
        { opacity: 0, transform: "scale(.86)", filter: "blur(3px)" },
        { opacity: 1, transform: "scale(1)", filter: "blur(0)" }
      ],
      easing: "cubic-bezier(.18,1.32,.36,1)"
    },
    {
      name: "glide",
      frames: [
        { opacity: 0, transform: "translate3d(-20px,10px,0) rotate(-1.2deg) scale(.97)", filter: "blur(7px)" },
        { opacity: 1, transform: "translate3d(0,0,0) rotate(0deg) scale(1)", filter: "blur(0)" }
      ]
    }
  ];

  var bag = [];

  function pickVariant() {
    if (!bag.length) {
      bag = VARIANTS.slice();
      for (var i = bag.length - 1; i > 0; i -= 1) {
        var j = Math.floor(Math.random() * (i + 1));
        var swap = bag[i];
        bag[i] = bag[j];
        bag[j] = swap;
      }
    }
    return bag.pop();
  }

  /* ---------- litery ---------- */

  function gradientText(parent) {
    var style = window.getComputedStyle(parent);
    var clip = style.backgroundClip || style.webkitBackgroundClip || "";
    if (clip === "text") return true;
    var fill = style.webkitTextFillColor || "";
    return fill === "rgba(0, 0, 0, 0)" || fill === "transparent";
  }

  function splitHeading(heading) {
    if (!heading || heading.__rjSplit) return [];
    if (heading.closest("#rj-page-loader, .card-preview, .sx-stage, [hidden]")) return [];
    var text = String(heading.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length < 3 || text.length > 130) return [];
    if (!heading.ownerDocument.createTreeWalker) return [];

    var nodes = [];
    var walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      var node = walker.currentNode;
      if (!node.nodeValue || !node.nodeValue.trim()) continue;
      if (node.parentElement && (gradientText(node.parentElement) || node.parentElement.closest("code, kbd, samp"))) continue;
      nodes.push(node);
    }
    if (!nodes.length) return [];

    var letters = [];
    nodes.forEach(function (node) {
      var fragment = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(function (chunk) {
        if (!chunk) return;
        if (/^\s+$/.test(chunk)) {
          fragment.appendChild(document.createTextNode(chunk));
          return;
        }
        var word = document.createElement("span");
        word.className = "rj-word";
        word.setAttribute("aria-hidden", "true");
        for (var i = 0; i < chunk.length; i += 1) {
          var letter = document.createElement("span");
          letter.className = "rj-letter";
          letter.textContent = chunk.charAt(i);
          letters.push(letter);
          word.appendChild(letter);
        }
        fragment.appendChild(word);
      });
      if (node.parentNode) node.parentNode.replaceChild(fragment, node);
    });

    if (!letters.length) return [];
    if (!heading.querySelector("img, svg, canvas, iframe")) heading.setAttribute("aria-label", text);
    heading.__rjSplit = true;
    return letters;
  }

  /* ---------- zbieranie kandydatów ---------- */

  function usable(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest("#rj-page-loader, .card-preview, .sx-stage, iframe, [hidden], noscript")) return false;
    var style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (style.animationName && style.animationName !== "none") return false;
    var rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return false;
    if (rect.bottom < -40) return false;
    if (rect.top > window.innerHeight * 2.4) return false;
    return true;
  }

  function collect() {
    var list = [];
    var seen = [];
    Array.prototype.forEach.call(document.querySelectorAll(SELECTOR), function (el) {
      if (el.__rjSplit) return;
      if (!usable(el)) return;
      if (seen.some(function (other) { return other !== el && other.contains(el); })) return;
      if (list.some(function (other) { return other !== el && other.contains(el); })) return;
      /* elementy zagnieżdżone w już wybranych taflach pojadą razem z rodzicem */
      list = list.filter(function (other) { return !el.contains(other); });
      seen.push(el);
      list.push(el);
    });
    return list;
  }

  function scoreOf(el) {
    var rect = el.getBoundingClientRect();
    return rect.top - rect.left;
  }

  /* ---------- animowanie ---------- */

  function play(el, delay) {
    var variant = pickVariant();
    var duration = 560 + Math.round(Math.random() * 240);
    /* Telefon: bez rozmycia — na małych ekranach filtr na kilkudziesięciu
       taflach potrafi zgubić klatki, a sam ruch wystarcza do efektu. */
    var frames = window.innerWidth < 700
      ? variant.frames.map(function (frame) {
          return { opacity: frame.opacity, transform: frame.transform };
        })
      : variant.frames;
    var animation;
    try {
      animation = el.animate(frames, {
        duration: duration,
        delay: delay,
        easing: variant.easing || "cubic-bezier(.16,.86,.28,1)",
        fill: "both"
      });
    } catch (error) {
      el.style.opacity = "";
      return;
    }
    el.style.opacity = "";
    el.style.willChange = window.innerWidth < 700 ? "transform, opacity" : "transform, opacity, filter";
    function done() {
      el.style.willChange = "";
      try { animation.cancel(); } catch (error) { /* już anulowana */ }
    }
    animation.onfinish = done;
    animation.oncancel = function () { el.style.willChange = ""; };
  }

  function playLetters(letters, delay) {
    var step = letters.length > 70 ? 9 : 14;
    letters.forEach(function (letter, index) {
      var animation;
      try {
        animation = letter.animate(
          [
            { opacity: 0, transform: "translate3d(0,.34em,0) rotate(-4deg)" },
            { opacity: 1, transform: "translate3d(0,0,0) rotate(0deg)" }
          ],
          {
            duration: 460,
            delay: delay + index * step,
            easing: "cubic-bezier(.2,1.36,.35,1)",
            fill: "both"
          }
        );
      } catch (error) {
        letter.style.opacity = "";
        return;
      }
      letter.style.opacity = "";
      animation.onfinish = function () {
        try { animation.cancel(); } catch (error) { /* już anulowana */ }
      };
    });
  }

  /* ---------- start ---------- */

  function run() {
    if (started) return;
    started = true;

    var headings = Array.prototype.slice.call(document.querySelectorAll(HEADINGS));
    var letterBuckets = [];
    var letterCount = 0;
    headings.forEach(function (heading) {
      if (letterCount >= MAX_LETTERS) return;
      var letters = splitHeading(heading);
      if (!letters.length) return;
      letterBuckets.push({ heading: heading, letters: letters });
      letterCount += letters.length;
    });

    var elements = collect();
    var ranks = elements.map(function (el) {
      return { el: el, score: scoreOf(el) };
    }).sort(function (a, b) { return a.score - b.score; });

    var limit = window.innerWidth < 700 ? 70 : MAX_ELEMENTS;
    if (ranks.length > limit) ranks = ranks.slice(0, limit);
    ranks.forEach(function (item) {
      item.el.style.opacity = "0";
      tracked.push(item.el);
    });

    letterBuckets.forEach(function (bucket) {
      bucket.letters.forEach(function (letter) {
        letter.style.opacity = "0";
        tracked.push(letter);
      });
    });

    var base = 60;
    ranks.forEach(function (item, index) {
      play(item.el, base + index * 22 + Math.random() * 50);
    });

    rescue();

    letterBuckets.forEach(function (bucket) {
      var score = scoreOf(bucket.heading);
      var rank = 0;
      ranks.forEach(function (item) {
        if (item.score < score) rank += 1;
      });
      var delay = base + Math.min(rank, ranks.length) * 22 + 40;
      playLetters(bucket.letters, delay);
    });
  }

  /* Siatka bezpieczeństwa: gdyby animacja z jakiegoś powodu nie wystartowała
     (np. karta w tle), po kilku sekundach i tak pokazujemy treść. */
  function rescue() {
    window.setTimeout(function () {
      tracked.forEach(function (el) {
        if (el.style.opacity === "0" && (!el.getAnimations || !el.getAnimations().length)) {
          el.style.opacity = "";
          el.style.willChange = "";
        }
      });
    }, 9000);
  }

  /* Czekamy na zniknięcie nakładki: animacja ma być nagrodą za wczytanie,
     nie czymś, co dzieje się pod loaderem. */
  function whenReady(callback) {
    var overlay = document.getElementById("rj-page-loader");
    if (!overlay) {
      window.setTimeout(callback, 90);
      return;
    }
    if (overlay.classList.contains("is-hidden") || overlay.style.display === "none") {
      window.setTimeout(callback, 90);
      return;
    }
    var fired = false;
    function fire() {
      if (fired) return;
      fired = true;
      window.setTimeout(callback, 90);
    }
    if (window.MutationObserver) {
      var observer = new MutationObserver(function () {
        if (overlay.classList.contains("is-hidden") || overlay.style.display === "none") {
          observer.disconnect();
          fire();
        }
      });
      observer.observe(overlay, { attributes: true, attributeFilter: ["class", "style"] });
    }
    window.setTimeout(fire, 6000);
  }

  function boot() {
    whenReady(run);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.RejReveal = { start: run };
})(window, document);
