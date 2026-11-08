/* Nauka z polskiego: tłumaczenie, następnie odmiana. Postępy konta lub gościa. */
(function(window,document){
 'use strict';
 var verbs=window.REJCLASS_VERBS;if(!Array.isArray(verbs)||!verbs.length)return;
 var $=function(id){return document.getElementById(id);},hard=new Set(),known=new Set(),source=$('practice-source'),size=$('practice-size'),mode='cards',progress=window.RJClassProgress,practiceReady=false;
 function updateProgress(info){
  hard=new Set();known=new Set();Object.keys(info.entries).forEach(function(k){if(info.entries[k]==='hard')hard.add(k);else if(info.entries[k]==='known')known.add(k);});practiceReady=info.ready&&!info.importing;
  $('progress-count').textContent='Znane: '+known.size+' / '+verbs.length+' · Do powtórki: '+hard.size;
  $('progress-login').hidden=info.account;$('progress-retry').hidden=!info.account||!info.error;$('progress-retry').disabled=info.busy;$('progress-import').hidden=!info.account||!info.ready||!info.guestCount;
  $('progress-import').disabled=info.busy||!!info.pending;
  var status=info.account?(!info.ready?'Łączenie z kontem…':('Konto '+info.username+' · '+(info.pending?'Oczekuje na zapis: '+info.pending:(info.busy?'Synchronizuję…':'Postępy zapisane na koncie.')))): 'Bez konta: postępy tylko w tej przeglądarce.';
  if(info.error)status=info.error+(info.pending?(info.storageOK?' Zmiany oczekują na tym urządzeniu.':' Zmiany są tylko w pamięci tej karty.'):'');else if(info.account&&info.pending&&!info.storageOK)status+=' Nie zamykaj karty do zakończenia zapisu.';else if(!info.storageOK&&!info.account)status='Nie udało się zapisać na urządzeniu; postęp pozostanie tylko w tej karcie.';
  $('sync-status').textContent=status;
  if(info.reset){startCards();startQuiz();}else {if(cards.length){$('card-repeat').disabled=!practiceReady||cardStage<2;$('card-know').disabled=!practiceReady||cardStage<2;}[$('quiz-base'),$('quiz-past'),$('quiz-participle')].forEach(function(el){el.disabled=!practiceReady||checked;});$('quiz-check').disabled=!practiceReady;}
 }
 $('progress-login').addEventListener('click',function(){try{sessionStorage.setItem('rejson_account_return_v1',JSON.stringify({path:'/rejclass',at:Date.now()}));this.href='/logowanie?powrot=1';}catch(_){this.href='/logowanie';}});
 $('progress-retry').addEventListener('click',function(){progress.retry();});
 $('progress-import').addEventListener('click',function(){if(!window.confirm('Przenieść lokalne postępy na to konto? Istniejące wyniki konta nie zostaną nadpisane.'))return;var n=progress.importGuest();if(!n)$('sync-status').textContent='Wszystkie lokalne słówka są już zapisane na tym koncie.';});
 function mark(verb,status){progress.set(verb,status);}
 function display(s){return s.split('|').join(' / ');}
 function shuffle(arr){arr=arr.slice();for(var i=arr.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),tmp=arr[i];arr[i]=arr[j];arr[j]=tmp;}return arr;}
 function pool(){var rows=verbs.filter(function(v){return source.value==='all'||hard.has(v[0]);}),number=size.value==='all'?rows.length:Number(size.value);return shuffle(rows).slice(0,number);}
 function setProgress(prefix,done,total){$(prefix+'-progress-bar').style.width=(total?Math.round(done/total*100):0)+'%';}
 function button(text,fn){var b=document.createElement('button');b.type='button';b.className='rjc-secondary';b.textContent=text;b.addEventListener('click',fn);return b;}
 function showEmpty(id,title,description,actionText,action){var box=$(id),strong=document.createElement('strong'),text=document.createElement('p');box.replaceChildren();strong.textContent=title;text.textContent=description;box.append(strong,text);if(action)box.appendChild(button(actionText,action));box.hidden=false;}
 $('share-class').addEventListener('click',async function(){var url='https://rejson59.github.io/rejclass';try{if(!navigator.clipboard||!navigator.clipboard.writeText)throw Error('clipboard unavailable');await navigator.clipboard.writeText(url);$('share-fallback').hidden=true;$('share-status').textContent='Link skopiowany — możesz wysłać go klasie!';}catch(_){$('share-fallback').hidden=false;$('share-url').focus();$('share-url').select();$('share-status').textContent='Skopiuj zaznaczony adres i wyślij go klasie.';}});
 var cards=[],cardsTotal=0,cardsDone=0,cardStage=0;
 function renderCards(){
  if(!cards.length){$('cards-play').hidden=true;if(!cardsTotal)showEmpty('cards-empty','Na razie brak trudnych słówek.','Wybierz wszystkie słówka albo oznacz fiszkę „Jeszcze raz”.');else showEmpty('cards-empty','Zestaw ukończony! ✨','Świetna robota — możesz wylosować kolejną porcję.', 'Nowy zestaw',startCards);return;}
  $('cards-empty').hidden=true;$('cards-play').hidden=false;var v=cards[0];cardStage=0;$('card-word').textContent=v[3];$('card-meaning').textContent=v[0];$('card-meaning').hidden=true;$('card-past').textContent=display(v[1]);$('card-participle').textContent=display(v[2]);$('card-answer').hidden=true;$('card-hint').textContent='Kliknij, aby odkryć tłumaczenie ↗';$('flashcard').setAttribute('aria-label',v[3]+'. Odkryj tłumaczenie.');$('card-repeat').disabled=true;$('card-know').disabled=true;$('cards-progress').textContent='Fiszki · opanowane '+cardsDone+' / '+cardsTotal;$('cards-count').textContent='Pozostało '+cards.length;setProgress('cards',cardsDone,cardsTotal);
 }
 function startCards(){cards=pool();cardsTotal=cards.length;cardsDone=0;renderCards();}
 $('flashcard').addEventListener('click',function(){if(!cards.length||!practiceReady||cardStage>=2)return;var v=cards[0];cardStage++;if(cardStage===1){$('card-meaning').hidden=false;$('card-hint').textContent='Kliknij ponownie, aby odkryć II i III formę ↗';$('flashcard').setAttribute('aria-label',v[3]+'. Tłumaczenie: '+v[0]+'. Odkryj pozostałe formy.');}else{$('card-answer').hidden=false;$('card-hint').textContent='Oceń, czy już znasz wszystkie formy.';$('flashcard').setAttribute('aria-label',v[3]+': '+v[0]+', '+display(v[1])+', '+display(v[2]));$('card-repeat').disabled=false;$('card-know').disabled=false;}});
 $('card-repeat').addEventListener('click',function(){if(!cards.length||!practiceReady||cardStage<2)return;var v=cards.shift();mark(v[0],'hard');cards.push(v);renderCards();});
 $('card-know').addEventListener('click',function(){if(!cards.length||!practiceReady||cardStage<2)return;var v=cards.shift();mark(v[0],'known');cardsDone++;renderCards();});
 $('cards-shuffle').addEventListener('click',startCards);
 var quiz=[],qIndex=0,correct=0,missed=[],checked=false;
 function accepted(input,answers){var parts=input.trim().toLowerCase().split(/\s*[,;/]\s*/).filter(Boolean),allowed=answers.split('|');return parts.length>0&&parts.every(function(part){return allowed.indexOf(part.trim())!==-1;});}
 function renderQuestion(){
  if(!quiz.length){$('quiz-play').hidden=true;showEmpty('quiz-empty','Na razie brak trudnych słówek.','Wybierz wszystkie słówka albo oznacz fiszkę „Jeszcze raz”.');return;}
  if(qIndex>=quiz.length){$('quiz-play').hidden=true;showEmpty('quiz-empty','Wynik: '+correct+' / '+quiz.length,missed.length?'Słówka z błędami dodano do powtórki. Sprawdź status zapisu powyżej.':'Wszystkie odpowiedzi poprawne — dobra robota!',missed.length?'Powtórz błędy':'Nowy quiz',missed.length?function(){quiz=shuffle(missed);qIndex=0;correct=0;missed=[];renderQuestion();}:startQuiz);return;}
  $('quiz-empty').hidden=true;$('quiz-play').hidden=false;checked=false;var v=quiz[qIndex];$('quiz-progress').textContent='Pytanie '+(qIndex+1)+' / '+quiz.length;$('quiz-score').textContent='Poprawne: '+correct;setProgress('quiz',qIndex,quiz.length);$('quiz-word').textContent=v[3];$('quiz-meaning').textContent='Przetłumacz na angielski, a potem wpisz II i III formę.';$('quiz-base').value='';$('quiz-past').value='';$('quiz-participle').value='';[$('quiz-base'),$('quiz-past'),$('quiz-participle')].forEach(function(input){input.disabled=!practiceReady;input.removeAttribute('aria-invalid');});$('quiz-feedback').hidden=true;$('quiz-feedback').replaceChildren();$('quiz-check').hidden=false;$('quiz-check').disabled=!practiceReady;$('quiz-next').hidden=true;
 }
 function startQuiz(){quiz=pool();qIndex=0;correct=0;missed=[];renderQuestion();}
 function meaningParts(v){return v[3].split(';').map(function(x){return normalized(x.replace(/\s*\([^)]*\)/g,'').trim());}).filter(Boolean);}
 function alternatives(v){var labels=meaningParts(v);return verbs.filter(function(other){return meaningParts(other).some(function(x){return labels.indexOf(x)>=0;});});}
 $('quiz-form').addEventListener('submit',function(e){e.preventDefault();if(checked||!quiz[qIndex]||!practiceReady)return;var v=quiz[qIndex],candidates=alternatives(v),base=$('quiz-base').value.trim().toLowerCase(),matched=candidates.find(function(x){return x[0]===base;}),past=!!matched&&accepted($('quiz-past').value,matched[1]),part=!!matched&&accepted($('quiz-participle').value,matched[2]),right=!!matched&&past&&part;
  if(!right){mark(v[0],'hard');missed.push(v);}else{mark(matched[0],'known');correct++;}checked=true;
  [$('quiz-base'),$('quiz-past'),$('quiz-participle')].forEach(function(el,i){el.setAttribute('aria-invalid',String(!(i===0?!!matched:i===1?past:part)));el.disabled=true;});
  var feedback=$('quiz-feedback'),label=document.createElement('strong'),answer=document.createElement('div');label.textContent=right?'Dobrze! ✓':'Tym razem nie do końca.';answer.textContent=(matched&&matched!==v?'Twoje tłumaczenie: '+matched[0]+' – '+display(matched[1])+' – '+display(matched[2])+'. Na fiszce: ':'Formy z tej fiszki: ')+v[0]+' – '+display(v[1])+' – '+display(v[2]);feedback.replaceChildren(label,answer);feedback.hidden=false;$('quiz-check').hidden=true;$('quiz-next').hidden=false;$('quiz-next').textContent=qIndex===quiz.length-1?'Zobacz wynik →':'Dalej →';$('quiz-score').textContent='Poprawne: '+correct;$('quiz-next').focus();});
 $('quiz-next').addEventListener('click',function(){if(!checked)return;qIndex++;renderQuestion();if(qIndex<quiz.length)$('quiz-base').focus();});$('quiz-restart').addEventListener('click',startQuiz);
 function normalized(value){return String(value).toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l');}
 function renderList(){var q=normalized($('list-search').value.trim()),matches=verbs.filter(function(v){return normalized(v.join(' ')).indexOf(q)!==-1;}),list=$('verbs-list');list.replaceChildren();matches.forEach(function(v){var row=document.createElement('tr');v.forEach(function(value,i){var cell=document.createElement('td');cell.dataset.label=['Infinitive','Past Simple','Past Participle','Znaczenie'][i];cell.textContent=display(value);row.appendChild(cell);});list.appendChild(row);});$('list-count').textContent=matches.length?'Wyświetlono '+matches.length+' z '+verbs.length+' czasowników.':'Brak wyników. Spróbuj innego słowa.';}
 function changeMode(next){mode=next;document.querySelectorAll('[data-mode]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});['cards','quiz','list'].forEach(function(name){$(name+'-panel').hidden=name!==mode;});$('practice-settings').hidden=mode==='list';if(mode==='list')renderList();}
 document.querySelectorAll('[data-mode]').forEach(function(b){b.addEventListener('click',function(){changeMode(b.dataset.mode);});});
 [source,size].forEach(function(el){el.addEventListener('change',function(){startCards();startQuiz();});});$('list-search').addEventListener('input',renderList);
 $('verb-count').textContent=String(verbs.length);renderList();startCards();startQuiz();$('study-app').hidden=false;progress.start(updateProgress);
})(window,document);
