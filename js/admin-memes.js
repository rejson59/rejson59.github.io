/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*!
 * Panel admina → zakładka „Memy” (RejMeme).
 *
 * Kolejka moderacji: każdy mem wgrany przez użytkownika czeka tutaj na
 * decyzję. Zatwierdzenie publikuje go w galerii, odrzucenie zostawia plik
 * w bazie z powodem (autor widzi go w „Moje zgłoszenia”) i nigdy nie
 * pojawia się on publicznie.
 *
 * Uprawnienia sprawdza baza (`is_widget_admin()`), więc samo ukrycie
 * przycisku nic nie daje — RPC odmówi każdemu innemu kontu.
 */
(function (window, document) {
  'use strict';

  var state = {
    status: 'pending',
    items: [],
    loading: false,
    reasonFor: '',
    objectUrls: []
  };
  var el = {};

  function $(id) { return document.getElementById(id); }

  function cloud() {
    return window.RejsonCloud && typeof window.RejsonCloud.rpc === 'function' ? window.RejsonCloud : null;
  }

  function setStatus(message, tone) {
    if (!el.status) return;
    el.status.textContent = message || '';
    if (tone) el.status.setAttribute('data-tone', tone);
    else el.status.removeAttribute('data-tone');
  }

  function errText(error) {
    var message = error && error.message ? error.message : String(error || '');
    if (/JWT|permission|administrator|row-level/i.test(message)) {
      return 'Ta sekcja jest dostępna tylko dla administratora.';
    }
    if (/Failed to fetch|network/i.test(message)) return 'Brak połączenia z bazą — spróbuj ponownie.';
    return message || 'Nie udało się wykonać operacji.';
  }

  function formatDate(value) {
    if (!value) return '';
    var date = new Date(value);
    if (isNaN(date.getTime())) return '';
    try {
      return date.toLocaleString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (error) { return date.toISOString().slice(0, 16).replace('T', ' '); }
  }

  function formatBytes(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' kB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function revokeUrls() {
    state.objectUrls.forEach(function (url) {
      try { window.URL.revokeObjectURL(url); } catch (error) { /* ignorujemy */ }
    });
    state.objectUrls = [];
  }

  function dataToUrl(payload) {
    if (!payload || !payload.data) return '';
    var binary = window.atob(payload.data);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    var blob = new window.Blob([bytes], { type: payload.mime || 'image/png' });
    var url = window.URL.createObjectURL(blob);
    state.objectUrls.push(url);
    return url;
  }

  function statusLabel(status) {
    if (status === 'approved') return 'Zatwierdzony';
    if (status === 'rejected') return 'Odrzucony';
    return 'Czeka na decyzję';
  }

  function paintKpis(data) {
    if (!el.kpis) return;
    var cells = [
      { key: 'pending', label: 'Do zatwierdzenia' },
      { key: 'approved', label: 'Zatwierdzone' },
      { key: 'rejected', label: 'Odrzucone' }
    ];
    el.kpis.textContent = '';
    cells.forEach(function (cell) {
      var box = document.createElement('div');
      box.className = 'adm-memes-kpi';
      var value = document.createElement('strong');
      value.textContent = String(data && typeof data[cell.key] === 'number' ? data[cell.key] : 0);
      var label = document.createElement('span');
      label.textContent = cell.label;
      box.append(value, label);
      el.kpis.appendChild(box);
    });
  }

  function loadImage(node, id) {
    var api = cloud();
    if (!api || !node) return;
    api.rpc('rejmeme_admin_image', { p_id: id }, true).then(function (payload) {
      var url = dataToUrl(payload);
      if (!url || !node.isConnected) return;
      node.textContent = '';
      var img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      node.appendChild(img);
    }).catch(function () {
      node.textContent = '×';
      node.title = 'Nie udało się wczytać pliku mema.';
    });
  }

  function card(item) {
    var li = document.createElement('li');
    li.className = 'adm-memes-card';
    li.setAttribute('data-meme-id', item.id);

    var thumb = document.createElement('div');
    thumb.className = 'adm-memes-thumb';
    thumb.textContent = '◌';

    var copy = document.createElement('div');
    copy.className = 'adm-memes-copy';

    var title = document.createElement('strong');
    title.className = 'adm-memes-title';
    title.textContent = item.title || 'Mem';

    var meta = document.createElement('span');
    meta.className = 'adm-memes-meta';
    var bits = [];
    if (item.author) bits.push('@' + item.author);
    if (item.created_at) bits.push(formatDate(item.created_at));
    if (item.bytes) bits.push(formatBytes(item.bytes));
    if (item.views) bits.push(item.views + ' wyświetleń');
    meta.textContent = bits.join(' · ');

    var badge = document.createElement('span');
    badge.className = 'adm-memes-badge adm-memes-badge--' + (item.status || 'pending');
    badge.textContent = statusLabel(item.status);

    copy.append(title, meta, badge);

    if (Array.isArray(item.tags) && item.tags.length) {
      var tags = document.createElement('div');
      tags.className = 'adm-memes-tags';
      item.tags.forEach(function (tag) {
        var chip = document.createElement('span');
        chip.textContent = '#' + tag;
        tags.appendChild(chip);
      });
      copy.appendChild(tags);
    }

    if (item.status === 'rejected' && item.reason) {
      var reason = document.createElement('p');
      reason.className = 'adm-memes-reason';
      reason.textContent = 'Powód: ' + item.reason;
      copy.appendChild(reason);
    }

    var actions = document.createElement('div');
    actions.className = 'adm-memes-actions';

    if (item.status !== 'approved') {
      var approve = document.createElement('button');
      approve.type = 'button';
      approve.className = 'btn btn-primary btn-sm';
      approve.setAttribute('data-memes-approve', item.id);
      approve.textContent = 'Zatwierdź i opublikuj';
      actions.appendChild(approve);
    }

    if (item.status !== 'rejected') {
      var reject = document.createElement('button');
      reject.type = 'button';
      reject.className = 'btn btn-glass btn-sm';
      reject.setAttribute('data-memes-reject', item.id);
      reject.setAttribute('aria-expanded', state.reasonFor === item.id ? 'true' : 'false');
      reject.textContent = 'Odrzuć (etyka)';
      actions.appendChild(reject);
    }

    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'adm-memes-delete';
    remove.setAttribute('data-memes-delete', item.id);
    remove.setAttribute('aria-label', 'Usuń mem bezpowrotnie');
    remove.title = 'Usuń mem bezpowrotnie';
    remove.textContent = 'Usuń';
    actions.appendChild(remove);

    copy.appendChild(actions);

    if (state.reasonFor === item.id) {
      var form = document.createElement('div');
      form.className = 'adm-memes-reason-form';
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'ctrl-input ctrl-input--sm';
      input.maxLength = 300;
      input.placeholder = 'Powód odrzucenia widoczny dla autora (opcjonalnie)';
      input.id = 'memes-reason-' + item.id;
      var confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.className = 'btn btn-primary btn-sm';
      confirm.setAttribute('data-memes-confirm', item.id);
      confirm.textContent = 'Potwierdź odrzucenie';
      form.append(input, confirm);
      copy.appendChild(form);
    }

    li.append(thumb, copy);
    loadImage(thumb, item.id);
    return li;
  }

  function render() {
    if (!el.list) return;
    revokeUrls();
    el.list.textContent = '';
    if (!state.items.length) {
      var empty = document.createElement('li');
      empty.className = 'adm-empty';
      empty.textContent = state.status === 'pending'
        ? 'Kolejka jest pusta — żaden mem nie czeka na decyzję.'
        : 'Brak memów w tym widoku.';
      el.list.appendChild(empty);
      return;
    }
    state.items.forEach(function (item) { el.list.appendChild(card(item)); });
  }

  function load() {
    var api = cloud();
    if (!el.list) return Promise.resolve();
    if (!api) {
      setStatus('Panel nie ma połączenia z chmurą — odśwież stronę.', 'error');
      return Promise.resolve();
    }
    if (state.loading) return Promise.resolve();
    state.loading = true;
    setStatus('Wczytuję kolejkę memów…');
    return api.rpc('rejmeme_admin_queue', { p_status: state.status, p_limit: 60 }, true).then(function (data) {
      state.items = data && Array.isArray(data.items) ? data.items : [];
      paintKpis(data);
      render();
      var counts = data || {};
      if (el.tabNote) el.tabNote.textContent = counts.pending ? String(counts.pending) : '0';
      setStatus(state.items.length
        ? 'Pokazano ' + state.items.length + ' ' + (state.items.length === 1 ? 'mem' : 'memów') + '.'
        : '');
    }).catch(function (error) {
      setStatus(errText(error), 'error');
      if (el.list) {
        el.list.textContent = '';
        var empty = document.createElement('li');
        empty.className = 'adm-empty';
        empty.textContent = errText(error);
        el.list.appendChild(empty);
      }
    }).then(function () { state.loading = false; });
  }

  function moderate(id, action, reason) {
    var api = cloud();
    if (!api) return Promise.resolve();
    setStatus(action === 'approve' ? 'Publikuję mem…' : action === 'reject' ? 'Odrzucam mem…' : 'Usuwam mem…');
    return api.rpc('rejmeme_moderate', {
      p_id: id,
      p_action: action,
      p_reason: reason || null
    }, true).then(function () {
      state.reasonFor = '';
      setStatus(action === 'approve'
        ? 'Mem zatwierdzony i widoczny w galerii.'
        : action === 'reject'
          ? 'Mem odrzucony — autor zobaczy powód, mem nie jest publikowany.'
          : 'Mem usunięty bezpowrotnie.', 'ok');
      return load();
    }).catch(function (error) {
      setStatus(errText(error), 'error');
    });
  }

  function setFilter(status) {
    state.status = status;
    state.reasonFor = '';
    Array.prototype.forEach.call(document.querySelectorAll('[data-memes-status]'), function (button) {
      var on = button.getAttribute('data-memes-status') === status;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    return load();
  }

  function boot() {
    el = {
      list: $('memes-list'),
      kpis: $('memes-kpis'),
      status: $('memes-status'),
      filters: $('memes-filters'),
      refresh: $('memes-refresh'),
      tabNote: $('memes-tab-note')
    };
    if (!el.list) return;

    if (el.filters) {
      el.filters.addEventListener('click', function (event) {
        var button = event.target.closest('[data-memes-status]');
        if (button) setFilter(button.getAttribute('data-memes-status'));
      });
    }
    if (el.refresh) el.refresh.addEventListener('click', function () { load(); });

    el.list.addEventListener('click', function (event) {
      var approve = event.target.closest('[data-memes-approve]');
      if (approve) { moderate(approve.getAttribute('data-memes-approve'), 'approve'); return; }

      var reject = event.target.closest('[data-memes-reject]');
      if (reject) {
        var id = reject.getAttribute('data-memes-reject');
        state.reasonFor = state.reasonFor === id ? '' : id;
        render();
        if (state.reasonFor) {
          var input = $('memes-reason-' + id);
          if (input) input.focus();
        }
        return;
      }

      var confirm = event.target.closest('[data-memes-confirm]');
      if (confirm) {
        var targetId = confirm.getAttribute('data-memes-confirm');
        var field = $('memes-reason-' + targetId);
        moderate(targetId, 'reject', field ? field.value.trim() : '');
        return;
      }

      var remove = event.target.closest('[data-memes-delete]');
      if (remove) {
        var removeId = remove.getAttribute('data-memes-delete');
        if (window.confirm('Usunąć ten mem bezpowrotnie? Tej operacji nie można cofnąć.')) {
          moderate(removeId, 'delete');
        }
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.RJAdminMemes = { load: load, setFilter: setFilter };
})(window, document);
