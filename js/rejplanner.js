/* © 2026 rejson59 — wszystkie prawa zastrzeżone / all rights reserved.
   Licencja: /LICENSE, /licencja */
/*!
 * RejPlanner — kalendarz i planer (v1).
 *
 * Wszystko dzieje się w tej przeglądarce: wydarzenia i zadania trafiają do
 * localStorage (`rj_planner_v1`), nic nie jest wysyłane na serwer. Dzięki
 * temu planer działa też bez konta i bez internetu.
 *
 * Co potrafi:
 *  - widok miesiąca (tydzień zaczyna się w poniedziałek) + wybór dnia,
 *  - wydarzenia z godziną i zadania z odhaczaniem,
 *  - wyszukiwanie po całym planie (nie tylko w wybranym dniu),
 *  - przypomnienia w przeglądarce (tylko gdy karta jest otwarta),
 *  - eksport do .ics (Google Calendar, Apple Calendar, Outlook),
 *  - eksport/import kopii JSON.
 *
 * Daty trzymamy jako `YYYY-MM-DD` w czasie lokalnym — bez `toISOString()`,
 * bo to przesuwałoby wydarzenia o dzień przy zmianie strefy czasowej.
 */
(function (window, document) {
  'use strict';

  var KEY = 'rj_planner_v1';
  var MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
    'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
  var MONTHS_IN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
    'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
  var WEEKDAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
  var state = { items: [], selected: '', view: null, query: '', notified: {} };

  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
  function parseKey(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }
  function todayKey() { return dayKey(new Date()); }
  function monthStart(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
  function longDate(key) {
    var d = parseKey(key);
    if (!d) return '';
    return d.getDate() + ' ' + MONTHS_IN[d.getMonth()] + ' ' + d.getFullYear();
  }
  function shortWeekday(key) {
    var d = parseKey(key);
    if (!d) return '';
    return WEEKDAYS[(d.getDay() + 6) % 7];
  }

  function load() {
    state.items = [];
    try {
      var raw = window.localStorage.getItem(KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        state.items = parsed.filter(function (item) {
          return item && typeof item.title === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date || '');
        }).map(function (item) {
          return {
            id: String(item.id || Math.random().toString(36).slice(2)),
            title: item.title.slice(0, 140),
            date: item.date,
            time: /^\d{2}:\d{2}$/.test(item.time || '') ? item.time : '',
            kind: item.kind === 'task' ? 'task' : 'event',
            note: typeof item.note === 'string' ? item.note.slice(0, 400) : '',
            done: Boolean(item.done)
          };
        });
      }
    } catch (error) { state.items = []; }
  }

  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(state.items)); return true; }
    catch (error) { return false; }
  }

  function status(message, tone) {
    var el = $('plan-status');
    if (!el) return;
    el.textContent = message || '';
    if (tone) el.setAttribute('data-tone', tone);
    else el.removeAttribute('data-tone');
    window.clearTimeout(status.timer);
    if (message) {
      status.timer = window.setTimeout(function () {
        if (el.textContent === message) el.textContent = '';
      }, 5000);
    }
  }

  function itemsFor(key) {
    return state.items.filter(function (item) { return item.date === key; })
      .sort(function (a, b) { return (a.time || '99:99').localeCompare(b.time || '99:99'); });
  }

  /* ------------------------------------------------------------- kalendarz */

  function renderCalendar() {
    var head = $('plan-month');
    var grid = $('plan-days');
    if (!head || !grid) return;
    head.textContent = MONTHS[state.view.getMonth()] + ' ' + state.view.getFullYear();
    grid.textContent = '';
    var first = monthStart(state.view);
    var offset = (first.getDay() + 6) % 7;
    var start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    var today = todayKey();

    for (var i = 0; i < 42; i += 1) {
      var date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      var key = dayKey(date);
      var day = document.createElement('button');
      day.type = 'button';
      day.className = 'plan-day';
      day.setAttribute('data-day', key);
      day.setAttribute('aria-label', longDate(key) + (itemsFor(key).length ? ', ' + itemsFor(key).length + ' pozycji' : ''));
      if (date.getMonth() !== state.view.getMonth()) day.classList.add('is-out');
      if (key === today) { day.classList.add('is-today'); day.setAttribute('aria-current', 'date'); }
      if (key === state.selected) { day.classList.add('is-selected'); day.setAttribute('aria-pressed', 'true'); }
      var list = itemsFor(key);
      var number = document.createElement('span');
      number.textContent = String(date.getDate());
      day.appendChild(number);
      if (list.length) {
        day.classList.add('has-items');
        if (list.length > 1) {
          var more = document.createElement('span');
          more.className = 'plan-more';
          more.textContent = '+' + (list.length - 1);
          day.appendChild(more);
        }
      }
      grid.appendChild(day);
    }
  }

  function renderCounts() {
    var box = $('plan-counts');
    if (!box) return;
    var today = todayKey();
    var todays = itemsFor(today).length;
    var open = state.items.filter(function (item) { return item.kind === 'task' && !item.done; }).length;
    var weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    var week = state.items.filter(function (item) {
      var d = parseKey(item.date);
      return d && d >= new Date(today) && d < weekEnd;
    }).length;
    box.textContent = '';
    [['Dziś', todays], ['Zadania otwarte', open], ['Najbliższe 7 dni', week]].forEach(function (row) {
      var span = document.createElement('span');
      span.textContent = row[0] + ': ' + row[1];
      box.appendChild(span);
    });
  }

  /* ---------------------------------------------------------------- agenda */

  function itemRow(item) {
    var row = document.createElement('li');
    row.className = 'plan-item is-' + item.kind + (item.done ? ' is-done' : '');
    row.setAttribute('data-id', item.id);

    if (item.kind === 'task') {
      var check = document.createElement('button');
      check.type = 'button';
      check.className = 'plan-check';
      check.setAttribute('data-toggle', item.id);
      check.setAttribute('aria-pressed', item.done ? 'true' : 'false');
      check.setAttribute('aria-label', item.done ? 'Oznacz jako niezrobione' : 'Oznacz jako zrobione');
      check.textContent = item.done ? '✓' : '';
      row.appendChild(check);
    }

    var body = document.createElement('div');
    body.className = 'plan-item-body';
    var title = document.createElement('strong');
    title.textContent = item.title;
    body.appendChild(title);
    var meta = [];
    if (item.time) meta.push(item.time);
    if (state.query) meta.push(longDate(item.date));
    if (item.note) meta.push(item.note);
    if (meta.length) {
      var small = document.createElement('small');
      small.textContent = meta.join(' · ');
      body.appendChild(small);
    }
    row.appendChild(body);

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'plan-del';
    del.setAttribute('data-remove', item.id);
    del.setAttribute('aria-label', 'Usuń: ' + item.title);
    del.textContent = '×';
    row.appendChild(del);
    return row;
  }

  function renderAgenda() {
    var title = $('plan-daytitle');
    var list = $('plan-list');
    if (!title || !list) return;
    var query = state.query.trim().toLowerCase();
    var items;
    if (query) {
      items = state.items.filter(function (item) {
        return (item.title + ' ' + item.note).toLowerCase().indexOf(query) >= 0;
      }).sort(function (a, b) {
        return (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99'));
      });
      title.textContent = 'Wyniki wyszukiwania: „' + state.query.trim() + '”';
    } else {
      items = itemsFor(state.selected);
      title.textContent = longDate(state.selected) + ' · ' + shortWeekday(state.selected);
    }
    list.textContent = '';
    if (!items.length) {
      var empty = document.createElement('li');
      empty.className = 'rjapp-empty';
      empty.textContent = query ? 'Nic nie pasuje do wyszukiwania.' : 'Ten dzień jest wolny. Dodaj wydarzenie albo zadanie.';
      list.appendChild(empty);
    } else {
      items.forEach(function (item) { list.appendChild(itemRow(item)); });
    }
  }

  function render() {
    renderCalendar();
    renderAgenda();
    renderCounts();
  }

  /* ------------------------------------------------------------ dodawanie */

  function selectDay(key, moveView) {
    state.selected = key;
    if (moveView) {
      var d = parseKey(key);
      if (d) state.view = monthStart(d);
    }
    var input = $('plan-date');
    if (input) input.value = key;
    if (state.query) { state.query = ''; var search = $('plan-search'); if (search) search.value = ''; }
    render();
  }

  function addItem(event) {
    if (event) event.preventDefault();
    var titleInput = $('plan-title');
    var dateInput = $('plan-date');
    var timeInput = $('plan-time');
    var kindInput = $('plan-kind');
    var noteInput = $('plan-note');
    var title = String(titleInput && titleInput.value || '').trim();
    var date = String(dateInput && dateInput.value || '');
    var time = String(timeInput && timeInput.value || '');
    if (title.length < 2) { status('Wpisz nazwę (co najmniej 2 znaki).', 'error'); if (titleInput) titleInput.focus(); return; }
    if (!parseKey(date)) { status('Wybierz poprawną datę.', 'error'); if (dateInput) dateInput.focus(); return; }
    if (time && !/^\d{2}:\d{2}$/.test(time)) { status('Godzina musi mieć format HH:MM.', 'error'); return; }
    state.items.push({
      id: Math.random().toString(36).slice(2),
      title: title.slice(0, 140),
      date: date,
      time: time,
      kind: kindInput && kindInput.value === 'task' ? 'task' : 'event',
      note: String(noteInput && noteInput.value || '').trim().slice(0, 400),
      done: false
    });
    var saved = save();
    if (titleInput) titleInput.value = '';
    if (timeInput) timeInput.value = '';
    if (noteInput) noteInput.value = '';
    state.selected = date;
    state.view = monthStart(parseKey(date));
    state.query = '';
    var search = $('plan-search');
    if (search) search.value = '';
    render();
    status(saved ? 'Dodano do planu.' : 'Dodano, ale przeglądarka nie pozwoliła zapisać planu.', saved ? '' : 'error');
  }

  function toggleItem(id) {
    state.items.forEach(function (item) {
      if (item.id === id) item.done = !item.done;
    });
    save();
    render();
  }

  function removeItem(id) {
    var before = state.items.length;
    state.items = state.items.filter(function (item) { return item.id !== id; });
    if (state.items.length === before) return;
    save();
    render();
    status('Usunięto pozycję.');
  }

  /* ----------------------------------------------------------- przypomnienia */

  function canNotify() { return 'Notification' in window; }

  function requestReminders() {
    if (!canNotify()) { status('Ta przeglądarka nie obsługuje powiadomień.', 'error'); return; }
    if (Notification.permission === 'granted') { status('Przypomnienia są już włączone.'); return; }
    if (Notification.permission === 'denied') { status('Powiadomienia są zablokowane w ustawieniach witryny.', 'error'); return; }
    Notification.requestPermission().then(function (permission) {
      status(permission === 'granted'
        ? 'Przypomnienia włączone. Działają, gdy ta karta jest otwarta.'
        : 'Bez zgody przeglądarki przypomnienia się nie pokażą.', permission === 'granted' ? '' : 'error');
    }).catch(function () { status('Nie udało się włączyć przypomnień.', 'error'); });
  }

  function checkReminders() {
    if (!canNotify() || Notification.permission !== 'granted') return;
    var now = new Date();
    state.items.forEach(function (item) {
      if (!item.time || item.done) return;
      var when = parseKey(item.date);
      if (!when) return;
      var parts = item.time.split(':');
      when.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
      var delta = now.getTime() - when.getTime();
      if (delta < 0 || delta > 60000) return;
      var stamp = item.id + '|' + item.date + '|' + item.time;
      if (state.notified[stamp]) return;
      state.notified[stamp] = true;
      try {
        new Notification('RejPlanner: ' + item.title, {
          body: (item.time ? item.time + ' · ' : '') + longDate(item.date),
          tag: 'rj-planner-' + item.id,
          icon: '/hub/brand-mark.svg'
        });
      } catch (error) { /* przeglądarka może odmówić — plan nadal działa */ }
    });
  }

  /* --------------------------------------------------------------- eksport */

  function download(name, type, text) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function icsEscape(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  function exportIcs() {
    if (!state.items.length) { status('Plan jest pusty — nie ma czego eksportować.', 'error'); return; }
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RejHub//RejPlanner//PL', 'CALSCALE:GREGORIAN'];
    var now = new Date();
    var stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' +
      pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
    state.items.forEach(function (item) {
      var date = parseKey(item.date);
      if (!date) return;
      if (item.time) {
        var parts = item.time.split(':');
        var starts = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Number(parts[0]), Number(parts[1]), 0);
        var ends = new Date(starts.getTime() + 60 * 60 * 1000);
        var fmt = function (value) {
          return value.getFullYear() + pad(value.getMonth() + 1) + pad(value.getDate()) + 'T' +
            pad(value.getHours()) + pad(value.getMinutes()) + '00';
        };
        lines.push('BEGIN:VEVENT', 'UID:' + item.id + '@rejhub', 'DTSTAMP:' + stamp,
          'DTSTART:' + fmt(starts), 'DTEND:' + fmt(ends), 'SUMMARY:' + icsEscape(item.title));
      } else {
        var next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
        var nextKey = dayKey(next).replace(/-/g, '');
        lines.push('BEGIN:VEVENT', 'UID:' + item.id + '@rejhub', 'DTSTAMP:' + stamp,
          'DTSTART;VALUE=DATE:' + item.date.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + nextKey,
          'SUMMARY:' + icsEscape(item.title));
      }
      if (item.note) lines.push('DESCRIPTION:' + icsEscape(item.note));
      if (item.kind === 'task') lines.push('CATEGORIES:ZADANIE');
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    download('rejplanner.ics', 'text/calendar;charset=utf-8', lines.join('\r\n'));
    status('Pobrano rejplanner.ics — możesz zaimportować go do swojego kalendarza.');
  }

  function exportJson() {
    download('rejplanner-kopia.json', 'application/json', JSON.stringify({ version: 1, items: state.items }, null, 2));
    status('Pobrano kopię planu (JSON).');
  }

  function importJson(file) {
    if (!file) return;
    if (file.size > 1048576) { status('Kopia jest za duża (limit 1 MiB).', 'error'); return; }
    var reader = new FileReader();
    reader.onerror = function () { status('Nie udało się odczytać pliku.', 'error'); };
    reader.onload = function () {
      try {
        var data = JSON.parse(String(reader.result || ''));
        var rows = Array.isArray(data) ? data : data && data.items;
        if (!Array.isArray(rows)) throw new Error('shape');
        var added = 0;
        rows.forEach(function (item) {
          if (!item || typeof item.title !== 'string' || !parseKey(item.date)) return;
          state.items.push({
            id: Math.random().toString(36).slice(2),
            title: item.title.slice(0, 140),
            date: item.date,
            time: /^\d{2}:\d{2}$/.test(item.time || '') ? item.time : '',
            kind: item.kind === 'task' ? 'task' : 'event',
            note: typeof item.note === 'string' ? item.note.slice(0, 400) : '',
            done: Boolean(item.done)
          });
          added += 1;
        });
        save();
        render();
        status('Zaimportowano ' + added + ' pozycji.');
      } catch (error) {
        status('To nie jest poprawna kopia planu.', 'error');
      }
    };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------------- start */

  function boot() {
    if (!$('plan-days')) return;
    state.selected = todayKey();
    state.view = monthStart(new Date());
    load();

    var dateInput = $('plan-date');
    if (dateInput) dateInput.value = state.selected;

    var form = $('plan-form');
    if (form) form.addEventListener('submit', addItem);

    var grid = $('plan-days');
    if (grid) grid.addEventListener('click', function (event) {
      var day = event.target.closest('[data-day]');
      if (day) selectDay(day.getAttribute('data-day'), false);
    });

    var list = $('plan-list');
    if (list) list.addEventListener('click', function (event) {
      var toggle = event.target.closest('[data-toggle]');
      if (toggle) { toggleItem(toggle.getAttribute('data-toggle')); return; }
      var remove = event.target.closest('[data-remove]');
      if (remove) removeItem(remove.getAttribute('data-remove'));
    });

    var prev = $('plan-prev');
    var next = $('plan-next');
    var today = $('plan-today');
    if (prev) prev.addEventListener('click', function () {
      state.view = new Date(state.view.getFullYear(), state.view.getMonth() - 1, 1); render();
    });
    if (next) next.addEventListener('click', function () {
      state.view = new Date(state.view.getFullYear(), state.view.getMonth() + 1, 1); render();
    });
    if (today) today.addEventListener('click', function () {
      state.view = monthStart(new Date()); selectDay(todayKey(), false);
    });

    var search = $('plan-search');
    if (search) search.addEventListener('input', function () {
      state.query = search.value;
      renderAgenda();
    });

    var remind = $('plan-remind');
    if (remind) remind.addEventListener('click', requestReminders);

    var ics = $('plan-export-ics');
    if (ics) ics.addEventListener('click', exportIcs);
    var json = $('plan-export-json');
    if (json) json.addEventListener('click', exportJson);
    var file = $('plan-import');
    if (file) file.addEventListener('change', function () { importJson(file.files && file.files[0]); file.value = ''; });

    render();
    checkReminders();
    window.setInterval(checkReminders, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.RejPlanner = {
    items: function () { return state.items.slice(); },
    add: function (title, date, time, kind) {
      state.items.push({
        id: Math.random().toString(36).slice(2),
        title: String(title || '').slice(0, 140),
        date: date,
        time: /^\d{2}:\d{2}$/.test(time || '') ? time : '',
        kind: kind === 'task' ? 'task' : 'event',
        note: '',
        done: false
      });
      save();
      render();
      return true;
    }
  };
})(window, document);
