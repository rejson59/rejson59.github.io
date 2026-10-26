/*!
 * RJMedia — załączniki do zgłoszeń błędów.
 *
 * Trzy drogi zdobycia obrazu:
 *   1. pickScreenFrame()  — prawdziwy zrzut ekranu (getDisplayMedia, jedna klatka,
 *                           uprawnienie odbierane natychmiast po zrobieniu zdjęcia).
 *                           Jako jedyny łapie wnętrze iframe'ów projektów.
 *   2. captureDom()       — cicha migawka strony bez pytania o zgodę (html2canvas,
 *                           lokalny plik z js/vendor). Iframe'y zostaną puste.
 *   3. fromFile()         — plik z dysku, wklejenie ze schowka (Ctrl+V) lub drag & drop.
 *
 * Oraz tryb „ostatnie 15 s" (à la Medal), ale uczciwie:
 *   nagrywanie startuje wyłącznie po kliknięciu i zgodzie przeglądarki,
 *   w pasku systemowym cały czas widać wskaźnik nagrywania. Bufor trzyma
 *   ostatnie 15 sekund; przy zgłoszeniu ta chwila leci jako załącznik .webm.
 *
 * Wgrywanie: prywatny bucket Supabase `feedback-media` (anon może dodać plik,
 * odczytać może wyłącznie administrator).
 */
(function () {
  "use strict";

  var SUPABASE_URL = "https://hzbqzfimtroixnldzjeq.supabase.co";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE";
  var BUCKET = "feedback-media";

  var REPLAY_SECONDS = 15;
  var MAX_IMAGE_BYTES = 1400000;
  var MAX_FILE_BYTES = 10485760;

  var vendorBase = "";
  try {
    vendorBase = new URL("../js/vendor/", document.currentScript.src).href;
  } catch (e) {
    vendorBase = "js/vendor/";
  }

  /* ------------------------------------------------------------------ */
  /*  Narzędzia                                                          */
  /* ------------------------------------------------------------------ */

  function uid() {
    return "rj" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function newAttachment(kind, blob, extra) {
    return {
      id: uid(),
      kind: kind,
      blob: blob,
      mime: blob.type || (extra && extra.mime) || "application/octet-stream",
      bytes: blob.size || 0,
      durationMs: (extra && extra.durationMs) || null,
      label: (extra && extra.label) || "",
      url: URL.createObjectURL(blob),
      uploadedPath: null
    };
  }

  function isSecureContextOk() {
    return window.isSecureContext !== false && !!navigator.mediaDevices;
  }

  /* Zgoda przeglądarki = wyraźny przycisk użytkownika; błąd anulowania nie jest błędem */
  function friendlyError(err) {
    var name = (err && err.name) || "";
    if (name === "NotAllowedError" || name === "AbortError") return "Przerwano — brak zgody na dostęp do ekranu.";
    if (name === "NotFoundError") return "Nie znaleziono ekranu do nagrania.";
    if (name === "NotSupportedError") return "Ta przeglądarka nie obsługuje tej funkcji.";
    return (err && err.message) || "Nie udało się.";
  }

  async function stopTracks(stream) {
    if (!stream) return;
    try {
      stream.getTracks().forEach(function (t) {
        try { t.stop(); } catch (e) { /* ignorujemy */ }
      });
    } catch (e) { /* ignorujemy */ }
  }

  function waitVideoFrame(video) {
    return new Promise(function (resolve, reject) {
      var done = false;
      function finish(ok, err) {
        if (done) return;
        done = true;
        if (ok) resolve();
        else reject(err);
      }
      video.onloadedmetadata = function () {
        try {
          video.play().catch(function () { /* autoplay może być zablokowany */ });
        } catch (e) { /* ignorujemy */ }
        /* jedna klatka + chwila na ustabilizowanie obrazu */
        setTimeout(function () { finish(true); }, 320);
      };
      video.onerror = function () { finish(false, new Error("Nie udało się odczytać obrazu.")); };
      setTimeout(function () {
        if (!done && video.videoWidth) finish(true);
        else if (!done) finish(false, new Error("Ekran nie odpowiedział na czas."));
      }, 4000);
    });
  }

  /* ------------------------------------------------------------------ */
  /*  1. Prawdziwy zrzut ekranu (jedna klatka, uprawnienie od razu kończone) */
  /* ------------------------------------------------------------------ */

  async function pickScreenFrame() {
    if (!isSecureContextOk() || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error("Ta przeglądarka nie pozwala zrobić zrzutu ekranu.");
    }

    var stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 10 },
      audio: false,
      preferCurrentTab: true
    });

    try {
      var video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await waitVideoFrame(video);

      var w = video.videoWidth || 1280;
      var h = video.videoHeight || 720;
      var scale = Math.min(1, 1920 / w);
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

      var blob = await new Promise(function (resolve) {
        canvas.toBlob(function (b) { resolve(b); }, "image/jpeg", 0.9);
      });
      if (!blob) throw new Error("Nie udało się zapisać zrzutu.");

      return newAttachment("screenshot", blob, { label: "Zrzut ekranu" });
    } finally {
      /* ekran jest udostępniany naprawdę tylko na jedną klatkę */
      await stopTracks(stream);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  2. Cicha migawka DOM (bez zgód, bez iframe'ów)                     */
  /* ------------------------------------------------------------------ */

  var h2cPromise = null;
  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (h2cPromise) return h2cPromise;
    h2cPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = vendorBase + "html2canvas.min.js";
      s.async = true;
      s.onload = function () {
        if (window.html2canvas) resolve(window.html2canvas);
        else reject(new Error("Nie udało się uruchomić migawki."));
      };
      s.onerror = function () { reject(new Error("Nie udało się pobrać modułu migawki.")); };
      document.head.appendChild(s);
    });
    return h2cPromise;
  }

  async function captureDom() {
    var h2c = await loadHtml2Canvas();
    var bg = "";
    try {
      bg = getComputedStyle(document.body).backgroundColor;
    } catch (e) { /* ignorujemy */ }

    var vw = document.documentElement.clientWidth || window.innerWidth;
    var vh = window.innerHeight || 800;

    var canvas = await h2c(document.body, {
      scale: Math.min(1, 1280 / Math.max(vw, 1)),
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: bg && bg !== "rgba(0, 0, 0, 0)" ? bg : "#0b0e13",
      width: vw,
      height: vh,
      windowWidth: vw,
      windowHeight: vh,
      scrollX: 0,
      scrollY: -window.scrollY,
      ignoreElements: function (el) {
        /* samego siebie nie fotografujemy */
        return el.classList && el.classList.contains("rj-sheet");
      }
    });

    var blob = await new Promise(function (resolve) {
      canvas.toBlob(function (b) { resolve(b); }, "image/jpeg", 0.85);
    });
    if (!blob) throw new Error("Nie udało się zapisać migawki.");
    return newAttachment("dom", blob, { label: "Migawka strony" });
  }

  /* ------------------------------------------------------------------ */
  /*  3. Plik / schowek                                                  */
  /* ------------------------------------------------------------------ */

  function shrinkImage(blob) {
    if (!/^image\//.test(blob.type) || blob.size <= MAX_IMAGE_BYTES) return Promise.resolve(blob);
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (out) {
          resolve(out && out.size < blob.size ? out : blob);
        }, "image/jpeg", 0.82);
      };
      img.onerror = function () { resolve(blob); };
      img.src = URL.createObjectURL(blob);
    });
  }

  async function fromFile(file) {
    if (!file || !file.size) throw new Error("Pusty plik.");
    if (file.size > MAX_FILE_BYTES) throw new Error("Plik jest za duży (limit 10 MB).");
    var okType = /^image\//.test(file.type) || /^video\//.test(file.type);
    if (!okType) throw new Error("Dozwolone są obrazy i nagrania.");
    var blob = await shrinkImage(file);
    return newAttachment(/^video\//.test(blob.type) ? "file" : "file", blob, {
      label: file.name ? file.name.slice(0, 60) : "Plik"
    });
  }

  function fromClipboard(ev) {
    var items = (ev && ev.clipboardData && ev.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        var f = items[i].getAsFile();
        if (f) return fromFile(f);
      }
    }
    return Promise.reject(new Error("W schowku nie ma obrazu."));
  }

  /* ------------------------------------------------------------------ */
  /*  4. Tryb „ostatnie 15 sekund"                                       */
  /* ------------------------------------------------------------------ */

  var replay = {
    active: false,
    stream: null,
    recorder: null,
    header: null,     /* pierwszy fragment (nagłówek EBML) — trzymany zawsze */
    tail: [],         /* fragmenty z ostatnich 15 s */
    startedAt: 0,
    mime: ""
  };

  function pruneTail() {
    var cutoff = Date.now() - REPLAY_SECONDS * 1000;
    while (replay.tail.length && replay.tail[0].at < cutoff) {
      replay.tail.shift();
    }
  }

  function broadcast() {
    try {
      document.dispatchEvent(new CustomEvent("rj:replay-state", {
        detail: { active: replay.active, seconds: REPLAY_SECONDS }
      }));
    } catch (e) { /* ignorujemy */ }
  }

  function pickRecorderMime() {
    var candidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4"
    ];
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    for (var i = 0; i < candidates.length; i++) {
      if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    }
    return "";
  }

  function clearReplay() {
    replay.header = null;
    replay.tail = [];
  }

  async function startReplay() {
    if (replay.active) return { active: true };
    if (!isSecureContextOk() || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error("Ta przeglądarka nie pozwala nagrywać ekranu.");
    }
    if (!window.MediaRecorder) {
      throw new Error("Ta przeglądarka nie obsługuje nagrywania.");
    }

    var stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 24, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
      preferCurrentTab: true
    });

    var mime = pickRecorderMime();
    var recorder;
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: mime || undefined,
        videoBitsPerSecond: 1200000
      });
    } catch (e) {
      await stopTracks(stream);
      throw new Error("Nie udało się uruchomić nagrywania.");
    }

    replay.stream = stream;
    replay.recorder = recorder;
    replay.mime = recorder.mimeType || mime || "video/webm";
    replay.startedAt = Date.now();
    replay.active = true;
    clearReplay();

    recorder.ondataavailable = function (ev) {
      if (!ev.data || !ev.data.size) return;
      if (!replay.header) {
        replay.header = ev.data; /* nagłówek kontenera — bez niego plik się nie otworzy */
        return;
      }
      replay.tail.push({ at: Date.now(), data: ev.data });
      pruneTail();
    };

    /* użytkownik może zakończyć udostępnianie z paska systemowego */
    stream.getVideoTracks().forEach(function (track) {
      track.addEventListener("ended", function () {
        try { recorder.stop(); } catch (e) { /* ignorujemy */ }
        replay.active = false;
        broadcast();
      });
    });

    recorder.start(1000);
    broadcast();
    return { active: true };
  }

  function stopReplay() {
    if (replay.recorder && replay.recorder.state !== "inactive") {
      try { replay.recorder.stop(); } catch (e) { /* ignorujemy */ }
    }
    stopTracks(replay.stream);
    replay.stream = null;
    replay.recorder = null;
    replay.active = false;
    clearReplay();
    broadcast();
  }

  /* Zabiera bufor jako gotowy plik (nagrywanie kończy się w tym momencie) */
  function takeReplay() {
    return new Promise(function (resolve, reject) {
      if (!replay.active || !replay.recorder) {
        reject(new Error("Nagrywanie nie jest włączone."));
        return;
      }
      var recorder = replay.recorder;
      var parts = [];
      if (replay.header) parts.push(replay.header);
      replay.tail.forEach(function (c) { parts.push(c.data); });

      var durationMs = Math.min(REPLAY_SECONDS * 1000, Date.now() - replay.startedAt);
      var type = replay.mime || "video/webm";

      recorder.addEventListener("stop", function () { /* domknięcie strumienia */ }, { once: true });

      function finish() {
        try { recorder.stop(); } catch (e) { /* ignorujemy */ }
        stopTracks(replay.stream);
        replay.stream = null;
        replay.recorder = null;
        replay.active = false;
        clearReplay();
        broadcast();

        if (!parts.length) {
          reject(new Error("Bufor nagrania jest pusty."));
          return;
        }
        var blob = new Blob(parts, { type: type });
        if (!blob.size) {
          reject(new Error("Bufor nagrania jest pusty."));
          return;
        }
        resolve(newAttachment("replay", blob, {
          durationMs: durationMs,
          label: "Ostatnie " + Math.round(durationMs / 1000) + " s ekranu"
        }));
      }

      /* ostatni fragment trafia w zdarzeniu dataavailable tuż przed stop */
      recorder.addEventListener("dataavailable", function (ev) {
        if (ev.data && ev.data.size) {
          if (!replay.header) replay.header = ev.data;
          else parts.push(ev.data);
        }
      }, { once: true });

      recorder.addEventListener("stop", finish, { once: true });
      try { recorder.stop(); } catch (e) { finish(); }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  5. Wysyłka do prywatnego bucketu                                   */
  /* ------------------------------------------------------------------ */

  function extFor(mime) {
    if (/png/.test(mime)) return "png";
    if (/jpe?g/.test(mime)) return "jpg";
    if (/webp/.test(mime)) return "webp";
    if (/webm/.test(mime)) return "webm";
    if (/mp4/.test(mime)) return "mp4";
    return "bin";
  }

  async function upload(attachment) {
    if (attachment.uploadedPath) return attachment.uploadedPath;

    var d = new Date();
    var month = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0");
    var path = "m/" + month + "/" + attachment.kind + "-" + uid() + "." + extFor(attachment.mime);

    var res = await fetch(SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + path, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": attachment.mime || "application/octet-stream",
        "x-upsert": "false",
        "cache-control": "31536000"
      },
      body: attachment.blob
    });

    if (!res.ok) {
      var txt = "";
      try { txt = await res.text(); } catch (e) { /* ignorujemy */ }
      throw new Error("Nie udało się wysłać pliku (" + res.status + ")" + (txt ? ": " + txt.slice(0, 120) : ""));
    }

    attachment.uploadedPath = path;
    return path;
  }

  /* ------------------------------------------------------------------ */
  /*  API                                                               */
  /* ------------------------------------------------------------------ */

  window.RJMedia = {
    REPLAY_SECONDS: REPLAY_SECONDS,
    supported: {
      screen: isSecureContextOk() && !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
      record: typeof window.MediaRecorder === "function"
    },
    pickScreenFrame: pickScreenFrame,
    captureDom: captureDom,
    fromFile: fromFile,
    fromClipboard: fromClipboard,
    upload: upload,
    startReplay: startReplay,
    stopReplay: stopReplay,
    takeReplay: takeReplay,
    isReplaying: function () { return replay.active; },
    friendlyError: friendlyError
  };
})();
