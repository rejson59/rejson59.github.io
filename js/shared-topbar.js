/* Wspólne menu tam, gdzie strona nie ma własnej obsługi. */
(function () {
  'use strict';
  var button=document.querySelector('.rj-shared-header .hamburger-btn');
  var nav=button && document.getElementById(button.getAttribute('aria-controls'));
  function close(){if(nav){nav.classList.remove('is-open');button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Otwórz menu');}}
  if(button && nav){if(button.hasAttribute('data-shared-menu'))button.addEventListener('click',function(){var open=nav.classList.toggle('is-open');button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Zamknij menu':'Otwórz menu');});nav.addEventListener('click',function(e){if(e.target.closest('a'))close();});document.addEventListener('click',function(e){if(!nav.contains(e.target)&&!button.contains(e.target))close();});}
  var theme=document.querySelector('[data-shared-theme]');
  if(theme)theme.addEventListener('click',function(){var next=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=next;try{localStorage.setItem('theme',next);}catch(e){}});
  var more=document.querySelector('.rj-shared-header .nav-more');
  document.addEventListener('click',function(e){if(more && !more.contains(e.target))more.open=false;});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(more&&more.open){more.open=false;more.querySelector('summary').focus();}else if(nav&&nav.classList.contains('is-open')){close();button.focus();}}});
})();
