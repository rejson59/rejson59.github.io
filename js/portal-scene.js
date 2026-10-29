/* Scena portalu jest rysowana w czasie rzeczywistym — bez obrazka ani wideo.
   Ten moduł jest tylko dekoracją; nawigacja działa też bez canvas. */
(function () {
  "use strict";
  var canvas = document.getElementById("portal-scene");
  var door = document.getElementById("portal-door");
  if (!canvas || !door) return;
  var ctx;
  try { ctx = canvas.getContext("2d"); } catch (e) { return; }
  if (!ctx) return;

  var media = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var w = 0, h = 0, dpr = 1, rect = null;
  var time = 0, previous = null, frameId = 0;
  var flight = false, flightElapsed = 0, flightDuration = 4200;
  var seed = 173;
  function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  var stars = Array.from({ length: 140 }, function () {
    return { x: random(), y: random(), size: .45 + random() * 1.4, phase: random() * 7 };
  });
  var dust = Array.from({ length: 110 }, function () {
    return { angle: random() * Math.PI * 2, depth: random(), speed: .55 + random() * .8, size: .5 + random() * 1.5 };
  });
  function measure() {
    var box = door.getBoundingClientRect();
    rect = { x: box.left + box.width / 2, y: box.top + box.height / 2, r: box.width / 2 };
  }
  function resize() {
    w = window.innerWidth; h = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    measure();
    if (media && media.matches) render(0, 0);
  }
  function gradient(x, y, r, stops) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
    stops.forEach(function (stop) { g.addColorStop(stop[0], stop[1]); });
    return g;
  }
  function background(t, cx, cy, r) {
    ctx.fillStyle = "#020812"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = gradient(cx, cy, Math.max(w, h) * .8, [[0, "#153f52"], [.35, "#0b1937"], [.7, "#050e1c"], [1, "#020812"]]);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = gradient(cx + r * .8, cy - r * .45, r * 2.1, [[0, "rgba(67,65,155,.2)"], [.5, "rgba(6,69,92,.09)"], [1, "rgba(0,0,0,0)"]]);
    ctx.fillRect(0, 0, w, h);
    stars.forEach(function (s) {
      var flicker = .35 + .5 * (Math.sin(t * .9 + s.phase) + 1) / 2;
      ctx.fillStyle = "rgba(191,237,255," + flicker + ")";
      ctx.fillRect(s.x * w, s.y * h, s.size, s.size);
    });
  }
  function ellipse(x, y, rx, ry, line, color) {
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), 0, 0, Math.PI * 2);
    ctx.lineWidth = line; ctx.strokeStyle = color; ctx.stroke();
  }
  function platform(cx, cy, r, t) {
    var y = cy + r * 1.1;
    ctx.save();
    ctx.fillStyle = gradient(cx, y, r * 1.8, [[0, "rgba(46,221,216,.20)"], [.5, "rgba(20,117,153,.08)"], [1, "rgba(0,0,0,0)"]]);
    ctx.fillRect(cx - r * 2, y - r, r * 4, r * 2);
    ellipse(cx, y, r * 1.4, r * .18, 1, "rgba(111,233,244,.20)");
    ellipse(cx, y, r * 1.15, r * .12, 1, "rgba(121,238,247,.3)");
    ellipse(cx, y, r * (.74 + .04 * Math.sin(t)), r * .065, 1.5, "rgba(141,255,249,.35)");
    ctx.restore();
  }
  function portal(cx, cy, r, t) {
    if (r < 1) return;
    ctx.save();
    // Światło rozchodzi się poza obręcz, nie tylko w jej wnętrzu.
    ctx.fillStyle = gradient(cx, cy, r * 1.65, [[0, "rgba(28,231,229,.12)"], [.55, "rgba(41,187,222,.18)"], [.78, "rgba(68,86,212,.10)"], [1, "rgba(0,0,0,0)"]]);
    ctx.fillRect(cx - r * 1.7, cy - r * 1.7, r * 3.4, r * 3.4);
    ctx.beginPath(); ctx.arc(cx, cy, r * .93, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = gradient(cx, cy, r, [[0, "#dbffff"], [.035, "#73fff2"], [.13, "#219cbd"], [.35, "#0b315c"], [.72, "#071426"], [1, "#1b8295"]]);
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    // Spiralne smugi zmieniają kształt, kierunek i położenie w każdej klatce.
    ctx.globalCompositeOperation = "screen";
    for (var arm = 0; arm < 18; arm++) {
      var offset = arm * Math.PI * 2 / 18 + t * (arm % 2 ? .18 : -.14);
      ctx.beginPath();
      for (var j = 0; j <= 64; j++) {
        var f = j / 64;
        var rr = r * (.04 + .88 * f);
        var angle = offset + f * 8.5 + .18 * Math.sin(t * 1.1 + f * 9 + arm);
        var px = cx + Math.cos(angle) * rr, py = cy + Math.sin(angle) * rr;
        if (!j) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = arm % 3 === 0 ? "rgba(147,255,247,.35)" : arm % 3 === 1 ? "rgba(57,202,242,.28)" : "rgba(144,130,255,.18)";
      ctx.lineWidth = Math.max(.8, r * (arm % 3 === 0 ? .012 : .006));
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
    ctx.save();
    // Wielowarstwowa obręcz; krótkie smugi biegną po niej niezależnie.
    ellipse(cx, cy, r * 1.02, r * 1.02, Math.max(5, r * .06), "#132c3b");
    ellipse(cx, cy, r * 1.01, r * 1.01, Math.max(2, r * .015), "rgba(116,233,241,.75)");
    ellipse(cx, cy, r * .94, r * .94, Math.max(2, r * .018), "rgba(160,255,249,.88)");
    ellipse(cx, cy, r * 1.08, r * 1.08, 1, "rgba(124,185,212,.25)");
    for (var k = 0; k < 5; k++) {
      ctx.beginPath(); ctx.arc(cx, cy, r * (.975 + (k % 2) * .04), t * (k % 2 ? -.3 : .32) + k * 1.6, t * (k % 2 ? -.3 : .32) + k * 1.6 + .4);
      ctx.strokeStyle = k % 2 ? "rgba(126,255,245,.9)" : "rgba(174,164,255,.65)";
      ctx.lineWidth = Math.max(1.5, r * .012); ctx.stroke();
    }
    // Cząstki krążą także przed obręczą, nadając scenie głębię.
    for (var m = 0; m < 38; m++) {
      var orbit = dust[m], a = orbit.angle + t * .12 * orbit.speed;
      var dist = r * (.75 + orbit.depth * .65);
      var x = cx + Math.cos(a) * dist, y = cy + Math.sin(a) * dist;
      ctx.fillStyle = "rgba(157,255,250," + (.25 + orbit.depth * .5) + ")";
      ctx.beginPath(); ctx.arc(x, y, orbit.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function tunnel(cx, cy, t, progress) {
    var max = Math.hypot(w, h) * .8;
    ctx.save(); ctx.globalCompositeOperation = "screen";
    // Pierścienie poruszają się ku kamerze i znikają poza ekranem.
    for (var i = 0; i < 11; i++) {
      var phase = (i / 11 + t * .33) % 1;
      var radius = max * Math.pow(phase, 2.25);
      var opacity = Math.sin(phase * Math.PI) * .48 * progress;
      ellipse(cx, cy, radius, radius * (.88 + .08 * Math.sin(t * .3 + i)), Math.max(1, phase * 3), "rgba(104,243,255," + opacity + ")");
    }
    dust.forEach(function (p) {
      var z = (p.depth + t * .28 * p.speed) % 1;
      var radius = max * Math.pow(z, 2);
      var length = (5 + 75 * z * z) * progress;
      var a = p.angle + t * .12, dx = Math.cos(a), dy = Math.sin(a);
      ctx.beginPath(); ctx.moveTo(cx + dx * radius, cy + dy * radius);
      ctx.lineTo(cx + dx * (radius + length), cy + dy * (radius + length));
      ctx.lineWidth = .6 + z * 1.8; ctx.strokeStyle = "rgba(161,255,252," + (z * .7 * progress) + ")"; ctx.stroke();
    });
    ctx.restore();
  }
  function render(t, progress) {
    if (!rect) return;
    var approach = Math.min(1, progress / .42);
    var ease = approach * approach * (3 - 2 * approach);
    var cx = rect.x + (w / 2 - rect.x) * ease;
    var cy = rect.y + (h / 2 - rect.y) * ease;
    var r = rect.r * (1 + 5.8 * Math.pow(approach, 2.1));
    background(t, cx, cy, Math.max(rect.r, 1));
    if (progress < .4) platform(cx, cy, r, t);
    portal(cx, cy, r, t + progress * 3);
    if (progress > .22) tunnel(w / 2, h / 2, t + progress * 4, Math.min(1, (progress - .22) / .2));
  }
  function tick(now) {
    frameId = 0;
    if (document.hidden) { previous = null; return; }
    if (previous !== null) {
      var dt = Math.max(0, now - previous);
      time += dt / 1000;
      if (flight) flightElapsed += dt;
    }
    previous = now;
    render(time, flight ? Math.min(1, flightElapsed / flightDuration) : 0);
    if (!(media && media.matches)) frameId = requestAnimationFrame(tick);
  }
  function wake() {
    previous = null;
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    if (!document.hidden) {
      if (media && media.matches) render(time, 0);
      else frameId = requestAnimationFrame(tick);
    }
  }
  window.RJPortalScene = {
    start: function (duration) { measure(); flightDuration = duration; flightElapsed = 0; flight = true; previous = null; wake(); },
    reset: function () { flight = false; flightElapsed = 0; measure(); wake(); }
  };
  document.body.classList.add("scene-ready");
  window.addEventListener("resize", resize);
  window.addEventListener("scroll", function () { measure(); if (media && media.matches) render(time, 0); }, { passive: true });
  document.addEventListener("visibilitychange", wake);
  if (media) {
    if (media.addEventListener) media.addEventListener("change", wake);
    else if (media.addListener) media.addListener(wake);
  }
  resize(); wake();
})();
