/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Panel admina — „Serwer”: pojemność bazy, największe tabele, miejsce na
   kontach i porządkowanie tożsamości (scalanie / zapominanie nazw). */
(function (window, document) {
  'use strict';

  var loaded = false;
  var busy = false;

  function $(id) { return document.getElementById(id); }
  function rpc(name, args) {
    if (!window.RejsonCloud || !window.RejsonCloud.rpc) return Promise.reject(new Error('Brak połączenia.'));
    return window.RejsonCloud.rpc(name, args || {}, true);
  }
  function text(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function mb(bytes) {
    var n = Number(bytes) || 0;
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return (n / 1024).toFixed(0) + ' kB';
    return n + ' B';
  }
  function when(value) {
    var date = new Date(value);
    if (!value || isNaN(date.getTime())) return '—';
    return date.toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function kpi(label, value, note) {
    return '<div class="srv-kpi"><span class="srv-kpi-label">' + text(label) + '</span>' +
      '<strong class="srv-kpi-value">' + text(value) + '</strong>' +
      (note ? '<span class="srv-kpi-note">' + text(note) + '</span>' : '') + '</div>';
  }

  function paintKpis(stats) {
    var box = $('srv-kpis');
    if (!box) return;
    var db = stats.database || {};
    var counts = stats.counts || {};
    var storage = stats.storage || {};
    var health = stats.health || {};
    box.innerHTML = [
      kpi('Baza danych', db.pretty || mb(db.bytes), 'PostgreSQL ' + (db.version || '')),
      kpi('Konta', counts.accounts || 0, (counts.sessions || 0) + ' aktywnych sesji / 24 h'),
      kpi('Dane na kontach', mb(storage.used_total), (counts.photos || 0) + ' zdjęć · ' + (counts.sejf || 0) + ' wpisów sejfu'),
      kpi('RejFile', counts.transfers || 0, 'przesyłek w bazie'),
      kpi('Push', counts.push_devices || 0, 'urządzeń · ' + (counts.push_pending || 0) + ' w kolejce'),
      kpi('Ruch 7 dni', counts.visits_7d || 0, (counts.events_7d || 0) + ' zdarzeń')
    ].join('');
  }

  function paintTables(tables) {
    var box = $('srv-tables');
    if (!box) return;
    if (!tables || !tables.length) { box.innerHTML = '<div class="pa-empty">Brak danych.</div>'; return; }
    var max = tables[0].bytes || 1;
    box.innerHTML = tables.slice(0, 12).map(function (table) {
      var width = Math.max(2, Math.round(100 * (table.bytes / max)));
      return '<div class="srv-row"><span class="srv-row-name">' + text(table.name) + '</span>' +
        '<span class="srv-bar" aria-hidden="true"><span style="width:' + width + '%"></span></span>' +
        '<span class="srv-row-value mono">' + text(table.pretty) + '</span>' +
        '<span class="srv-row-note">~' + Number(table.rows || 0).toLocaleString('pl-PL') + ' wierszy</span></div>';
    }).join('');
  }

  function paintAccounts(list) {
    var box = $('srv-accounts');
    if (!box) return;
    if (!list || !list.length) { box.innerHTML = '<div class="pa-empty">Żadne konto nie zajmuje jeszcze miejsca.</div>'; return; }
    box.innerHTML = list.map(function (row) {
      var percent = Math.min(100, Number(row.percent) || 0);
      return '<div class="srv-row"><span class="srv-row-name">@' + text(row.username) + '</span>' +
        '<span class="srv-bar"><span style="width:' + percent + '%" class="' + (percent > 85 ? 'is-full' : '') + '"></span></span>' +
        '<span class="srv-row-value mono">' + mb(row.used) + ' / ' + mb(row.quota) + '</span>' +
        '<span class="srv-row-note">' + percent + '%</span></div>';
    }).join('');
  }

  function paintIdentities(data) {
    var box = $('srv-identities');
    if (!box) return;
    var names = (data && data.names) || [];
    var aliases = (data && data.aliases) || [];
    var rows = names.filter(function (row) { return !row.has_account || row.is_alias; });
    var head = aliases.length
      ? '<p class="srv-status">Scalone nazwy: ' + aliases.map(function (a) { return text(a.alias) + ' → ' + text(a.canonical); }).join(', ') + '</p>'
      : '';
    if (!rows.length) {
      box.innerHTML = head + '<div class="pa-empty">Wszystkie identyfikatory pasują do istniejących kont.</div>';
      return;
    }
    box.innerHTML = head + '<div class="srv-ident-list">' + rows.map(function (row) {
      return '<div class="srv-ident">' +
        '<div><strong>@' + text(row.name) + '</strong>' +
        '<span class="srv-ident-note">' + (row.has_account ? 'konto istnieje' : 'konto usunięte') +
        ' · ' + (row.links || 0) + ' powiązań · ' + (row.visits || 0) + ' wejść</span></div>' +
        '<div class="srv-ident-actions">' +
        (row.has_account ? '' : '<button type="button" class="btn btn-glass btn-sm" data-forget="' + text(row.name) + '">Zapomnij</button>') +
        '<button type="button" class="btn btn-glass btn-sm" data-into="' + text(row.name) + '">Scal do…</button>' +
        '</div></div>';
    }).join('') + '</div>';
  }

  /* Multikonta — tylko podpowiedzi dla właściciela. Automat nic nie blokuje,
     nie zmienia nazw i nie kasuje kont. */
  function riskChips(names) {
    return (names || []).map(function (name) {
      return '<button type="button" class="srv-chip" data-risk-name="' + text(name) + '" ' +
        'title="Scal „' + text(name) + '” z inną nazwą">@' + text(name) + '</button>';
    }).join('');
  }

  function riskItem(head, meta, names) {
    return '<div class="srv-risk-item">' +
      '<div class="srv-risk-line"><strong>' + head + '</strong>' +
      (meta ? '<span class="srv-risk-meta">' + text(meta) + '</span>' : '') + '</div>' +
      (names && names.length ? '<div class="srv-risk-chips">' + riskChips(names) + '</div>' : '') +
      '</div>';
  }

  function riskGroup(title, note, items) {
    if (!items.length) return '';
    return '<div class="srv-risk-group"><h3 class="srv-risk-head">' + text(title) +
      (note ? '<span>' + text(note) + '</span>' : '') + '</h3>' + items.join('') + '</div>';
  }

  function paintRisk(risk) {
    var box = $('srv-risk');
    if (!box) return;
    if (!risk) {
      box.innerHTML = '<div class="pa-empty">Nie udało się wczytać listy ryzyka.</div>';
      return;
    }
    var networks = (risk.networks || []).map(function (row) {
      return riskItem(
        row.count + ' konta z jednej sieci',
        when(row.first_at) + ' → ' + when(row.last_at) + ' · sieć #' + (row.net || ''),
        row.accounts
      );
    });
    var devices = (risk.devices || []).map(function (row) {
      return riskItem(
        row.count + ' konta z jednej przeglądarki',
        'ostatnio ' + when(row.last_at) + ' · urządzenie #' + (row.fp || ''),
        row.accounts
      );
    });
    var similar = (risk.similar || []).map(function (row) {
      return riskItem(
        '@' + text(row.name) + ' ≈ @' + text(row.similar_to),
        'podobieństwo ' + (row.score || 0),
        [row.name, row.similar_to]
      );
    });
    var bursts = (risk.bursts || []).map(function (row) {
      return riskItem(
        row.count + ' kont w jednej godzinie',
        when(row.hour),
        row.accounts
      );
    });
    var echoes = (risk.echoes || []).map(function (row) {
      return riskItem(
        '„' + text(row.excerpt || '') + '”',
        row.count + ' konta · ' + when(row.last_at),
        row.accounts
      );
    });
    var html = riskGroup('Wspólna sieć', 'rejestracje po 13.11.2026', networks) +
      riskGroup('Wspólne urządzenie', '', devices) +
      riskGroup('Łudząco podobne nazwy', '', similar) +
      riskGroup('Fale rejestracji', '4 lub więcej kont w godzinę', bursts) +
      riskGroup('Ta sama wiadomość z różnych kont', 'ostatnie 24 h', echoes);
    box.innerHTML = html || '<div class="pa-empty">Brak podejrzanych układów — czysto.</div>';
    var status = $('srv-risk-status');
    if (status) {
      status.textContent = 'Nowych kont w 24 h: ' + (risk.new_24h || 0) +
        ' · lista wygenerowana ' + when(risk.generated_at) + '.';
    }
  }

  function refresh() {
    if (busy) return;
    busy = true;
    var status = $('srv-merge-status');
    return Promise.all([
      rpc('admin_server_stats', {}),
      rpc('admin_identity_issues', {}),
      rpc('admin_account_risk', {}).catch(function () { return null; })
    ]).then(function (result) {
      var stats = result[0] || {};
      paintKpis(stats);
      paintTables(stats.tables || []);
      paintAccounts((stats.storage && stats.storage.accounts) || []);
      paintIdentities(result[1] || {});
      paintRisk(result[2]);
      if (status) status.textContent = '';
      loaded = true;
    }).catch(function (error) {
      if (status) status.textContent = (error && error.message) || 'Nie udało się wczytać statystyk.';
    }).then(function () { busy = false; });
  }

  function merge(from, into) {
    if (!from || !into) {
      var status = $('srv-merge-status');
      if (status) status.textContent = 'Podaj obie nazwy: starą i docelową.';
      return;
    }
    busy = true;
    rpc('admin_identity_merge', { p_from: from, p_into: into }).then(function (result) {
      var status = $('srv-merge-status');
      if (status) status.textContent = 'Scalono „' + result.from + '” z „' + result.into + '” — ' +
        result.links + ' powiązań, ' + result.days + ' dni aktywności, ' + result.events + ' zdarzeń.';
      $('srv-merge-from').value = '';
      $('srv-merge-into').value = '';
      busy = false;
      refresh();
    }).catch(function (error) {
      busy = false;
      var status = $('srv-merge-status');
      if (status) status.textContent = (error && error.message) || 'Nie udało się scalić.';
    });
  }

  function forget(name) {
    if (!name) return;
    if (!window.confirm('Usunąć identyfikator „' + name + '” i odłączyć go od historii?')) return;
    busy = true;
    rpc('admin_identity_forget', { p_name: name }).then(function (result) {
      var status = $('srv-merge-status');
      if (status) status.textContent = 'Usunięto „' + result.name + '”: ' + result.links + ' powiązań, ' + result.days + ' dni aktywności.';
      busy = false;
      refresh();
    }).catch(function (error) {
      busy = false;
      var status = $('srv-merge-status');
      if (status) status.textContent = (error && error.message) || 'Nie udało się usunąć nazwy.';
    });
  }

  function bind() {
    var refreshBtn = $('srv-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', refresh);
    var mergeBtn = $('srv-merge-btn');
    if (mergeBtn) mergeBtn.addEventListener('click', function () {
      merge($('srv-merge-from').value.trim(), $('srv-merge-into').value.trim());
    });
    var forgetBtn = $('srv-forget-btn');
    if (forgetBtn) forgetBtn.addEventListener('click', function () {
      forget($('srv-merge-from').value.trim());
    });
    var riskBox = $('srv-risk');
    if (riskBox) riskBox.addEventListener('click', function (event) {
      var chip = event.target.closest('[data-risk-name]');
      if (!chip) return;
      var name = chip.getAttribute('data-risk-name');
      var from = $('srv-merge-from');
      var into = $('srv-merge-into');
      if (from) from.value = name;
      if (into) { into.value = ''; into.focus(); }
      var status = $('srv-merge-status');
      if (status) status.textContent = 'Wybrano „' + name + '” — wpisz nazwę docelową i wybierz „Scal historię”.';
    });
    var list = $('srv-identities');
    if (list) list.addEventListener('click', function (event) {
      var forgetTarget = event.target.closest('[data-forget]');
      if (forgetTarget) { forget(forgetTarget.getAttribute('data-forget')); return; }
      var intoTarget = event.target.closest('[data-into]');
      if (intoTarget) {
        $('srv-merge-from').value = intoTarget.getAttribute('data-into');
        $('srv-merge-into').focus();
      }
    });
  }

  window.RJAdminServer = {
    load: function () {
      if (!loaded) refresh();
      else refresh();
    },
    refresh: refresh
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})(window, document);
