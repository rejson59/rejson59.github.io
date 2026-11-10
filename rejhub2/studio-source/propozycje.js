/* ============================================================================
   Szklane studio 2.0 — interakcje nowych sekcji (pigułka, topbary, podglądy)
   ========================================================================== */
(function () {
  "use strict";

  var studio = document.querySelector(".studio");
  if (!studio) return;

  var reduceMotion = function () {
    return window.RejMotion ? window.RejMotion.status() === "off" : false;
  };

  function toast(stage, text) {
    var box = stage && stage.querySelector(".sx-pill-toast");
    if (!box) return;
    box.textContent = text;
    box.classList.add("is-on");
    clearTimeout(box._t);
    box._t = setTimeout(function () { box.classList.remove("is-on"); }, 2200);
  }

  /* ---------------- pigułki ---------------- */
  studio.querySelectorAll("[data-sx-pill]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var kind = btn.getAttribute("data-sx-pill");
      var text = kind === "orbita"
        ? "Zgłoszenie zapisane — kropka obiegła taflę."
        : kind === "fala"
          ? "Fala światła poszła dalej. Zgłoszenie przyjęte."
          : "Magnes zadziałał — zgłoszenie zapisane.";
      toast(btn.closest(".sx-stage"), text);
    });
  });

  /* szuflada */
  var drawer = studio.querySelector("[data-sx-drawer]");
  var drawerOpen = studio.querySelector("[data-sx-drawer-open]");
  var drawerStage = drawer && drawer.closest(".sx-stage");
  if (drawer && drawerOpen) {
    drawerOpen.addEventListener("click", function () {
      var open = drawer.hidden;
      drawer.hidden = !open;
      drawerOpen.setAttribute("aria-expanded", String(open));
      if (open) {
        var field = drawer.querySelector("textarea");
        if (field) setTimeout(function () { field.focus(); }, 60);
      }
    });
    var closeBtn = studio.querySelector("[data-sx-drawer-close]");
    if (closeBtn) closeBtn.addEventListener("click", function () {
      drawer.hidden = true;
      drawerOpen.setAttribute("aria-expanded", "false");
      drawerOpen.focus();
    });

    drawer.querySelectorAll("[data-sx-kind]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        drawer.querySelectorAll("[data-sx-kind]").forEach(function (other) {
          other.setAttribute("aria-selected", String(other === tab));
        });
        var field = drawer.querySelector("textarea");
        if (field) field.placeholder = tab.getAttribute("data-sx-kind") === "Błąd"
          ? "Co się stało? Dwa zdania wystarczą…"
          : tab.getAttribute("data-sx-kind") === "Pomysł"
            ? "Co warto dodać? Opisz krótko…"
            : "O co chcesz zapytać?";
      });
    });

    var field = drawer.querySelector("textarea");
    var counter = drawer.querySelector("[data-sx-counter]");
    if (field && counter) field.addEventListener("input", function () {
      counter.textContent = field.value.length + " / 240";
    });

    var send = drawer.querySelector("[data-sx-send]");
    if (send) send.addEventListener("click", function () {
      drawer.hidden = true;
      drawerOpen.setAttribute("aria-expanded", "false");
      if (field) field.value = "";
      if (counter) counter.textContent = "0 / 240";
      toast(drawerStage, "Dziękuję! Zgłoszenie trafiło do panelu.");
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !drawer.hidden) {
        drawer.hidden = true;
        drawerOpen.setAttribute("aria-expanded", "false");
        drawerOpen.focus();
      }
    });
  }

  /* magnes: pigułka podąża za kursorem w obrębie scenki */
  studio.querySelectorAll("[data-sx-magnet-stage]").forEach(function (stage) {
    var pill = stage.querySelector(".sx-pill--magnet");
    if (!pill) return;
    stage.addEventListener("pointermove", function (event) {
      if (reduceMotion()) return;
      var box = stage.getBoundingClientRect();
      var dx = (event.clientX - (box.left + box.width / 2)) / box.width;
      var dy = (event.clientY - (box.top + box.height / 2)) / box.height;
      pill.style.transform = "translate(" + (dx * 14).toFixed(2) + "px," + (dy * 10).toFixed(2) + "px) rotateX(" + (-dy * 8).toFixed(2) + "deg) rotateY(" + (dx * 10).toFixed(2) + "deg)";
    });
    stage.addEventListener("pointerleave", function () {
      pill.style.transform = "";
    });
  });

  /* ---------------- topbar z magnesem ---------------- */
  studio.querySelectorAll(".sx-nav--magnet").forEach(function (nav) {
    var links = Array.prototype.slice.call(nav.querySelectorAll("a"));
    nav.addEventListener("pointermove", function (event) {
      links.forEach(function (link) {
        var box = link.getBoundingClientRect();
        var center = box.left + box.width / 2;
        var distance = Math.abs(event.clientX - center);
        link.classList.toggle("is-touch", distance < 34);
        link.classList.toggle("is-near", distance >= 34 && distance < 88);
      });
    });
    nav.addEventListener("pointerleave", function () {
      links.forEach(function (link) { link.classList.remove("is-touch", "is-near"); });
    });
  });

  /* ---------------- paleta poleceń ---------------- */
  var cmd = studio.querySelector("[data-sx-cmd]");
  var cmdOpen = studio.querySelector("[data-sx-cmd-open]");
  var cmdInput = studio.querySelector("[data-sx-cmd-input]");
  if (cmd && cmdOpen) {
    cmdOpen.addEventListener("click", function () {
      cmd.hidden = !cmd.hidden;
      if (!cmd.hidden && cmdInput) setTimeout(function () { cmdInput.focus(); }, 40);
    });
    if (cmdInput) cmdInput.addEventListener("input", function () {
      var q = cmdInput.value.trim().toLowerCase();
      cmd.querySelectorAll("li").forEach(function (li) {
        li.hidden = q.length > 0 && li.textContent.toLowerCase().indexOf(q) === -1;
      });
    });
    /* Skrót klawiszowy usunięty — paleta otwiera się przyciskiem. */
  }

  /* ---------------- stos powiadomień ---------------- */
  var toastZone = studio.querySelector("[data-sx-toast-zone]");
  var toastBtn = studio.querySelector("[data-sx-toast]");
  if (toastZone && toastBtn) {
    var count = 0;
    toastBtn.addEventListener("click", function () {
      count += 1;
      var note = document.createElement("div");
      note.className = "sx-toast";
      note.textContent = "Nowe zgłoszenie #" + (120 + count) + " przyjęte";
      toastZone.querySelectorAll(".sx-toast").forEach(function (old, i) {
        old.style.transform = "translate(-50%, " + (-(i + 1) * 34) + "px)";
        old.style.opacity = "0.45";
      });
      toastZone.appendChild(note);
      setTimeout(function () { note.remove(); }, 2400);
    });
  }

  /* ---------------- przełącznik języka ---------------- */
  studio.querySelectorAll(".sx-seg").forEach(function (seg) {
    var buttons = seg.querySelectorAll("button");
    var line = seg.querySelector(".sx-seg-line");
    function move(target) {
      buttons.forEach(function (button) {
        button.classList.toggle("is-on", button === target);
      });
      if (!line) return;
      line.style.width = target.offsetWidth + "px";
      line.style.transform = "translateX(" + (target.offsetLeft - 4) + "px)";
    }
    var current = seg.querySelector("button.is-on") || buttons[0];
    buttons.forEach(function (button) {
      button.addEventListener("click", function () { current = button; move(button); });
    });
    move(current);
    window.addEventListener("load", function () { move(current); });
    /* Panel nowej zakładki jest początkowo ukryty (szerokości = 0), więc
       podkreślenie ustawiamy ponownie, gdy tylko zyska wymiary. */
    if (window.ResizeObserver) {
      new ResizeObserver(function () { if (seg.offsetWidth) move(current); }).observe(seg);
    }
  });

  /* ---------------- karta z parallaxem ---------------- */
  studio.querySelectorAll("[data-sx-tilt]").forEach(function (card) {
    var zone = card.parentElement;
    zone.addEventListener("pointermove", function (event) {
      if (reduceMotion()) return;
      var box = zone.getBoundingClientRect();
      var dx = (event.clientX - (box.left + box.width / 2)) / (box.width / 2);
      var dy = (event.clientY - (box.top + box.height / 2)) / (box.height / 2);
      card.style.transform = "rotateX(" + (-dy * 12).toFixed(2) + "deg) rotateY(" + (dx * 14).toFixed(2) + "deg) translateZ(6px)";
    });
    zone.addEventListener("pointerleave", function () { card.style.transform = ""; });
  });

  /* ---------------- magnetyczny przycisk ---------------- */
  studio.querySelectorAll("[data-sx-magnet]").forEach(function (button) {
    var zone = button.parentElement;
    zone.addEventListener("pointermove", function (event) {
      if (reduceMotion()) return;
      var box = button.getBoundingClientRect();
      var dx = event.clientX - (box.left + box.width / 2);
      var dy = event.clientY - (box.top + box.height / 2);
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 130) { button.style.transform = ""; return; }
      button.style.transform = "translate(" + (dx * 0.22).toFixed(2) + "px," + (dy * 0.22).toFixed(2) + "px)";
    });
    zone.addEventListener("pointerleave", function () { button.style.transform = ""; });
  });

  /* ---------------- polubienie z konfetti ---------------- */
  studio.querySelectorAll("[data-sx-like]").forEach(function (button) {
    var counter = button.querySelector("[data-sx-like-count]");
    var liked = false;
    button.addEventListener("click", function () {
      liked = !liked;
      button.classList.remove("is-on");
      void button.offsetWidth;
      button.classList.add("is-on");
      if (counter) {
        var value = parseInt(counter.textContent, 10) || 0;
        counter.textContent = String(value + (liked ? 1 : -1));
      }
      var zone = button.parentElement;
      var box = button.getBoundingClientRect();
      var colors = ["#a8c8ff", "#a4e6d7", "#ffd6a5", "#e0b3ff"];
      for (var i = 0; i < 12; i++) {
        var bit = document.createElement("i");
        bit.className = "sx-confetti";
        bit.style.left = box.left - zone.getBoundingClientRect().left + box.width / 2 + "px";
        bit.style.top = box.top - zone.getBoundingClientRect().top + box.height / 2 + "px";
        bit.style.background = colors[i % colors.length];
        bit.style.setProperty("--dx", (Math.random() * 120 - 60).toFixed(0) + "px");
        bit.style.setProperty("--dy", (-Math.random() * 90 - 20).toFixed(0) + "px");
        bit.style.setProperty("--rot", (Math.random() * 360).toFixed(0) + "deg");
        zone.appendChild(bit);
        setTimeout(function (node) { return function () { node.remove(); }; }(bit), 950);
      }
    });
  });

  /* ---------------- podglądy urządzeń ---------------- */
  var DEVICES = {
    desktop: { w: 1440, h: 900, label: "1440 × 900" },
    tablet: { w: 834, h: 1112, label: "834 × 1112" },
    phone: { w: 390, h: 844, label: "390 × 844" }
  };

  var demoDoc = [
    "<!doctype html><html lang='pl'><head><meta charset='utf-8'>",
    "<meta name='viewport' content='width=device-width,initial-scale=1'>",
    "<style>",
    ":root{--ink:#17243b;--muted:#5a6c8c;--line:rgba(23,36,59,.12);--accent:#3f74c9}",
    "*{box-sizing:border-box}html,body{margin:0}",
    "body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--ink);background:#eef3fb}",
    "body::before{content:'';position:fixed;inset:0;z-index:-1;background:radial-gradient(60% 50% at 8% 0%,#c9dcff,transparent 62%),radial-gradient(60% 60% at 92% 12%,#e6c9ff,transparent 60%),radial-gradient(70% 70% at 50% 100%,#ffdcc2,transparent 62%),#eef3fb}",
    ".wrap{width:min(1200px,calc(100% - 64px));margin:0 auto}",
    "header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:18px;margin-top:14px;padding:10px 16px;border:1px solid rgba(255,255,255,.7);border-radius:999px;background:rgba(255,255,255,.62);box-shadow:0 18px 40px -30px rgba(23,36,59,.6);backdrop-filter:blur(12px) saturate(180%)}",
    ".brand{display:flex;align-items:center;gap:9px;font-weight:800;letter-spacing:-.02em;font-size:15px}",
    ".mark{display:block;width:28px;height:28px;object-fit:contain}",
    "nav{display:flex;gap:2px;margin-left:auto}nav a{padding:8px 12px;border-radius:999px;color:var(--muted);text-decoration:none;font-size:13px;font-weight:600}nav a.on{background:rgba(63,116,201,.14);color:var(--accent)}",
    ".cta{border:0;border-radius:999px;padding:9px 15px;background:linear-gradient(145deg,#7ea8ea,#3f74c9);color:#fff;font-weight:700;font-size:12.5px}",
    ".hero{display:grid;grid-template-columns:1.15fr .85fr;gap:26px;align-items:center;margin:26px 0 22px;padding:26px;border:1px solid rgba(255,255,255,.72);border-radius:26px;background:linear-gradient(160deg,rgba(255,255,255,.78),rgba(255,255,255,.46));box-shadow:0 30px 60px -46px rgba(23,36,59,.6)}",
    ".kicker{font-size:10px;letter-spacing:.18em;color:var(--muted);margin:0 0 8px}",
    "h1{margin:0 0 10px;font-size:40px;line-height:1.05;letter-spacing:-.035em}",
    "h1 em{font-style:normal;color:var(--accent)}",
    ".lead{margin:0 0 16px;color:var(--muted);font-size:14px;line-height:1.6;max-width:46ch}",
    ".actions{display:flex;gap:9px;flex-wrap:wrap}",
    ".ghost{border:1px solid var(--line);background:rgba(255,255,255,.6);color:var(--ink);border-radius:999px;padding:9px 15px;font-weight:700;font-size:12.5px}",
    ".art{position:relative;height:170px;border-radius:20px;background:linear-gradient(160deg,rgba(63,116,201,.22),rgba(160,120,220,.18));border:1px solid rgba(255,255,255,.8);overflow:hidden}",
    ".art i{position:absolute;border-radius:50%;background:rgba(255,255,255,.85)}",
    ".art i:nth-child(1){width:56px;height:56px;left:16%;top:22%}.art i:nth-child(2){width:26px;height:26px;right:22%;top:38%}.art i:nth-child(3){width:14px;height:14px;left:44%;bottom:16%}",
    ".grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:26px}",
    ".card{padding:16px;border:1px solid rgba(255,255,255,.72);border-radius:18px;background:rgba(255,255,255,.62);box-shadow:0 18px 40px -34px rgba(23,36,59,.55)}",
    ".card b{display:block;font-size:13.5px;margin-bottom:5px}.card p{margin:0;color:var(--muted);font-size:12px;line-height:1.55}",
    ".card span{display:inline-block;margin-top:10px;font-size:10px;letter-spacing:.14em;color:var(--accent)}",
    "footer{padding:16px 0 30px;color:var(--muted);font-size:11.5px;text-align:center}",
    "@media(max-width:980px){.hero{grid-template-columns:1fr}.grid{grid-template-columns:1fr 1fr}h1{font-size:32px}.wrap{width:calc(100% - 36px)}}",
    "@media(max-width:640px){nav{display:none}.wrap{width:calc(100% - 24px)}h1{font-size:26px}header{margin-top:10px;padding:8px 12px}.cta{display:none}.grid{grid-template-columns:1fr}.hero{padding:20px;border-radius:20px}.art{height:130px}body{padding-bottom:60px}}",
    "body{padding-bottom:12px}",
    "</style></head><body class='preview'>",
    "<div class='wrap'><header><span class='brand'><img class='mark' src='/hub/brand-mark.svg?v=1' alt='' width='28' height='28'>RejHub</span>",
    "<nav><a href='#' class='on'>Start</a><a href='#'>Projekty</a><a href='#'>Studio</a><a href='#'>Konto</a></nav>",
    "<button class='cta' type='button'>Wejdź</button></header>",
    "<section class='hero'><div><p class='kicker'>REJHUB 2.0</p><h1>Pomysły ze <em>szkła</em>.</h1>",
    "<p class='lead'>Ta strona jest podglądem. Zmień szerokość u góry, żeby zobaczyć, jak układ zachowuje się na komputerze, tablecie i telefonie.</p>",
    "<div class='actions'><button class='cta' type='button'>Zobacz projekty</button><button class='ghost' type='button'>O studiu</button></div></div>",
    "<div class='art'><i></i><i></i><i></i></div></section>",
    "<div class='grid'><article class='card'><b>RejStream</b><p>Niezależna animacja i filmy z oficjalnych źródeł.</p><span>PROJEKT 01</span></article>",
    "<article class='card'><b>RejTools</b><p>Szybkie narzędzia w jednym szklanym panelu.</p><span>PROJEKT 02</span></article>",
    "<article class='card'><b>RejClass</b><p>Notatki, quizy i licznik do sprawdzianu.</p><span>PROJEKT 03</span></article></div></div>",
    "<footer>Podgląd urządzenia · Szklane studio</footer></body></html>"
  ].join("");

  var frame = studio.querySelector("[data-sx-device-frame]");
  var screen = studio.querySelector("[data-sx-screen]");
  var wrap = studio.querySelector("[data-sx-screen-wrap]");
  var sizeLabel = studio.querySelector("[data-sx-device-size]");

  function layoutDevice(name) {
    if (!frame || !screen || !wrap) return;
    var dev = DEVICES[name] || DEVICES.desktop;
    if (!wrap.clientWidth) return; /* panel ukryty — zmierzymy po pokazaniu */
    var available = Math.max(280, wrap.clientWidth - 40);
    var visualWidth = Math.min(available, dev.w);
    var scale = visualWidth / dev.w;
    var visualHeight = 520;

    screen.style.width = visualWidth + "px";
    screen.style.height = visualHeight + "px";
    screen.setAttribute("data-device", name);

    var chrome = name === "phone" ? 20 : name === "tablet" ? 18 : 16;
    frame.style.width = dev.w + "px";
    frame.style.height = Math.round((visualHeight - chrome) / scale) + "px";
    frame.style.transform = "scale(" + scale.toFixed(4) + ")";
    frame.style.transformOrigin = "top left";

    var holder = frame.parentElement;
    holder.style.height = visualHeight + "px";
    holder.style.overflow = "hidden";
    if (!holder.dataset.sxReady) {
      holder.dataset.sxReady = "1";
      holder.style.position = "relative";
      var inner = document.createElement("div");
      inner.className = "sx-screen-clip";
      holder.insertBefore(inner, frame);
      inner.appendChild(frame);
      inner.style.cssText = "position:absolute;inset:8px;overflow:hidden;border-radius:inherit";
      frame.style.position = "absolute";
      frame.style.left = "0";
      frame.style.top = "0";
    }

    if (sizeLabel) sizeLabel.textContent = dev.label;
  }

  if (frame) {
    if (!frame.getAttribute("srcdoc")) frame.srcdoc = demoDoc;
    layoutDevice("desktop");

    /* Zakładka „Nowości” startuje ukryta — po pokazaniu mierzymy ponownie. */
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        if (wrap && wrap.clientWidth > 60) {
          var on = studio.querySelector(".sx-device-bar [data-sx-device].is-on");
          layoutDevice(on ? on.getAttribute("data-sx-device") : "desktop");
        }
      }).observe(wrap);
    }

    studio.querySelectorAll("[data-sx-device]").forEach(function (button) {
      button.addEventListener("click", function () {
        var name = button.getAttribute("data-sx-device");
        studio.querySelectorAll("[data-sx-device]").forEach(function (other) {
          var on = other.getAttribute("data-sx-device") === name;
          other.classList.toggle("is-on", on);
          other.setAttribute("aria-pressed", String(on));
        });
        layoutDevice(name);
      });
    });

    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var active = studio.querySelector(".sx-device-bar [data-sx-device].is-on");
        layoutDevice(active ? active.getAttribute("data-sx-device") : "desktop");
      }, 140);
    });
  }

  /* ---------------- przełącznik ruchu ---------------- */
  var motionBtn = studio.querySelector("[data-sx-motion-toggle]");
  var motionState = studio.querySelector("[data-sx-motion-state]");
  if (motionBtn) {
    function paintMotion() {
      var on = !window.RejMotion || window.RejMotion.status() === "on";
      if (motionState) motionState.textContent = on ? "odblokowane" : "wyłączone";
      motionBtn.textContent = on ? "Wyłącz ruch tutaj" : "Włącz ruch z powrotem";
      document.documentElement.setAttribute("data-motion-force", on ? "on" : "off");
    }
    motionBtn.addEventListener("click", function () {
      if (!window.RejMotion) return;
      if (window.RejMotion.status() === "on") window.RejMotion.off();
      else window.RejMotion.on();
      paintMotion();
    });
    paintMotion();
  }
})();
