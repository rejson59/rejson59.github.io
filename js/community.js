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

  function avatarFor(name) {
    var initial = (String(name || "?").trim().charAt(0) || "?").toUpperCase();
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

    feed.innerHTML = posts.map(function (p) {
      var mine = session && session.username === p.author_name;
      var commentsCount = Number(p.comments_count) || 0;
      var likesCount = Number(p.likes_count) || 0;
      var liked = Boolean(p.has_liked);
      var expanded = expandedPosts[p.id];
      return (
        '<article class="post-card" data-post-id="' + esc(p.id) + '">' +
          '<div class="post-head">' +
            avatarFor(p.author_name) +
            '<div class="post-head-meta">' +
              '<span class="post-author">' + esc(p.author_name) + ownerBadgeHTML(p.author_name, p.is_owner) + "</span>" +
              '<span class="post-time mono">' + relTime(p.created_at) + "</span>" +
            "</div>" +
            (mine
              ? '<button class="post-delete" type="button" data-delete-post="' + esc(p.id) + '" title="Usuń swój wpis" aria-label="Usuń swój wpis">✕</button>'
              : "") +
          "</div>" +
          '<p class="post-content">' + esc(p.content) + "</p>" +
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

  /* ================= KOMENTARZE ================= */
  function loadComments(postId) {
    var list = document.querySelector('[data-comments-list="' + postId + '"]');
    return rpc("community_list_comments", { p_post_id: postId })
      .then(function (comments) {
        if (!list) return;
        comments = Array.isArray(comments) ? comments : [];
        if (!comments.length) {
          list.innerHTML = '<p class="comments-empty">Brak komentarzy — napisz pierwszy!</p>';
          return;
        }
        list.innerHTML = comments.map(function (c) {
          var mine = session && session.username === c.author_name;
          return (
            '<div class="comment-row">' +
              avatarFor(c.author_name) +
              '<div class="comment-body">' +
                '<div class="comment-head">' +
                  '<span class="comment-author">' + esc(c.author_name) + ownerBadgeHTML(c.author_name, c.is_owner) + "</span>" +
                  '<span class="comment-time mono">' + relTime(c.created_at) + "</span>" +
                  (mine
                    ? '<button class="comment-delete" type="button" data-delete-comment="' + esc(c.id) + '" data-post="' + esc(postId) + '" title="Usuń komentarz" aria-label="Usuń komentarz">✕</button>'
                    : "") +
                "</div>" +
                '<p class="comment-content">' + esc(c.content) + "</p>" +
              "</div>" +
            "</div>"
          );
        }).join("");
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
      }
    });

    feed.addEventListener("submit", function (ev) {
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

  /* ================= KOMPONOWANIE WPISU ================= */
  function bindComposer() {
    var textarea = document.getElementById("post-content");
    var counter = document.getElementById("post-counter");
    var submit = document.getElementById("post-submit");
    if (!textarea || !submit) return;

    function refresh() {
      var len = (textarea.value || "").length;
      if (counter) counter.textContent = len + " / " + POST_MAX;
      submit.disabled = !session || (textarea.value || "").trim().length < 3;
    }

    textarea.addEventListener("input", refresh);

    submit.addEventListener("click", function () {
      if (!session) return;
      var content = (textarea.value || "").trim();
      if (content.length < 3) return;

      submit.disabled = true;
      rpc("community_create_post", { p_token: session.token, p_content: content })
        .then(function () {
          textarea.value = "";
          refresh();
          return loadPosts(true);
        })
        .catch(function (err) {
          alert(err.message || "Nie udało się opublikować wpisu.");
          submit.disabled = false;
        });
    });

    refresh();
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
              '<span class="comm-avatar comm-avatar-sm" aria-hidden="true">' + esc((name.charAt(0) || "?").toUpperCase()) + "</span>" +
              esc(name) + ownerBadgeHTML(name) +
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
      if (document.visibilityState === "visible") {
        loadPosts(true);
        loadOnline();
      }
    }, FEED_REFRESH_MS);

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        loadPosts(true);
        loadOnline();
      }
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
