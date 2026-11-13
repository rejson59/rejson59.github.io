/* Podpięcie warstwy sieciowej, ograniczenie odpytywania i skończona
   wysokość listy rozmowy — regresje, które dawały „dane się nie ładują”
   oraz nieskończenie rosnący czat na telefonie. */
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'../..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const rejchat=read('rejhub2/rejchat.html');
const community=read('js/community.js');
const index=read('rejhub2/index.html');
const net=read('js/rj-net.js');
const viewport=read('css/rejchat-viewport.css');

let checks=0;
function check(name,ok,detail){checks++;if(!ok){console.error('  ✘ '+name+(detail?'  ['+detail+']':''));process.exitCode=1;}else console.log('  ✔ '+name+(detail?'  ['+detail+']':''));}

console.log('\n=== A. WARSTWA SIECIOWA ===');
{
  check('limit czasu żądania', /TIMEOUT_MS\s*=\s*15000/.test(net));
  check('ponawianie tylko tego, co ma sens', /s >= 500/.test(net) && /429/.test(net));
  check('sklejanie identycznych żądań', /inFlight\[dedupeKey\]/.test(net));
  check('limit równoczesnych żądań', /MAX_PARALLEL\s*=\s*6/.test(net));
  check('harmonogram zatrzymuje się przy ukrytej karcie', /document\.hidden/.test(net));
  check('odstęp rośnie po błędzie, wraca po sukcesie', /current = base;/.test(net) && /Math\.pow\(2/.test(net));
  check('czat korzysta ze wspólnej warstwy', /window\.RJNet\.rpc\(url/.test(community));
  check('odświeżanie czatu nie jest już co 2 s', /CHAT_REFRESH_MS\s*=\s*4500/.test(community));
  check('feed nie odświeża się co 12 s', /FEED_REFRESH_MS\s*=\s*25000/.test(community));
  check('lista rozmowy ma limit węzłów', /CHAT_MAX_SHOWN\s*=\s*60/.test(community));
  check('strona główna też ma warstwę sieciową', /rj-net\.js/.test(index));
  const before=rejchat.indexOf('/js/rj-net.js');
  const rpcUsers=['/js/rejchat-profiles.js','js/community.js','/js/premium.js'].map(f=>rejchat.indexOf(f));
  check('rj-net wczytuje się przed modułami RPC', before>0 && rpcUsers.every(i=>i>before));
}

console.log('\n=== B. CZAT: WYSOKOŚĆ I PRZEWIJANIE ===');
{
  check('lista ma własne przewijanie bez rosnącej wysokości', /overflow-y:\s*auto !important/.test(viewport));
  check('tafla ma skończoną wysokość na każdej szerokości', /--rj-chat-h/.test(viewport) && /max-height:\s*var\(--rj-chat-h,/.test(viewport));
  check('skrypt mierzy realną przestrzeń', /--rj-chat-h/.test(read('js/chat-viewport.js')) && /--rj-chat-fit/.test(read('js/chat-viewport.js')));
  check('arkusz wymiarów dołączony do czatu', /rejchat-viewport\.css/.test(rejchat));
  check('skrypt wymiarów dołączony do czatu', /chat-viewport\.js/.test(rejchat));
  check('pierwsze wejście ląduje na końcu', /if \(firstRender \|\| position\.following\) chatScrollBottom\(\)/.test(community));
  check('powrót z zakładki Wpisy wraca na koniec', /rj:tab-change/.test(community) && /chatScroll\.bottom\(\)/.test(community));
  check('filtr wyszukiwania nie przebiega po DOM przy każdej zmianie', /scheduleFilter/.test(read('js/rejchat.js')));
}

console.log('\n=== C. WYDAJNOŚĆ ===');
{
  check('soczewka SVG wyłączona na telefonie', /pointer: coarse/.test(read('js/glass-lens.js')));
  check('mniejsze rozmycie na małym ekranie', /--gl-blur:\s*blur\(14px\)/.test(read('css/performance.css')));
  check('feed nie przebudowuje się bez zmian', /postsSignature/.test(community));
  check('arkusz wydajnościowy na stronie głównej', /performance\.css/.test(index));
}

console.log('\nWYNIK: '+checks+' sprawdzeń'+(process.exitCode?' ✘':' ✔'));
