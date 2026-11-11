/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   ============================================================================
   Wejście strony — fala szkła od prawego górnego do lewego dolnego rogu.
   ----------------------------------------------------------------------------
   Po zniknięciu loadera:
     • topbar zjeżdża z góry,
     • mini reklamy wchodzą z prawej (mobilne z dołu),
     • szklane tafle i przyciski dostają losową animację ze Szklanego studia,
       ale zawsze w kolejności przekątnej: prawy górny → lewy dolny,
     • nagłówki rozsypują się na litery, które podskakują jedna po drugiej.

   Animacje idą przez Web Animations API z `fill: both` i są anulowane po
   zakończeniu — nie zostawiają transformacji blokujących hover ani tilt kart.
   ========================================================================== */
(function (window, document) {
  "use strict";

  var MAX_ELEMENTS = 110;
  var MAX_LETTERS = 320;
  var started = false;
  var tracked = [];

  /* Świadome wyłączenie ruchu w studiu / `?motion=off` ma pierwszeństwo.
     Systemowe `prefers-reduced-motion` neutralizuje motion-unlock.
     Bez animacji treść i tak musi poczekać na zniknięcie loadera — inaczej
     przez rozmycie było widać tekst, zanim strona się wczytała. */
  var noMotion = (window.RejMotion && window.RejMotion.status && window.RejMotion.status() === "off") ||
    !window.Element || !window.Element.prototype || !window.Element.prototype.animate;

  var SURFACES = [
    "main .card", "main .panel", "main .tool", "main .service-card",
    "main .wid-card", "main .wid-demo", "main .wid-cta", "main .kpi-card",
    "main .profile-card", "main .auth-card", "main .adm-card", "main .adm-kpi",
    "main .toolbar-card", "main .inspector-card", "main .rjc-subject",
    "main .rjc-workspace", "main .file-item", "main .store-card",
    "main .timeline-card", "main .dropzone", "main .comm-card",
    "main .partner-option", "main .partner-form-card", "main .rj-cta",
    "main .rj-premium", "main .universe-links a", "main .notfound > div",
    "main .rj-page-index"
  ];

  var SELECTOR = [
    ".rj-shared-header",
    ".rj-side-ads",
    "#rj-mobile-ads",
    "footer",
    ".rj-home-stats",
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
        { opacity: 0, transform: "translate3d(10px,-46px,0) scale(.9)", filter: "blur(10px)" },
        { opacity: 1, transform: "translate3d(0,0,0) scale(1)", filter: "blur(0)" }
      ]
    },
    {
      name: "rise",
      frames: [
        { opacity: 0, transform: "translate3d(-8px,46px,0) scale(.92)", filter: "blur(12px)" },
        { opacity: 1, transform: "translate3d(0,0,0) scale(1)", filter: "blur(0)" }
      ]
    },
    {
      name: "tilt",
      frames: [
        { opacity: 0, transform: "translate3d(34px,16px,0) rotate(2.4deg) scale(.92)", filter: "blur(9px)" },
        { opacity: 1, transform: "translate3d(0,0,0) rotate(0deg) scale(1)", filter: "blur(0)" }
      ]
    },
    {
      name: "slide",
      frames: [
        { opacity: 0, transform: "translate3d(54px,0,0) scale(.94)", filter: "blur(12px)" },
        { opacity: 1, transform: "translate3d(0,0,0) scale(1)", filter: "blur(0)" }
      ]
    },
    {
      name: "pop",
      frames: [
        { opacity: 0, transform: "scale(.8)", filter: "blur(6px)" },
        { opacity: 1, transform: "scale(1)", filter: "blur(0)" }
      ],
      easing: "cubic-bezier(.18,1.34,.36,1)"
    },
    {
      name: "glide",
      frames: [
        { opacity: 0, transform: "translate3d(-44px,20px,0) rotate(-1.8deg) scale(.94)", filter: "blur(10px)" },
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

  /* ---------- wybrane kierunki ---------- */

  /* Topbar zawsze z góry, reklamy zawsze z prawej/dolu — tego nie losujemy. */
  function directionFor(el) {
    if (el.classList.contains("rj-shared-header")) {
      return {
        frames: [
          { opacity: 0, transform: "translate3d(0,-110%,0)" },
          { opacity: 1, transform: "translate3d(0,0,0)" }
        ],
        duration: 980,
        easing: "cubic-bezier(.16,.92,.24,1)",
        delay: 0
      };
    }
    if (el.classList.contains("rj-side-ads")) {
      return {
        frames: [
          { opacity: 0, transform: "translate3d(120%,0,0) scale(.96)" },
          { opacity: 1, transform: "translate3d(0,0,0) scale(1)" }
        ],
        duration: 900,
        easing: "cubic-bezier(.16,.92,.24,1)",
        delay: 620
      };
    }
    if (el.id === "rj-mobile-ads") {
      return {
        frames: [
          { opacity: 0, transform: "translate3d(0,120%,0)" },
          { opacity: 1, transform: "translate3d(0,0,0)" }
        ],
        duration: 820,
        easing: "cubic-bezier(.16,.92,.24,1)",
        delay: 620
      };
    }
    return null;
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
    if (el.closest("#rj-page-loader, .card-preview, .sx-stage, iframe, noscript")) return false;
    /* Pasek mini reklam jest tworzony przez skrypt — może być jeszcze ukryty
       (display:none na wąskich ekranach), ale ma wejść animacją, gdy się pokaże. */
    if (el.hasAttribute("hidden") && el.id !== "rj-mobile-ads") return false;
    var style = window.getComputedStyle(el);
    if (style.display === "none") return false;
    /* `rj-boot-failsafe` to nasz własny bezpiecznik schowania treści —
       nie jest „prawdziwą” animacją i nie może wykluczać elementu. */
    if (style.animationName && style.animationName !== "none" && style.animationName !== "rj-boot-failsafe") return false;
    var rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return false;
    if (rect.bottom < -40) return false;
    if (rect.top > window.innerHeight * 2.4) return false;
    return true;
  }

  function collect() {
    var list = [];
    Array.prototype.forEach.call(document.querySelectorAll(SELECTOR), function (el) {
      if (!usable(el)) return;
      if (list.some(function (other) { return other !== el && other.contains(el); })) return;
      list = list.filter(function (other) { return !el.contains(other); });
      list.push(el);
    });
    return list;
  }

  function scoreOf(el) {
    var rect = el.getBoundingClientRect();
    return rect.top - rect.left;
  }

  /* ---------- animowanie ---------- */

  function play(el, delay, options) {
    var variant = pickVariant();
    var duration = 900 + Math.round(Math.random() * 320);
    var easing = variant.easing || "cubic-bezier(.16,.88,.26,1)";
    /* Telefon: bez rozmycia — filtr na kilkudziesięciu taflach gubi klatki,
       a sam ruch wystarcza do efektu. */
    var frames = window.innerWidth < 700
      ? variant.frames.map(function (frame) {
          return { opacity: frame.opacity, transform: frame.transform };
        })
      : variant.frames;
    if (options && options.frames) {
      frames = options.frames;
      duration = options.duration || duration;
      easing = options.easing || easing;
      delay = (options.delay || 0) + delay;
    }
    var animation;
    try {
      animation = el.animate(frames, {
        duration: duration,
        delay: delay,
        easing: easing,
        fill: "both"
      });
    } catch (error) {
      el.style.opacity = "";
      return;
    }
    /* Animacja (fill: both) ma pierwszeństwo nad stylem inline, więc od razu
       zdejmujemy zaparkowane `opacity: 0`. Wcześniej zostawało ono na
       elemencie — po `cancel()` na końcu animacji element wracał do zera
       i cała strona znikała tuż po tym, jak ładnie się pojawiła. */
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
    var step = letters.length > 70 ? 12 : 20;
    letters.forEach(function (letter, index) {
      var animation;
      try {
        animation = letter.animate(
          [
            { opacity: 0, transform: "translate3d(0,.46em,0) rotate(-5deg) scale(.9)" },
            { opacity: 1, transform: "translate3d(0,0,0) rotate(0deg) scale(1)" }
          ],
          {
            duration: 640,
            delay: delay + index * step,
            easing: "cubic-bezier(.2,1.4,.34,1)",
            fill: "both"
          }
        );
      } catch (error) {
        letter.style.opacity = "";
        return;
      }
      /* To samo co przy taflach: bez zdjęcia `opacity: 0` litery zniknęłyby
         w chwili zakończenia animacji. */
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

    /* Najpierw wszystkie kandydaty na opacity:0 — w tej samej klatce, w której
       zdejmujemy `rj-booting`, więc nic nie mignie przed animacją. */
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
    document.documentElement.classList.remove("rj-booting");

    /* Fala: rozpiętość startów ograniczona, żeby przy 100 taflach nie trwało
       to pół minuty, ale przy kilku elementach było wyraźnie widać kolejność. */
    var step = Math.max(9, Math.min(34, Math.round(1600 / Math.max(1, ranks.length))));

    ranks.forEach(function (item, index) {
      play(item.el, 60 + index * step, directionFor(item.el));
    });

    letterBuckets.forEach(function (bucket) {
      var score = scoreOf(bucket.heading);
      var rank = 0;
      ranks.forEach(function (item) {
        if (item.score < score) rank += 1;
      });
      var delay = 120 + Math.min(rank, ranks.length) * step + 60;
      playLetters(bucket.letters, delay);
    });

    rescue();
  }

  /* Siatka bezpieczeństwa: gdyby animacja nie wystartowała (np. karta w tle),
     po kilku sekundach i tak pokazujemy treść. */
  function rescue() {
    window.setTimeout(function () {
      document.documentElement.classList.remove("rj-booting");
      tracked.forEach(function (el) {
        el.style.opacity = "";
        el.style.willChange = "";
      });
    }, 9000);
  }

  /* Startujemy DOKŁADNIE w klatce, w której loader zaczyna znikać.
     Wcześniej czekaliśmy dodatkowe 340 ms: treść była już odsłonięta przez
     loader, potem page-reveal ustawiał opacity 0 i dopiero po chwili ruszała
     animacja — na telefonie wyglądało to jak błysk, zniknięcie i opóźnione
     pojawienie się strony. Teraz oba zdarzenia są jednym ruchem, a `rj-booting`
     zdejmuje wyłącznie ten skrypt (loaderzy tylko pilnują bezpiecznika). */
  function whenReady(callback) {
    var overlay = document.getElementById("rj-page-loader");
    if (!overlay) {
      callback();
      return;
    }
    if (overlay.classList.contains("is-hidden") || overlay.style.display === "none") {
      callback();
      return;
    }
    var fired = false;
    function fire() {
      if (fired) return;
      fired = true;
      callback();
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
    if (noMotion) {
      whenReady(function () { document.documentElement.classList.remove("rj-booting"); });
      return;
    }
    whenReady(run);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.RejReveal = { start: run };
})(window, document);
