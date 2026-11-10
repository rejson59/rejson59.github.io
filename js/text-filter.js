/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Filtr tekstu w KAŻDYM polu — nie tylko w RejChacie.

   Ta sama lista słów i te same obejścia (podwajanie liter, cyrylica, cyfry
   zamiast liter, znaki zerowej szerokości) co w bazie: pytamy RPC
   `text_filter_check`, więc nie trzymamy w przeglądarce kopii listy.

   Zachowanie:
   - sprawdza pole po chwili od pisania i przy opuszczaniu pola,
   - pokazuje krótką notkę pod polem, nie zasłania treści,
   - blokuje wysłanie formularza, dopóki w polu jest niedozwolona fraza.
   Pola z `data-rj-filter-off` (hasła, PIN-y) są pomijane. */
(function (window, document) {
  'use strict';

  var BASE = 'https://hzbqzfimtroixnldzjeq.supabase.co/rest/v1/rpc/text_filter_check';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6YnF6ZmltdHJvaXhubGR6amVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1OTYzOTEsImV4cCI6MjEwODE3MjM5MX0.oeZWOaNd6p3wZBZQQu3QWjRHlrkxV_BFQRNSN-6YntE';
  var SKIP = /password|hidden|submit|button|checkbox|radio|file|range|color|date|time|number/i;
  var ignored = '[data-rj-filter-off], input[type=password], input[type=email], input[type=tel]';
  var notes = new WeakMap();
  var timers = new WeakMap();

  function request(text) {
    return fetch(BASE, {
      method: 'POST',
      cache: 'no-store',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_text: String(text || '').slice(0, 4000) })
    }).then(function (response) {
      if (!response.ok) return { ok: true, skipped: true };
      return response.json();
    }).catch(function () { return { ok: true, skipped: true }; });
  }

  function noteFor(field) {
    var note = notes.get(field);
    if (note && note.isConnected) return note;
    note = document.createElement('span');
    note.className = 'rj-text-filter-note';
    note.hidden = true;
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    var host = field.parentNode;
    if (host && host.classList.contains('rj-field')) host.appendChild(note);
    else if (field.nextSibling) field.parentNode.insertBefore(note, field.nextSibling);
    else field.parentNode.appendChild(note);
    notes.set(field, note);
    return note;
  }

  function mark(field, result) {
    var note = noteFor(field);
    if (!result || result.ok !== false) {
      field.classList.remove('is-rj-filter-blocked');
      field.removeAttribute('aria-invalid');
      note.hidden = true;
      note.textContent = '';
      field.dataset.rjFilter = 'ok';
      return true;
    }
    field.classList.add('is-rj-filter-blocked');
    field.setAttribute('aria-invalid', 'true');
    note.hidden = false;
    note.textContent = 'Ta treść zawiera niedozwolone słowo lub link. Popraw ją, żeby wysłać.';
    field.dataset.rjFilter = 'blocked';
    return false;
  }

  function valueOf(field) {
    return String(('value' in field ? field.value : field.textContent) || '');
  }

  function check(field) {
    if (!field || field.matches(ignored)) return Promise.resolve(true);
    var value = valueOf(field);
    if (!String(value || '').trim()) return Promise.resolve(mark(field, { ok: true }));
    return request(value).then(function (result) {
      if (field.dataset.rjFilterValue !== String(value)) return true; // odpowiedź nieaktualna
      return mark(field, result);
    });
  }

  function watch(field) {
    if (!field || field.dataset.rjFilterWatched === '1') return;
    if (field.tagName === 'INPUT' && SKIP.test(field.type || 'text')) return;
    if (field.tagName !== 'INPUT' && field.tagName !== 'TEXTAREA' && !field.isContentEditable) return;
    if (field.matches(ignored)) return;
    field.dataset.rjFilterWatched = '1';

    function later() {
      var value = String(('value' in field ? field.value : field.textContent) || '');
      field.dataset.rjFilterValue = value;
      clearTimeout(timers.get(field));
      timers.set(field, setTimeout(function () { check(field); }, 420));
    }

    field.addEventListener('input', later);
    field.addEventListener('blur', function () { check(field); });
    field.addEventListener('paste', later);
  }

  function scan(root) {
    var scope = root && root.querySelectorAll ? root : document;
    if (scope.matches && (scope.matches('input,textarea,[contenteditable]'))) watch(scope);
    scope.querySelectorAll('input, textarea, [contenteditable]').forEach(watch);
  }

  /* Formularz nie wyjdzie z niedozwoloną treścią — także gdy ktoś kliknie
     „wyślij” zaraz po wklejeniu, bez czekania na podpowiedź. */
  function fieldsOf(form) {
    return Array.prototype.filter.call(form.querySelectorAll('input, textarea, [contenteditable]'), function (field) {
      if (field.disabled || field.matches(ignored)) return false;
      if (field.tagName === 'INPUT' && SKIP.test(field.type || 'text')) return false;
      return valueOf(field).trim().length > 0;
    });
  }

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.querySelectorAll || form.dataset.rjFilterRetry === '1') return;
    var stale = fieldsOf(form).filter(function (field) {
      return field.dataset.rjFilter !== 'ok' || field.dataset.rjFilterValue !== valueOf(field);
    });
    if (!stale.length) return;
    event.preventDefault();
    event.stopPropagation();
    Promise.all(stale.map(function (field) {
      field.dataset.rjFilterValue = valueOf(field);
      return check(field);
    })).then(function (results) {
      if (results.every(Boolean)) {
        form.dataset.rjFilterRetry = '1';
        setTimeout(function () { delete form.dataset.rjFilterRetry; }, 600);
        if (form.requestSubmit) form.requestSubmit();
        else form.submit();
        return;
      }
      var first = stale.filter(function (field) { return field.dataset.rjFilter === 'blocked'; })[0];
      if (first) first.focus();
    });
  }, true);

  var observer = new MutationObserver(function (records) {
    records.forEach(function (record) {
      Array.prototype.forEach.call(record.addedNodes, function (node) {
        if (node.nodeType === 1) scan(node);
      });
    });
  });

  function boot() {
    scan(document);
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  window.RejTextFilter = {
    check: function (text) { return request(text); },
    scan: scan,
    allowed: function (text) {
      return request(text).then(function (result) { return !result || result.ok !== false; });
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);
