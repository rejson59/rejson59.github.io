/*!
 * Portal społeczności — logowanie (nazwa + 4-cyfrowy PIN), wpisy i komentarze.
 * Sesja przechowywana w localStorage pod kluczem rejson_community_session_v1
 * (ten sam klucz odczytuje js/view-tracker.js przy pingach obecności).
 */
(function (window, document) {
  "use strict";

  var SUPABASE_URL = "https://hzbqzfimtroixnldzjeq.supabase.co";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE";

  var SESSION_KEY = "rejson_community_session_v1";
  var FEED_REFRESH_MS = 12000;
  var POST_MAX = 2000;
  var COMMENT_MAX = 1000;

  var session = loadSession(); /* {token, username} | null */
  var nameCheckTimer = null;
  var nameStatus = { valid: false, taken: false, checked: false };
  var feedTimer = null;
  var expandedPosts = {}; /* postId -> true gdy komentarze rozwinięte */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed.token === "string" && parsed.token.length >= 16 && parsed.username) {
        return { token: parsed.token, username: String(parsed.username) };
      }
    } catch (e) { /* ignorujemy */ }
    return null;
  }

  function saveSession(s) {
    if (s && s.token && s.username) {
      session = { token: s.token, username: s.username };
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { /* ignorujemy */ }
    } else {
      session = null;
      try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignorujemy */ }
    }
  }

  function rpc(fnName, body) {
    return fetch(SUPABASE_URL + "/rest/v1/rpc/" + fnName, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body || {}),
      cache: "no-store"
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok) {
          var msg = (data && (data.message || data.hint)) || ("Błąd serwera (" + res.status + ")");
          var err = new Error(msg);
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function relTime(iso) {
    if (!iso) return "";
    var t = Date.parse(iso);
    if (isNaN(t)) return "";
    var diff = Math.max(0, Date.now() - t);
    var s = Math.floor(diff / 1000);
    if (s < 15) return "przed chwilą";
    if (s < 60) return s + " s temu";
    var m = Math.floor(s / 60);
    if (m < 60) return m === 1 ? "1 min temu" : m + " min temu";
    var h = Math.floor(m / 60);
    if (h < 24) return h === 1 ? "1 godz. temu" : h + " godz. temu";
    var d = Math.floor(h / 24);
    return d === 1 ? "wczoraj" : d + " dni temu";
  }

  function commentWord(n) {
    if (n === 1) return "komentarz";
    var r10 = n % 10, r100 = n % 100;
    if (r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14)) return "komentarze";
    return "komentarzy";
  }

  var AGENT_AVATAR_SRC = "assets/agent-avatar.png";

  function avatarFor(name, isBot) {
    var initial = (String(name || "?").trim().charAt(0) || "?").toUpperCase();
    if (isBot === true) {
      return (
        '<span class="comm-avatar comm-avatar-bot" aria-hidden="true">' +
          esc(initial) +
          '<img src="' + AGENT_AVATAR_SRC + '" alt="" loading="lazy" onerror="this.remove()">' +
        "</span>"
      );
    }
    return '<span class="comm-avatar" aria-hidden="true">' + esc(initial) + "</span>";
  }

  /* Odznaka właściciela strony obok nazwy */
  function isOwnerName(name, flagFromDb) {
    if (flagFromDb === true) return true;
    return String(name || "").toLowerCase() === "rejson59";
  }

  function ownerBadgeHTML(name, flagFromDb) {
    if (!isOwnerName(name, flagFromDb)) return "";
    return '<span class="comm-owner-badge" title="Twórca strony rejson59.github.io">👑 Właściciel</span>';
  }

        /* Odznaka oficjalnego agenta AI (konto bota publikującego nowości) */
        var AGENT_NAME = "agent_ai_rejsona";
        function isAgentName(name) {
          return String(name || "").toLowerCase() === AGENT_NAME;
        }
        function botBadgeHTML(flagFromDb) {
          if (flagFromDb !== true) return "";
          return '<span class="comm-bot-badge" title="Oficjalny agent AI Rejsona — publikuje zapowiedzi aktualizacji i nowości ze strony">🤖 Agent AI</span>';
        }
        function agentAvatarMark() {
          return isAgent ? ' with-agent-avatar' : "";
        }

      function authorBadges(name, p) {
        return ownerBadgeHTML(name, p && p.is_owner) + botBadgeHTML(p && p.is_bot);
      }

  /* ================= MEDIA W WPISACH (zdjęcia, GIF-y, filmy) ================= */
  var mediaCache = {}; /* id -> {mime, src} — nie pobieramy drugi raz przy auto-odświeżaniu feedu */
  var mediaObserver = null;

  function mediaTag(entry) {
    if (entry.mime.indexOf("video/") === 0) {
      return '<video class="post-media-item post-media-video" src="' + entry.src + '" controls playsinline preload="metadata"></video>';
    }
    return '<img class="post-media-item post-media-img" src="' + entry.src + '" alt="Załącznik do wpisu" loading="lazy">';
  }

  function mediaItemHTML(m) {
    if (!m || typeof m !== "object") return "";
    if (m.kind === "url" && typeof m.url === "string" && m.url.indexOf("https://rejson59.github.io/") === 0) {
      if (m.type === "video") {
        return '<video class="post-media-item post-media-video" src="' + esc(m.url) + '" controls playsinline preload="metadata"></video>';
      }
      return '<img class="post-media-item post-media-img" src="' + esc(m.url) + '" alt="Załącznik do wpisu" loading="lazy">';
    }
    if (m.kind === "media" && m.id) {
      var cached = mediaCache[m.id];
      if (cached) return mediaTag(cached);
      return (
        '<span class="post-media-item post-media-lazy" data-media-id="' + esc(m.id) + '">' +
          '<span class="post-media-spinner" aria-hidden="true"></span>' +
        "</span>"
      );
    }
    return "";
  }

  function postMediaHTML(media) {
    if (!Array.isArray(media) || !media.length) return "";
    var items = media.map(mediaItemHTML).filter(Boolean).join("");
    if (!items) return "";
    var count = Math.min(media.length, 4);
    return '<div class="post-media post-media-count-' + count + '">' + items + "</div>";
  }

  function hydrateLazyMedia(root) {
    var els = (root || document).querySelectorAll(".post-media-lazy[data-media-id]");
    if (!els.length) return;
    function loadOne(el) {
      if (el._mediaLoading) return;
      el._mediaLoading = true;
      var id = el.getAttribute("data-media-id");
      rpc("community_get_media", { p_id: id })
        .then(function (data) {
          if (data && data.mime && data.data) {
            var entry = { mime: data.mime, src: "data:" + data.mime + ";base64," + data.data };
            mediaCache[id] = entry;
            var holder = document.createElement("span");
            holder.innerHTML = mediaTag(entry);
            if (holder.firstChild) el.replaceWith(holder.firstChild);
          } else {
            el.textContent = "Załącznik niedostępny.";
            el.classList.add("is-error");
          }
        })
        .catch(function () {
          el.textContent = "Nie udało się wczytać załącznika.";
          el.classList.add("is-error");
        });
    }
    if (!("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(els, loadOne);
      return;
    }
    if (!mediaObserver) {
      mediaObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            mediaObserver.unobserve(e.target);
            loadOne(e.target);
          }
        });
      }, { rootMargin: "320px 0px" });
    }
    Array.prototype.forEach.call(els, function (el) { mediaObserver.observe(el); });
  }

  /* Podgląd zdjęcia na pełnym ekranie po kliknięciu */
  var lightboxEl = null;
  function openLightbox(src) {
    if (!lightboxEl) {
      lightboxEl = document.createElement("div");
      lightboxEl.className = "comm-lightbox";
      lightboxEl.hidden = true;
      lightboxEl.addEventListener("click", function () {
        lightboxEl.hidden = true;
        lightboxEl.innerHTML = "";
      });
      document.body.appendChild(lightboxEl);
    }
    lightboxEl.innerHTML = '<img src="' + esc(src) + '" alt="Podgląd zdjęcia">';
    lightboxEl.hidden = false;
  }

  /* ================= LOGOWANIE / REJESTRACJA ================= */
  function setAuthError(msg) {
    var el = document.getElementById("auth-error");
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  function setNameStatus(text, kind) {
    var el = document.getElementById("name-status");
    if (!el) return;
    el.textContent = text;
    el.className = "comm-name-status" + (kind ? " is-" + kind : "");
  }

  function refreshAuthSubmit() {
    var btn = document.getElementById("auth-submit");
    var pinEl = document.getElementById("auth-pin");
    if (!btn || !pinEl) return;
    var pinOk = /^[0-9]{4}$/.test(pinEl.value || "");
    var nameOk = nameStatus.checked && nameStatus.valid;
    btn.disabled = !(pinOk && nameOk);
    if (!nameOk) {
      btn.textContent = "Zaloguj / utwórz konto";
    } else if (nameStatus.taken) {
      btn.textContent = "Zaloguj tą nazwą";
    } else {
      btn.textContent = "Utwórz konto z tą nazwą";
    }
  }

  function scheduleNameCheck() {
    var input = document.getElementById("auth-username");
    if (!input) return;
    clearTimeout(nameCheckTimer);
    var name = input.value.trim();

    if (!name) {
      nameStatus = { valid: false, taken: false, checked: false };
      setNameStatus("3–24 znaki: litery, cyfry oraz _ . -");
      refreshAuthSubmit();
      return;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_.\-]{2,23}$/.test(name)) {
      nameStatus = { valid: false, taken: false, checked: true };
      var reserved = ["admin", "administrator", "root", "moderator", "owner", "system"];
      setNameStatus(
        reserved.indexOf(name.toLowerCase()) >= 0
          ? "✕ ta nazwa jest zarezerwowana"
          : "✕ 3–24 znaki: litery, cyfry oraz _ . -", "bad");
      refreshAuthSubmit();
      return;
    }

    setNameStatus("sprawdzam nazwę…");
    nameCheckTimer = setTimeout(function () {
      rpc("community_username_status", { p_username: name })
        .then(function (data) {
          nameStatus = {
            valid: Boolean(data && data.valid),
            taken: Boolean(data && data.taken),
            checked: true
          };
          if (!nameStatus.valid) {
            setNameStatus("✕ ta nazwa jest niedostępna", "bad");
          } else if (nameStatus.taken) {
            setNameStatus("🔒 nazwa zajęta — wpisz swój PIN, aby się zalogować", "taken");
          } else {
            setNameStatus("✓ nazwa wolna — wymyśl PIN i dołącz do społeczności", "good");
          }
          refreshAuthSubmit();
        })
        .catch(function () {
          nameStatus = { valid: false, taken: false, checked: false };
          setNameStatus("nie udało się sprawdzić nazwy — sprawdź połączenie");
          refreshAuthSubmit();
        });
    }, 350);
  }

  function handleAuthSubmit(ev) {
    ev.preventDefault();
    var nameEl = document.getElementById("auth-username");
    var pinEl = document.getElementById("auth-pin");
    var btn = document.getElementById("auth-submit");
    if (!nameEl || !pinEl || !btn) return;

    var name = nameEl.value.trim();
    var pin = pinEl.value.trim();
    if (!nameStatus.checked || !nameStatus.valid || !/^[0-9]{4}$/.test(pin)) return;

    setAuthError(null);
    btn.disabled = true;
    var fn = nameStatus.taken ? "community_login" : "community_register";

    rpc(fn, { p_username: name, p_pin: pin })
      .then(function (data) {
        if (!data || !data.token) throw new Error("Brak tokena sesji w odpowiedzi.");
        saveSession({ token: data.token, username: data.username });
        renderAuthZone();
        var textarea = document.getElementById("post-content");
        if (textarea) textarea.focus();
      })
      .catch(function (err) {
        setAuthError(err.message || "Nie udało się zalogować.");
        refreshAuthSubmit();
      });
  }

  function handleLogout() {
    saveSession(null);
    expandedPosts = {};
    openReplyForms = {};
    attachedMedia = [];
    renderMediaPreview();
    renderAuthZone();
  }

  /* ================= STREFA AUTH / KOMPONOWANIE ================= */
  function renderAuthZone() {
    var loginCard = document.getElementById("login-card");
    var composer = document.getElementById("composer-card");
    if (!loginCard || !composer) return;

    if (session) {
      loginCard.hidden = true;
      composer.hidden = false;
      var nameEl = document.getElementById("user-name");
      var avatarEl = document.getElementById("user-avatar");
      if (nameEl) {
        nameEl.innerHTML =
          esc(session.username) + ownerBadgeHTML(session.username);
      }
      if (avatarEl) {
        avatarEl.textContent = (session.username.charAt(0) || "?").toUpperCase();
      }
    } else {
      loginCard.hidden = false;
      composer.hidden = true;
    }
  }

  /* ================= WPISY ================= */
  var lastPostsTotal = 0;

  function renderPosts(posts) {
    var feed = document.getElementById("posts-feed");
    if (!feed) return;

    if (!posts.length) {
      feed.innerHTML =
        '<p class="comm-feed-empty">Jeszcze nikt nic nie napisał — bądź pierwszą osobą w społeczności! 🎉</p>';
      return;
    }

    /* Zanim przebudujemy DOM, zapamiętaj rozpisane komentarze i fokus —
       inaczej auto-odświeżenie (co 12 s) kasowało wpisywany tekst. */
    feedDrafts = mergeDrafts(feedDrafts, snapshotCommentDrafts());

    feed.innerHTML = posts.map(function (p) {
      var mine = session && session.username === p.author_name;
      var commentsCount = Number(p.comments_count) || 0;
      var likesCount = Number(p.likes_count) || 0;
      var liked = Boolean(p.has_liked);
      var expanded = expandedPosts[p.id];
      return (
        '<article class="post-card' + (p.is_bot ? " is-bot" : "") + '" data-post-id="' + esc(p.id) + '">' +
          '<div class="post-head">' +
            avatarFor(p.author_name, p.is_bot) +
            '<div class="post-head-meta">' +
              '<span class="post-author">' + esc(p.author_name) + authorBadges(p.author_name, p) + "</span>" +
              '<span class="post-time mono">' + relTime(p.created_at) + "</span>" +
            "</div>" +
            (mine
              ? '<button class="post-delete" type="button" data-delete-post="' + esc(p.id) + '" title="Usuń swój wpis" aria-label="Usuń swój wpis">✕</button>'
              : "") +
          "</div>" +
          '<p class="post-content">' + esc(p.content) + "</p>" +
          postMediaHTML(p.media) +
          '<div class="post-foot">' +
            '<button class="comm-pill-btn comm-like-btn' + (liked ? " is-liked" : "") + '" type="button" data-like-post="' + esc(p.id) + '"' +
              ' title="' + (liked ? "Cofnij polubienie" : "Polub ten wpis") + '" aria-label="' + (liked ? "Cofnij polubienie wpisu" : "Polub ten wpis") + '">' +
              '<svg class="comm-like-heart" viewBox="0 0 24 24" fill="' + (liked ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> ' +
              '<span class="comm-like-num">' + likesCount + "</span>" +
            "</button>" +
            '<button class="comm-pill-btn' + (expanded ? " is-open" : "") + '" type="button" data-toggle-comments="' + esc(p.id) + '">💬 ' +
              commentsCount + " " + commentWord(commentsCount) +
            "</button>" +
          "</div>" +
          '<div class="post-comments" data-comments="' + esc(p.id) + '"' + (expanded ? "" : " hidden") + ">" +
            (expanded
              ? '<div class="comments-list" data-comments-list="' + esc(p.id) + '">Ładowanie komentarzy…</div>' +
                commentFormHTML(p.id)
              : "") +
          "</div>" +
        "</article>"
      );
    }).join("");

    hydrateLazyMedia(feed);

    /* Przywróć szkice w formularzach komentarzy (te już obecne w DOM) */
    restoreCommentDrafts(feedDrafts);

    /* Dociągnij komentarze w rozwiniętych wpisach po odświeżeniu listy */
    Object.keys(expandedPosts).forEach(function (postId) {
      if (expandedPosts[postId]) loadComments(postId);
    });
  }

  function commentFormHTML(postId) {
    if (!session) {
      return (
        '<p class="comments-login-hint">Aby skomentować, zaloguj się nazwą i PIN-em powyżej.</p>'
      );
    }
    return (
      '<form class="comment-form" data-comment-form="' + esc(postId) + '">' +
        '<input class="comm-input comment-input" type="text" maxlength="' + COMMENT_MAX + '" placeholder="Napisz komentarz jako ' + esc(session.username) + '…">' +
        '<button class="btn btn-primary btn-sm" type="submit">Wyślij</button>' +
      "</form>"
    );
  }

  /* ---------- Szkice komentarzy: przeżywają przebudowę DOM przy odświeżeniu feedu ---------- */
  var feedDrafts = []; /* ostatni znany stan pól komentarzy (klucz → wartość/fokus/kareta) */

  function snapshotCommentDrafts() {
    var out = [];
    var inputs = document.querySelectorAll("#posts-feed .comment-input");
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      var form = inp.closest ? inp.closest("form") : null;
      if (!form) continue;
      var mainId = form.getAttribute("data-comment-form");
      var replyId = form.getAttribute("data-reply-form");
      var key = mainId ? "c:" + mainId : replyId ? "r:" + replyId : null;
      if (!key) continue;
      var focused = document.activeElement === inp;
      var value = inp.value || "";
      if (!value && !focused) continue;
      out.push({
        key: key,
        value: value,
        focused: focused,
        caret: focused ? inp.selectionStart : 0
      });
    }
    return out;
  }

  function mergeDrafts(base, extra) {
    var seen = {};
    var merged = [];
    (extra || []).concat(base || []).forEach(function (d) {
      if (!d || seen[d.key]) return;
      seen[d.key] = true;
      merged.push(d);
    });
    return merged;
  }

  function restoreCommentDrafts(drafts) {
    (drafts || []).forEach(function (d) {
      var sel = d.key.charAt(0) === "c"
        ? 'form[data-comment-form="' + d.key.slice(2) + '"] .comment-input'
        : 'form[data-reply-form="' + d.key.slice(2) + '"] .comment-input';
      var inp = document.querySelector(sel);
      if (!inp) return;
      if (d.value && inp.value !== d.value) inp.value = d.value;
      if (d.focused) {
        inp.focus({ preventScroll: true });
        try { inp.setSelectionRange(d.caret, d.caret); } catch (e) { /* starsze przeglądarki */ }
      }
    });
  }

  /* Czy użytkownik pisze teraz w którymś polu feedu? (wtedy odkładamy auto-odświeżenie) */
  function feedHasActiveInput() {
    var ae = document.activeElement;
    if (!ae || (ae.tagName !== "INPUT" && ae.tagName !== "TEXTAREA")) return false;
    var feed = document.getElementById("posts-feed");
    return !!(feed && feed.contains(ae));
  }

  function dropDraft(key) {
    feedDrafts = (feedDrafts || []).filter(function (d) { return d.key !== key; });
  }

  function loadPosts(silent) {
    return rpc("community_list_posts", {
      p_limit: 40,
      p_offset: 0,
      p_token: session && session.token ? session.token : null
    })
      .then(function (data) {
        var posts = (data && Array.isArray(data.posts)) ? data.posts : [];
        lastPostsTotal = (data && Number(data.total)) || posts.length;
        renderPosts(posts);
        return posts;
      })
      .catch(function () {
        if (!silent) {
          var feed = document.getElementById("posts-feed");
          if (feed) {
            feed.innerHTML = '<p class="comm-feed-empty">Nie udało się pobrać wpisów — sprawdź połączenie z internetem.</p>';
          }
        }
        return [];
      });
  }

  /* ================= KOMENTARZE (z odpowiedziami, 2 poziomy) ================= */
  var openReplyForms = {}; /* commentId -> postId, gdy formularz odpowiedzi jest otwarty */

  function commentRowHTML(c, postId, isReply) {
    var mine = session && session.username === c.author_name;
    return (
      '<div class="comment-row' + (isReply ? " is-reply" : "") + '">' +
        avatarFor(c.author_name, c.is_bot) +
        '<div class="comment-body">' +
          '<div class="comment-head">' +
            '<span class="comment-author">' + esc(c.author_name) + authorBadges(c.author_name, c) + "</span>" +
            '<span class="comment-time mono">' + relTime(c.created_at) + "</span>" +
            (mine
              ? '<button class="comment-delete" type="button" data-delete-comment="' + esc(c.id) + '" data-post="' + esc(postId) + '" title="Usuń komentarz" aria-label="Usuń komentarz">✕</button>'
              : "") +
          "</div>" +
          '<p class="comment-content">' + esc(c.content) + "</p>" +
          '<button class="comment-reply-btn" type="button" data-reply-comment="' + esc(c.id) + '" data-post="' + esc(postId) + '">↩ Odpowiedz</button>' +
          (openReplyForms[c.id]
            ? '<form class="comment-reply-form" data-reply-form="' + esc(c.id) + '" data-post="' + esc(postId) + '">' +
                '<input class="comm-input comment-input" type="text" maxlength="' + COMMENT_MAX + '" placeholder="Odpowiedz jako ' + esc(session ? session.username : "") + '…">' +
                '<button class="btn btn-primary btn-sm" type="submit">Wyślij</button>' +
                '<button class="btn btn-ghost btn-sm" type="button" data-reply-cancel="' + esc(c.id) + '" data-post="' + esc(postId) + '">Anuluj</button>' +
              "</form>"
            : "") +
        "</div>" +
      "</div>"
    );
  }

  function loadComments(postId) {
    var list = document.querySelector('[data-comments-list="' + postId + '"]');
    /* lista zawiera formularze odpowiedzi — zachowaj ich szkice przed przebudową */
    feedDrafts = mergeDrafts(feedDrafts, snapshotCommentDrafts());
    return rpc("community_list_comments", { p_post_id: postId })
      .then(function (comments) {
        if (!list) return;
        comments = Array.isArray(comments) ? comments : [];
        if (!comments.length) {
          list.innerHTML = '<p class="comments-empty">Brak komentarzy — napisz pierwszy!</p>';
          return;
        }

        /* Budujemy drzewko: komentarze główne + odpowiedzi (maks. 2 poziomy po stronie serwera) */
        var byId = {};
        comments.forEach(function (c) { byId[String(c.id)] = c; });
        var roots = [];
        var repliesOf = {};
        comments.forEach(function (c) {
          var pid = c.parent_id ? String(c.parent_id) : null;
          if (pid && byId[pid] && !byId[pid].parent_id) {
            (repliesOf[pid] = repliesOf[pid] || []).push(c);
          } else {
            roots.push(c);
          }
        });

        list.innerHTML = roots.map(function (root) {
          var replies = (repliesOf[String(root.id)] || []).map(function (r) {
            return commentRowHTML(r, postId, true);
          }).join("");
          return (
            commentRowHTML(root, postId, false) +
            (replies ? '<div class="comment-replies">' + replies + "</div>" : "")
          );
        }).join("");
        /* przywróć szkice (głównie odpowiedzi) po przebudowie listy */
        restoreCommentDrafts(feedDrafts);
      })
      .catch(function () {
        if (list) list.innerHTML = '<p class="comments-empty">Nie udało się pobrać komentarzy.</p>';
      });
  }

  function toggleComments(postId) {
    var container = document.querySelector('[data-comments="' + postId + '"]');
    var toggleBtn = document.querySelector('[data-toggle-comments="' + postId + '"]');
    if (!container) return;

    if (expandedPosts[postId]) {
      expandedPosts[postId] = false;
      /* zwiń sekcję — ale najpierw zachowaj szkice pól komentarzy */
      feedDrafts = mergeDrafts(feedDrafts, snapshotCommentDrafts());
      container.hidden = true;
      container.innerHTML = "";
      if (toggleBtn) toggleBtn.classList.remove("is-open");
      return;
    }

    expandedPosts[postId] = true;
    container.hidden = false;
    container.innerHTML =
      '<div class="comments-list" data-comments-list="' + esc(postId) + '">Ładowanie komentarzy…</div>' +
      commentFormHTML(postId);
    if (toggleBtn) toggleBtn.classList.add("is-open");
    loadComments(postId);
  }

  /* ================= AKCJE (delegacja zdarzeń) ================= */
  function bindActions() {
    var feed = document.getElementById("posts-feed");
    if (!feed) return;

    feed.addEventListener("click", function (ev) {
      var target = ev.target;
      if (!target || !target.closest) return;

      var likeBtn = target.closest("[data-like-post]");
      if (likeBtn) {
        var likePostId = likeBtn.getAttribute("data-like-post");
        if (!session) {
          /* niezalogowany — podpowiadamy, gdzie się zalogować */
          var loginCard = document.getElementById("login-card");
          if (loginCard) {
            loginCard.hidden = false;
            loginCard.classList.remove("comm-flash");
            void loginCard.offsetWidth;
            loginCard.classList.add("comm-flash");
            loginCard.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          var nameInput = document.getElementById("auth-username");
          if (nameInput) nameInput.focus();
          return;
        }
        likeBtn.disabled = true;
        rpc("community_toggle_post_like", { p_token: session.token, p_post_id: likePostId })
          .then(function () { loadPosts(true); })
          .catch(function (err) {
            alert(err.message || "Nie udało się polubić wpisu.");
            likeBtn.disabled = false;
          });
        return;
      }

      var toggle = target.closest("[data-toggle-comments]");
      if (toggle) {
        toggleComments(toggle.getAttribute("data-toggle-comments"));
        return;
      }

      var delPost = target.closest("[data-delete-post]");
      if (delPost && session) {
        var postId = delPost.getAttribute("data-delete-post");
        delPost.disabled = true;
        rpc("community_delete_post", { p_token: session.token, p_post_id: postId })
          .then(function () {
            delete expandedPosts[postId];
            loadPosts(true);
          })
          .catch(function (err) {
            alert(err.message || "Nie udało się usunąć wpisu.");
            delPost.disabled = false;
          });
        return;
      }

      var delComment = target.closest("[data-delete-comment]");
      if (delComment && session) {
        var commentId = delComment.getAttribute("data-delete-comment");
        var parentPost = delComment.getAttribute("data-post");
        delComment.disabled = true;
        rpc("community_delete_comment", { p_token: session.token, p_comment_id: commentId })
          .then(function () {
            loadComments(parentPost);
            loadPosts(true);
          })
          .catch(function (err) {
            alert(err.message || "Nie udało się usunąć komentarza.");
            delComment.disabled = false;
          });
        return;
      }

      /* Otwarcie / zamknięcie formularza odpowiedzi pod komentarzem */
      var replyBtn = target.closest("[data-reply-comment]");
      if (replyBtn) {
        var replyCommentId = replyBtn.getAttribute("data-reply-comment");
        var replyPostId = replyBtn.getAttribute("data-post");
        if (!session) {
          /* niezalogowany — podświetlamy kartę logowania */
          var loginCard2 = document.getElementById("login-card");
          if (loginCard2) {
            loginCard2.hidden = false;
            loginCard2.classList.remove("comm-flash");
            void loginCard2.offsetWidth;
            loginCard2.classList.add("comm-flash");
            loginCard2.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          var nameInput2 = document.getElementById("auth-username");
          if (nameInput2) nameInput2.focus();
          return;
        }
        if (openReplyForms[replyCommentId]) {
          delete openReplyForms[replyCommentId];
        } else {
          openReplyForms[replyCommentId] = replyPostId;
        }
        loadComments(replyPostId).then(function () {
          var form = document.querySelector('[data-reply-form="' + replyCommentId + '"]');
          var input = form && form.querySelector(".comment-input");
          if (input) input.focus();
        });
        return;
      }

      var replyCancel = target.closest("[data-reply-cancel]");
      if (replyCancel) {
        dropDraft("r:" + replyCancel.getAttribute("data-reply-cancel"));
        delete openReplyForms[replyCancel.getAttribute("data-reply-cancel")];
        loadComments(replyCancel.getAttribute("data-post"));
        return;
      }

      /* Kliknięcie zdjęcia we wpisie otwiera podgląd na cały ekran */
      var zoomImg = target.closest("img.post-media-img");
      if (zoomImg && zoomImg.src) {
        openLightbox(zoomImg.src);
        return;
      }
    });

    feed.addEventListener("submit", function (ev) {
      /* Wysłanie odpowiedzi na komentarz */
      var replyForm = ev.target && ev.target.closest ? ev.target.closest("[data-reply-form]") : null;
      if (replyForm) {
        ev.preventDefault();
        if (!session) return;

        var parentId = replyForm.getAttribute("data-reply-form");
        var rPostId = replyForm.getAttribute("data-post");
        var rInput = replyForm.querySelector(".comment-input");
        var rBtn = replyForm.querySelector("button[type=submit]");
        var rContent = (rInput.value || "").trim();
        if (!rContent) return;

        rBtn.disabled = true;
        rpc("community_add_comment", {
          p_token: session.token,
          p_post_id: rPostId,
          p_content: rContent,
          p_parent_id: parentId
        })
          .then(function () {
            delete openReplyForms[parentId];
            dropDraft("r:" + parentId);
            return loadComments(rPostId).then(loadPosts(true));
          })
          .catch(function (err) {
            alert(err.message || "Nie udało się dodać odpowiedzi.");
            rBtn.disabled = false;
          });
        return;
      }

      var form = ev.target && ev.target.closest ? ev.target.closest("[data-comment-form]") : null;
      if (!form) return;
      ev.preventDefault();
      if (!session) return;

      var postId = form.getAttribute("data-comment-form");
      var input = form.querySelector(".comment-input");
      var btn = form.querySelector("button[type=submit]");
      var content = (input.value || "").trim();
      if (!content) return;

      btn.disabled = true;
      rpc("community_add_comment", { p_token: session.token, p_post_id: postId, p_content: content })
        .then(function () {
          input.value = "";
          dropDraft("c:" + postId);
          return loadComments(postId).then(loadPosts(true));
        })
        .catch(function (err) {
          alert(err.message || "Nie udało się dodać komentarza.");
        })
        .then(function () {
          btn.disabled = false;
        });
    });
  }

  /* ================= KOMPONOWANIE WPISU (tekst + media) ================= */
  var attachedMedia = []; /* {key, id|null, mime, previewUrl, name, status: "busy"|"ok"|"error"} */
  var MEDIA_MAX_ITEMS = 4;
  var MEDIA_MAX_IMG = 6 * 1024 * 1024;
  var MEDIA_MAX_VIDEO = 12 * 1024 * 1024;

  function fmtFileSize(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1).replace(".", ",") + " MB";
    return Math.max(1, Math.round(bytes / 1024)) + " KB";
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || "").split(",")[1] || "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* Zdjęcia (poza GIF-ami) zmniejszamy do max 1600 px — mniejszy transfer i baza */
  function downscaleImage(file, maxDim) {
    return new Promise(function (resolve) {
      if (file.type === "image/gif" || (file.type !== "image/jpeg" && file.type !== "image/png" && file.type !== "image/webp")) {
        resolve(file);
        return;
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, (maxDim || 1600) / Math.max(img.width || 1, img.height || 1));
        if (scale >= 1 && file.size <= 2 * 1024 * 1024) {
          URL.revokeObjectURL(url);
          resolve(file);
          return;
        }
        var cw = Math.max(1, Math.round(img.width * scale));
        var ch = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        canvas.getContext("2d").drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (blob) {
            resolve(new File([blob], (file.name || "zdjecie").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
          } else {
            resolve(file);
          }
        }, "image/jpeg", 0.86);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  }

  function renderMediaPreview() {
    var box = document.getElementById("post-media-preview");
    if (!box) return;
    if (!attachedMedia.length) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    box.innerHTML = attachedMedia.map(function (m) {
      var thumb = m.mime.indexOf("video/") === 0
        ? '<video src="' + m.previewUrl + '" muted playsinline></video>'
        : '<img src="' + m.previewUrl + '" alt="">';
      var status =
        m.status === "busy" ? '<span class="chip-status">⏳ wysyłanie…</span>' :
        m.status === "error" ? '<span class="chip-status is-err">✕ błąd</span>' : "";
      return (
        '<span class="comm-media-chip" data-media-key="' + esc(m.key) + '">' +
          thumb + status +
          '<button class="chip-x" type="button" data-remove-media="' + esc(m.key) + '" aria-label="Usuń załącznik">✕</button>' +
        "</span>"
      );
    }).join("");
  }

  function removeAttachment(key) {
    attachedMedia = attachedMedia.filter(function (m) {
      if (m.key === key && m.previewUrl) {
        try { URL.revokeObjectURL(m.previewUrl); } catch (e) { /* ignorujemy */ }
      }
      return m.key !== key;
    });
    renderMediaPreview();
    refreshSubmitState();
  }

  function refreshSubmitState() {
    var textarea = document.getElementById("post-content");
    var counter = document.getElementById("post-counter");
    var submit = document.getElementById("post-submit");
    if (!textarea || !submit) return;
    var len = (textarea.value || "").length;
    if (counter) counter.textContent = len + " / " + POST_MAX;
    var anyBusy = attachedMedia.some(function (m) { return m.status === "busy"; });
    submit.disabled =
      !session ||
      (textarea.value || "").trim().length < 3 ||
      anyBusy;
  }

  function handleMediaFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    files.forEach(function (file) {
      if (attachedMedia.length >= MEDIA_MAX_ITEMS) {
        alert("Do wpisu możesz dodać maksymalnie " + MEDIA_MAX_ITEMS + " załączniki.");
        return;
      }
      var isVideo = /^video\/(mp4|webm)$/.test(file.type);
      var isImage = /^image\/(jpeg|png|webp|gif)$/.test(file.type);
      if (!isVideo && !isImage) {
        alert("Dozwolone formaty: JPG, PNG, WebP, GIF, MP4, WebM.");
        return;
      }
      if (file.size > (isVideo ? MEDIA_MAX_VIDEO : MEDIA_MAX_IMG)) {
        alert("„" + file.name + "” jest za duży (maks. " + (isVideo ? "12 MB" : "6 MB") + ").");
        return;
      }
      var key = "m" + Date.now() + "_" + Math.random().toString(16).slice(2, 8);
      var entry = {
        key: key,
        id: null,
        mime: file.type,
        previewUrl: URL.createObjectURL(file),
        name: file.name,
        status: "busy"
      };
      attachedMedia.push(entry);
      renderMediaPreview();
      refreshSubmitState();

      (isImage ? downscaleImage(file, 1600) : Promise.resolve(file))
        .then(function (prepared) {
          entry.mime = prepared.type;
          return fileToBase64(prepared).then(function (b64) {
            return rpc("community_upload_media", {
              p_token: session.token,
              p_mime: prepared.type,
              p_data_base64: b64
            });
          });
        })
        .then(function (data) {
          if (data && data.id) {
            entry.id = data.id;
            entry.mime = data.mime || entry.mime;
            entry.status = "ok";
          } else {
            entry.status = "error";
          }
          renderMediaPreview();
          refreshSubmitState();
        })
        .catch(function (err) {
          entry.status = "error";
          renderMediaPreview();
          refreshSubmitState();
          alert(err.message || "Nie udało się przesłać pliku.");
        });
    });
  }

  function bindComposer() {
    var textarea = document.getElementById("post-content");
    var submit = document.getElementById("post-submit");
    var attachBtn = document.getElementById("post-attach");
    var fileInput = document.getElementById("post-media-input");
    var previewBox = document.getElementById("post-media-preview");
    if (!textarea || !submit) return;

    textarea.addEventListener("input", refreshSubmitState);

    if (attachBtn && fileInput) {
      attachBtn.addEventListener("click", function () {
        if (!session) return;
        fileInput.click();
      });
      fileInput.addEventListener("change", function () {
        handleMediaFiles(fileInput.files);
        fileInput.value = "";
      });
    }

    if (previewBox) {
      previewBox.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-remove-media]") : null;
        if (btn) removeAttachment(btn.getAttribute("data-remove-media"));
      });
    }

    submit.addEventListener("click", function () {
      if (!session) return;
      var content = (textarea.value || "").trim();
      var anyBusy = attachedMedia.some(function (m) { return m.status === "busy"; });
      if (content.length < 3 || anyBusy) return;

      var mediaPayload = attachedMedia
        .filter(function (m) { return m.status === "ok" && m.id; })
        .map(function (m) { return { kind: "media", id: m.id }; });

      submit.disabled = true;
      rpc("community_create_post", {
        p_token: session.token,
        p_content: content,
        p_media: mediaPayload
      })
        .then(function () {
          textarea.value = "";
          attachedMedia.forEach(function (m) {
            if (m.previewUrl) {
              try { URL.revokeObjectURL(m.previewUrl); } catch (e) { /* ignorujemy */ }
            }
          });
          attachedMedia = [];
          renderMediaPreview();
          refreshSubmitState();
          return loadPosts(true);
        })
        .catch(function (err) {
          alert(err.message || "Nie udało się opublikować wpisu.");
          submit.disabled = false;
        });
    });

    refreshSubmitState();
  }

  /* ================= KTO JEST TERAZ ONLINE ================= */
  function loadOnline() {
    var box = document.getElementById("comm-online");
    if (!box) return;
    rpc("get_activity_overview", { p_window_seconds: 90 })
      .then(function (data) {
        var users = (data && Array.isArray(data.identified_users)) ? data.identified_users : [];
        if (!users.length) {
          box.innerHTML =
            '<span class="comm-online-empty">Nikogo z zalogowanych nie ma teraz online — zaloguj się, a pokażesz się tutaj ze swoją nazwą.</span>';
          return;
        }
        box.innerHTML = users.map(function (u) {
          var name = String(u.username || "?");
          var projects = Array.isArray(u.projects) ? u.projects.length : 0;
          return (
            '<span class="comm-online-user">' +
              '<span class="comm-online-dot" aria-hidden="true"></span>' +
              '<span class="comm-avatar comm-avatar-sm' + (isAgent ? " comm-avatar-bot" : "") + '" aria-hidden="true">' + esc((name.charAt(0) || "?").toUpperCase()) +
                (isAgent ? '<img src="' + AGENT_AVATAR_SRC + '" alt="" loading="lazy" onerror="this.remove()">' : "") +
              "</span>" +
              esc(name) + ownerBadgeHTML(name) + botBadgeHTML(isAgentName(name)) +
              (projects > 1 ? '<span class="comm-online-count mono" title="Ile stron/projektów ma teraz otwarte">' + projects + " strony</span>" : "") +
            "</span>"
          );
        }).join("");
      })
      .catch(function () { /* cicho — sekcja opcjonalna */ });
  }

  /* ================= MOTYW ================= */
  function setupTheme() {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) { /* ignorujemy */ }
    });
  }

  /* ================= START ================= */
  function init() {
    setupTheme();
    renderAuthZone();
    bindComposer();
    bindActions();
    loadPosts(false);

    var usernameInput = document.getElementById("auth-username");
    if (usernameInput) usernameInput.addEventListener("input", scheduleNameCheck);

    var pinInput = document.getElementById("auth-pin");
    if (pinInput) {
      pinInput.addEventListener("input", function () {
        pinInput.value = (pinInput.value || "").replace(/[^0-9]/g, "").slice(0, 4);
        refreshAuthSubmit();
      });
    }

    var authForm = document.getElementById("auth-form");
    if (authForm) authForm.addEventListener("submit", handleAuthSubmit);

    var logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);

    var refreshBtn = document.getElementById("feed-refresh");
    if (refreshBtn) refreshBtn.addEventListener("click", function () { loadPosts(true); loadOnline(); });

    loadOnline();

    feedTimer = setInterval(function () {
      if (document.visibilityState !== "visible") return;
      /* użytkownik pisze komentarz — odłóż odświeżenie, nie wyrywaj mu pola spod palców */
      if (feedHasActiveInput()) return;
      loadPosts(true);
      loadOnline();
    }, FEED_REFRESH_MS);

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      if (feedHasActiveInput()) return;
      loadPosts(true);
      loadOnline();
    });

    /* Jeśli sesja wygasła po stronie serwera, wyloguj migawkowo w tle */
    if (session) {
      rpc("community_whoami", { p_token: session.token })
        .then(function (data) {
          if (data && data.username) {
            saveSession({ token: session.token, username: data.username });
          }
        })
        .catch(function () { /* chwilowy brak sieci — zostaw sesję */ });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
