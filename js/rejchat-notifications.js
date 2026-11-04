/* Jeden dzwonek: prawdziwe zdarzenia RejChat oraz witryny. */
(function (window, document) {
  'use strict';
  var parent = document.querySelector('.rj-shared-header .header-right');
  if (!parent || !window.RJProfiles) return;
  var wrap = parent.querySelector('.rj-chat-alerts');
  if (!wrap) return;
  wrap.innerHTML = '<button type="button" class="rj-chat-bell" aria-label="Powiadomienia" aria-expanded="false" aria-controls="rj-chat-alert-panel" title="Powiadomienia">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-2 7-2 9h16c0-2-2-2-2-9M10 20h4"/></svg><span class="rj-chat-bell-count" hidden></span></button>' +
    '<section id="rj-chat-alert-panel" class="rj-chat-alert-panel" aria-label="Powiadomienia" hidden><div class="rj-chat-alert-head"><div><strong>Powiadomienia</strong><small>Witryna · projekty · RejChat</small><small>Projekty i zgłoszenia: na tym urządzeniu</small></div><button type="button" class="rj-chat-alert-close" aria-label="Zamknij powiadomienia">×</button></div><div class="rj-chat-alert-status" role="status"></div><div class="rj-chat-alert-list"></div><div class="rj-chat-alert-actions"><button type="button" class="rj-chat-alert-refresh">Odśwież</button><button type="button" class="rj-chat-alert-read">Oznacz wszystkie jako przeczytane</button></div></section>';
  // Konto może pojawić się później, zniknąć lub zmienić położenie przy resize.
  function placeBell() {
    var profile = parent.querySelector('.rj-header-profile');
    var account = parent.querySelector('.mobile-account');
    var nav = parent.querySelector('.site-nav');
    var target = profile || (window.matchMedia('(max-width: 1200px)').matches ? account : nav);
    if (target && target.parentNode === parent && wrap.nextElementSibling !== target) parent.insertBefore(wrap, target);
  }
  placeBell();
  new MutationObserver(placeBell).observe(parent, {childList:true});
  window.addEventListener('resize', placeBell);
  var bell = wrap.querySelector('.rj-chat-bell'), count = wrap.querySelector('.rj-chat-bell-count');
  var panel = wrap.querySelector('.rj-chat-alert-panel'), list = wrap.querySelector('.rj-chat-alert-list');
  var status = wrap.querySelector('.rj-chat-alert-status'), mark = wrap.querySelector('.rj-chat-alert-read');
  var items = [], unread = 0, serial = 0, busy = false, chatError = '';
  function current() { return window.RJProfiles.session(); }
  function same(s) { var now = current(); return s && now && s.token === now.token; }
  function text(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function general() { return window.RJPremium && typeof window.RJPremium.notifications === 'function' ? window.RJPremium.notifications() : []; }
  function safeHref(href) {
    try { var url = new URL(href, location.origin + '/'); return /^(https?:)$/.test(url.protocol) ? url.href : '/'; }
    catch (e) { return '/'; }
  }
  function paint() {
    var s = current();
    var errors = [chatError, s && window.RJPremium && typeof window.RJPremium.sourceError === 'function' ? window.RJPremium.sourceError() : ''].filter(Boolean);
    status.textContent = errors.join(' ');
    var generalItems = s ? general() : [], total = unread + generalItems.length;
    count.hidden = !s || !total;
    count.textContent = total > 99 ? '99+' : String(total);
    bell.setAttribute('aria-label', 'Powiadomienia' + (total ? ', nieprzeczytane: ' + total : ''));
    mark.hidden = !s || !total;
    if (!s) { list.innerHTML = '<p class="rj-chat-alert-empty">Zaloguj się, aby otrzymywać powiadomienia o projektach, zgłoszeniach i RejChat. <a href="/logowanie">Konto</a></p>'; return; }
    if (!items.length && !generalItems.length) { list.innerHTML = '<p class="rj-chat-alert-empty">Tu pojawią się nowe powiadomienia o projektach, zgłoszeniach i RejChat.</p>'; return; }
    var rows = items.map(function(n) {
      var action = n.kind === 'like' ? 'polubił(a) Twój wpis' : n.kind === 'reply' ? 'odpowiedział(a) na Twój komentarz' : 'skomentował(a) Twój wpis';
      var when = new Date(n.created_at), date = isNaN(when.getTime()) ? '' : when.toLocaleString('pl-PL', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      var target = /^\/rejchat(?:\.html)?\/?$/i.test(location.pathname) ? '#powiadomienie=' : '/rejchat#powiadomienie=';
      return {when:n.created_at, html:'<a class="rj-chat-alert-item' + (n.read_at ? '' : ' is-unread') + '" href="' + target + text(n.id) + '" data-notification="' + text(n.id) + '"><span class="rj-chat-alert-symbol" aria-hidden="true">' + (n.kind === 'like' ? '♡' : '💬') + '</span><span><strong>' + text(n.actor_name) + '</strong> ' + action + '<small>RejChat · ' + text(date) + ' · Otwórz wpis</small></span></a>'};
    });
    generalItems.forEach(function(n) {
      var when = new Date(n.when), date = isNaN(when.getTime()) ? '' : when.toLocaleString('pl-PL', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      rows.push({when:n.when, html:'<a class="rj-chat-alert-item is-unread" href="' + text(safeHref(n.href)) + '" data-general-notification="' + text(n.id) + '"><span class="rj-chat-alert-symbol" aria-hidden="true">' + text(n.icon || '🔔') + '</span><span><strong>' + text(n.title) + '</strong><small>' + text(n.text) + (date ? ' · ' + text(date) : '') + '</small></span></a>'});
    });
    rows.sort(function(a,b){return String(b.when || '').localeCompare(String(a.when || ''));});
    list.innerHTML = rows.map(function(n){return n.html;}).join('');
  }
  function refreshAll() {
    if (window.RJPremium) window.RJPremium.refresh();
    return refresh();
  }

  function refresh() {
    var s = current(), seq = ++serial;
    if (!s) { items = []; unread = 0; chatError = ''; paint(); return Promise.resolve(); }
    return window.RJProfiles.rpc('rejchat_notifications_list', {p_token:s.token,p_limit:50}).then(function(data) {
      if (seq !== serial || !same(s)) return;
      if (!data || !Array.isArray(data.items) || typeof data.unread !== 'number') throw new Error('Nieprawidłowa odpowiedź');
      items = data.items; unread = Math.max(0, data.unread); chatError = ''; paint();
    }).catch(function() {
      if (seq !== serial || !same(s)) return;
      chatError = 'Nie udało się odświeżyć powiadomień RejChat. Spróbuj ponownie.'; paint();
    });
  }
  function markRead(ids) {
    var s = current(); if (!s || busy) return Promise.resolve();
    busy = true; mark.disabled = true;
    return window.RJProfiles.rpc('rejchat_notifications_read', {p_token:s.token,p_ids:ids}).then(function(){
      if (same(s)) return refresh();
    }).catch(function(){ if (same(s)) { chatError = 'Nie udało się oznaczyć powiadomień RejChat. Spróbuj ponownie.'; paint(); } }).finally(function(){busy = false; mark.disabled = false;});
  }
  function close(focus) { panel.hidden = true; bell.setAttribute('aria-expanded','false'); if (focus) bell.focus(); }
  bell.addEventListener('click', function(){ var opening = panel.hidden; panel.hidden = !opening; bell.setAttribute('aria-expanded',String(opening)); if(opening) refreshAll(); });
  wrap.querySelector('.rj-chat-alert-close').addEventListener('click',function(){close(true);});
  wrap.querySelector('.rj-chat-alert-refresh').addEventListener('click',refreshAll);
  mark.addEventListener('click',function(){if(window.RJPremium && typeof window.RJPremium.markRead === 'function')window.RJPremium.markRead(null);markRead(null);});
  list.addEventListener('click',function(e){
    var generalLink=e.target.closest('[data-general-notification]');
    if(generalLink) { if(e.button===0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && window.RJPremium && typeof window.RJPremium.markRead === 'function') { var href=generalLink.href; e.preventDefault(); window.RJPremium.markRead(generalLink.getAttribute('data-general-notification')); window.location.assign(href); } return; }
    var a=e.target.closest('[data-notification]'); if(!a)return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var marked=markRead([a.getAttribute('data-notification')]); close(false);
    // Na innej stronie poczekaj krótko na zapis, zanim nawigacja przerwie żądanie.
    if (a.getAttribute('href').charAt(0) !== '#') {
      e.preventDefault();
      Promise.race([marked, new Promise(function(resolve){setTimeout(resolve, 1200);})]).then(function(){window.location.assign(a.href);});
    }
  });
  document.addEventListener('click',function(e){if(!wrap.contains(e.target) && !panel.hidden)close(false);});
  document.addEventListener('keydown',function(e){if(e.key==='Escape' && !panel.hidden){e.preventDefault();close(true);}});
  function sessionChanged(){ serial++; items=[]; unread=0; chatError=''; paint(); refresh(); }
  window.addEventListener('rj:session-change',sessionChanged);
  window.addEventListener('rj:premium-notifications',paint);
  window.addEventListener('storage',function(e){if(e.key==='rejson_community_session_v1'||e.key===null)sessionChanged();});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')refreshAll();});
  window.setInterval(function(){if(document.visibilityState==='visible' && current()) refreshAll();},30000);
  paint(); refresh();
})(window, document);
