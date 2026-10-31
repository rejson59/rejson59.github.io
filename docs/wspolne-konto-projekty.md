# Wspólne konto w projektach GitHub Pages

To ten sam backend Supabase i ta sama sesja `rejson_community_session_v1`, których używają strona główna, RejChat i RejStream. **Nie jest to nowy dostawca SSO** ani logowanie między domenami. Istniejące konta mogą używać starszego czterocyfrowego PIN-u lub ustawić hasło; nowe formularze strony głównej obsługują hasła. Backend ogranicza próby logowania na konto, ale może to też umożliwiać czasową blokadę konta i nie chroni przed spamem rejestracji. Rzeczywiste odpowiedzi HTTP PostgREST nie zostały jeszcze osobno potwierdzone. Nie ma automatycznego odzyskiwania zapomnianego hasła.

## Dla odwiedzającego

Na obsługiwanej stronie projektu rozwiń pigułkę feedbacku i wybierz **Konto**. Ekran logowania po udanym zalogowaniu wraca do projektu w tej samej karcie. Adres powrotu przechowywany jest tymczasowo w `sessionStorage`, nie są przekazywane tokeny w URL. Zalogowanie w projekcie i na stronie głównej dotyczy tej samej sesji tylko przy dokładnie tym samym originie (protokół, domena i port).

Wspólny service worker strony może dodać widżet i `js/rejson-account.js` do dokumentów projektów pod `https://rejson59.github.io/<projekt>/`. To nie działa niezawodnie przy pierwszym bezpośrednim wejściu bez zainstalowanego workera, gdy inny worker obsługuje dany projekt, dla stron na Vercel/innych domenach albo gdy CSP lub inne ustawienia projektu blokują skrypty. Dla niezawodności twórca projektu powinien dołączyć poniższy skrypt w samym projekcie. Odmienne domeny mają osobne `localStorage`, a osadzenie zdalnego skryptu nie daje im wspólnej sesji. Nie wysyłaj tam tokenu w adresie, QR ani `postMessage`.

## Integracja projektu

W HTML projektu na tym samym originie (i z CSP pozwalającą na skrypt oraz połączenie z Supabase):

```html
<script src="/js/rejson-account.js?v=1" defer></script>
```

Skrypt dostępny jako `window.RejsonAccount`:

```js
// Weryfikuje token w community_whoami, nie ufa nazwie z localStorage.
// null = brak lub nieważna sesja; odrzucenie Promise = sieć/serwer niedostępne.
const session = await window.RejsonAccount.getSession();
if (session) console.log('Zalogowano jako', session.username);

// Zaloguj się / zarządzaj kontem i wróć do bieżącej strony tej samej karty.
window.RejsonAccount.open();

// Wywoływane dla zdarzenia rj:session-change oraz zmian z innej karty.
const unsubscribe = window.RejsonAccount.subscribe(() => { /* ponownie sprawdź getSession() */ });
```

Kod, który zmienia sesję w tej samej karcie, powinien dodatkowo wysłać `window.dispatchEvent(new Event("rj:session-change"))`; przeglądarka nie wysyła `storage` do tej samej karty. Starsze aplikacje, które tego nie robią, mogą wymagać ponownego `getSession()`.

`session.token` jest obecnym tokenem społeczności do RPC wymagających sesji, a nie nowym tokenem OAuth. Nie zapisuj go w URL, logach, zgłoszeniach ani publicznych profilach. Każdy backend musi sam potwierdzić uprawnienia tokenu; sama nazwa lub UI nie jest autoryzacją. Skrypty współdzielące origin mogą odczytywać tę samą pamięć, dlatego projekty na wspólnym originie **nie są wzajemnie odizolowane**.

Wstrzykiwany skrypt jest `defer`; projekt uruchamiany wcześniej może nasłuchiwać `rj:account-ready` lub sam dołączyć skrypt przed swoim kodem. Integracja sesji nie dodaje automatycznie zapisu danych do aplikacji. Szczególnie ProStudent ma dane lokalne i ich synchronizacja wymaga osobnego projektu i zgody użytkownika.

## Podróż rakietą i oczekiwanie na projekt

Kliknięcie projektu otwiera nową kartę z automatyczną podróżą. Dla tego samego originu `sessionStorage` otrzymuje jednorazowy, krótko ważny znacznik `rj_rocket_trip_v1`, który nie zawiera tokenu konta. Globalny worker może wstawić do projektu CSS i skrypt pokazujące rakietę podczas ładowania, po meta CSP i przed blokującymi skryptami. Przy ograniczeniu ruchu w ustawieniach systemu projekt otwiera się od razu, bez animacji.

Efekt nie jest gwarantowany przy innym originie, restrykcyjnej CSP ani w projekcie z własnym service workerem o węższym zakresie. Nie zastępuj jego workera — może obsługiwać offline/PWA. W takich projektach na wspólnej domenie można dodać w `<head>`, po meta CSP i przed blokującymi skryptami:

```html
<link rel="stylesheet" href="/css/portal.css?v=13" data-rj-portal-style>
<script src="/js/portal-arrival.js?v=12"></script>
```

Nazwy ścieżek pozostają dla zgodności, lecz animacja przedstawia rakietę, nie portal. Bez poprawnego znacznika skrypt nic nie wyświetla. Na obcej domenie nie jest dostępny znacznik `sessionStorage` strony głównej; projekt otworzy się bez zasłony oczekiwania.
