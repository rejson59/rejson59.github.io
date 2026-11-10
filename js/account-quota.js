/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   „Miejsce na koncie” — jedna wspólna kwota profilu (RejFile + RejChat + RejSejf). */
(function (window, document) {
  'use strict';

  var BASE = 'https://hzbqzfimtroixnldzjeq.supabase.co/rest/v1/rpc/profile_usage_breakdown';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE';

  function session() {
    try {
      var value = JSON.parse(localStorage.getItem('rejson_community_session_v1') || 'null');
      return value && typeof value.token === 'string' && value.token.length >= 16 ? value : null;
    } catch (error) { return null; }
  }

  function mb(bytes) {
    var n = Number(bytes) || 0;
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return (n / 1024).toFixed(0) + ' kB';
    return n + ' B';
  }

  function paint(data) {
    var bar = document.getElementById('quota-bar');
    var text = document.getElementById('quota-text');
    var parts = document.getElementById('quota-parts');
    if (!bar || !text) return;
    var used = Number(data.used) || 0;
    var quota = Number(data.quota) || 1;
    var percent = Math.max(0, Math.min(100, Math.round((used / quota) * 100)));
    bar.querySelector('span').style.width = percent + '%';
    bar.setAttribute('aria-valuenow', String(percent));
    bar.classList.toggle('is-high', percent >= 85);
    bar.classList.toggle('is-mid', percent >= 60 && percent < 85);
    text.textContent = mb(used) + ' z ' + mb(quota) + ' zajęte (' + percent + '%)';
    if (parts) {
      var p = data.parts || {};
      parts.textContent = 'RejChat ' + mb(p.chat) + ' · RejSejf ' + mb(p.sejf) + ' · RejFile ' + mb(p.file);
    }
  }

  function load() {
    var account = session();
    var box = document.querySelector('.account-quota');
    if (!box) return;
    if (!account) { box.hidden = true; return; }
    box.hidden = false;
    fetch(BASE, {
      method: 'POST',
      cache: 'no-store',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: account.token })
    }).then(function (response) {
      if (!response.ok) throw new Error('offline');
      return response.json();
    }).then(paint).catch(function () {
      var text = document.getElementById('quota-text');
      if (text) text.textContent = 'Nie udało się odczytać zajętego miejsca.';
    });
  }

  window.RejAccountQuota = { reload: load };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
  window.addEventListener('storage', function (event) {
    if (event.key === 'rejson_community_session_v1') load();
  });
})(window, document);
