# Plan łączenia projektów Rejsona

Stan: 30 października 2026. To **plan i rejestr pracy**, nie deklaracja, że projekty są już połączone. Spis obejmuje publiczne, niearchiwalne repozytoria właściciela widoczne w GitHub API; repozytoriów prywatnych nie kopiujemy do publicznego planu. Sama obecność na liście nie oznacza audytu ani tego, że dana aplikacja potrzebuje konta.

## Zasady

- Zachować działające projekty, ich dane, istniejące konta i niezależne funkcje. Wprowadzać integrację stopniowo, z testem i oddzielnym PR-em dla danego projektu. Właściciel uruchamia workflow i zatwierdza PR-y; koordynator nie scala ich automatycznie.
- Wspólne konto oparte jest na obecnym Supabase strony głównej. Automatyczna wspólna sesja przez `localStorage` działa tylko na tym samym originie; dla innych domen potrzebne jest bezpieczne rozwiązanie, nie wolno przekazywać tokenów w URL ani ufać samej nazwie użytkownika.
- Autoryzację danych prywatnych wymusza backend, nie tylko interfejs. Przenoszenie już istniejących danych i łączenie kont wymaga bezpiecznego potwierdzenia własności, zgody i sposobu wycofania; nie łączymy cudzych kont po samym nicku ani słabym PIN-ie.
- Zależności, nowe usługi i ewentualne koszty wideo/TURN czy hostingu ustalać uczciwie przed ich wprowadzeniem. Zachować używane przez użytkownika GitHub Pages i Supabase; nie wprowadzać osobnego hostingu jako warunku bez jego zgody.
- Repozytoria mogą być bibliotekami, grami offline, narzędziami lub aplikacjami lokalnymi; integracja powinna mieć sens w danym produkcie i nie może odbierać mu działania offline.

## Kolejność i status

1. **RejStream — propozycja #28 scalona i wdrożona.** Hasło i stary PIN, rejestracja w projekcie, naprawa danych i linku profilu RejChat; testy w projekcie oraz publikacja GitHub Pages zakończyły się sukcesem. Rzeczywiste logowanie HTTP po wdrożeniu nie zostało jeszcze sprawdzone.
2. **Wspólne konto — prace częściowe.** Hasła i ograniczenie prób logowania wdrożono wcześniej; pozostaje sprawdzić rzeczywiste HTTP PostgREST oraz ograniczyć spam rejestracji po stronie serwera. Bez e-maila nie ma automatycznego odzyskania hasła.
3. **mconline oraz ProStudent / Plecak — konto przygotowane do przeglądu.** Paczka `konto-mconline-plecak-20261030` proponuje opcjonalne logowanie i rejestrację bezpośrednio w obu aplikacjach. Są to osobne PR-y, tworzone dopiero po uruchomieniu workflow przez właściciela; nie są wdrożone ani scalone automatycznie. Formularze używają istniejącego backendu, potwierdzają tożsamość sesji na serwerze i nie zmieniają lokalnych danych. Typecheck, testy mock/JSDOM i build przeszły; prawdziwe logowanie HTTP/CORS jeszcze nie zostało sprawdzone.

   **Ważne: to nie jest przenoszenie danych.** Światy solo w mconline i dane szkolne w Plecaku nadal są lokalne. mconline ma limit 8 światów; istniejący import może zastąpić świat o tym samym ID i uciąć listę. Gra sieciowa korzysta z innego Supabase i lokalnego PID, a nie slotów solo. Plecak ma eksport i import danych, ale import po potwierdzeniu zastępuje lokalne dane. Następny etap powinien zapewnić serwerową weryfikację tokenu, izolację kont, limity i jawną obsługę konfliktów, bez wiązania danych po nazwie, PID czy słabym PIN-ie. Synchronizacja multiplayera wymaga osobnego bezpiecznego projektu.

   **Poprawki portalu i offline — scalone i wdrożone:** mconline [#72](https://github.com/rejson59/mconline/pull/72) i ProStudent [#22](https://github.com/rejson59/ProStudent/pull/22), CI oraz GitHub Pages zakończone sukcesem. Dotyczyły wyjścia z portalu i ograniczenia cache/SW Plecaka, nie kont.
4. **RejChat — częściowy publiczny czat i profile.** Do zrobienia: zaproszenia i znajomi, prywatne wiadomości, grupy, blokady oraz prawdziwe powiadomienia; potem głos i wideo z uwzględnieniem sygnalizacji, NAT/TURN, uprawnień i kosztów. Bez RLS/RPC i testów izolacji nie przedstawiać prywatności jako gotowej.
5. **Pozostałe projekty — audyt kolejno.** Ustalić w każdym origin, sposób uruchamiania, istniejące konta i dane, sieć, SW/CSP, zasadność wspólnego konta i przejść portalowych. Osobno przygotować plan oraz testy, bez automatycznego łączenia danych.

## Publiczne repozytoria do przeglądu

Lista jest inwentaryzacją, a nie wynikiem pełnego audytu. Statusy szczegółowe opisano wyżej; pozostałe wymagają rozpoznania.

- [AbsurdalneGry](https://github.com/rejson59/AbsurdalneGry)
- [AnimationBuilder](https://github.com/rejson59/AnimationBuilder)
- [ASI](https://github.com/rejson59/ASI)
- [Blessed-Optimizer](https://github.com/rejson59/Blessed-Optimizer)
- [ClassQuest](https://github.com/rejson59/ClassQuest)
- [CrystalChat](https://github.com/rejson59/CrystalChat)
- [DiffrentReality](https://github.com/rejson59/DiffrentReality)
- [DreamKnight](https://github.com/rejson59/DreamKnight)
- [FocusIt](https://github.com/rejson59/FocusIt)
- [Jakuplayer](https://github.com/rejson59/Jakuplayer)
- [JoyPad](https://github.com/rejson59/JoyPad)
- [kompi](https://github.com/rejson59/kompi)
- [Lisi](https://github.com/rejson59/Lisi)
- [lumen-os](https://github.com/rejson59/lumen-os)
- [mc-launcher](https://github.com/rejson59/mc-launcher)
- [mconline](https://github.com/rejson59/mconline)
- [MeshRouter](https://github.com/rejson59/MeshRouter)
- [MiniVS-Code](https://github.com/rejson59/MiniVS-Code)
- [MiraOS](https://github.com/rejson59/MiraOS)
- [NexoAgents](https://github.com/rejson59/NexoAgents)
- [nimo](https://github.com/rejson59/nimo)
- [Nixi](https://github.com/rejson59/Nixi)
- [Nixi-v2](https://github.com/rejson59/Nixi-v2)
- [OffChat](https://github.com/rejson59/OffChat)
- [Private-valut](https://github.com/rejson59/Private-valut)
- [ProStudent](https://github.com/rejson59/ProStudent)
- [QuickDraw](https://github.com/rejson59/QuickDraw)
- [Qwazon-LLM](https://github.com/rejson59/Qwazon-LLM)
- [RealisticCarNight](https://github.com/rejson59/RealisticCarNight)
- [RejFile](https://github.com/rejson59/RejFile)
- [rejson59.github.io](https://github.com/rejson59/rejson59.github.io)
- [RejStream](https://github.com/rejson59/RejStream)
- [ReysonAI](https://github.com/rejson59/ReysonAI)
- [roblox-online](https://github.com/rejson59/roblox-online)
- [RobloxAIGameBuilder](https://github.com/rejson59/RobloxAIGameBuilder)
- [SiteStore](https://github.com/rejson59/SiteStore)
- [TheMostPowerfulPrompt](https://github.com/rejson59/TheMostPowerfulPrompt)
- [VibeAnimations](https://github.com/rejson59/VibeAnimations)
- [VibeCodeAI](https://github.com/rejson59/VibeCodeAI)
- [X-Offline](https://github.com/rejson59/X-Offline)
- [zaplecze-resellera](https://github.com/rejson59/zaplecze-resellera)
- [Zayra-ai-asistant](https://github.com/rejson59/Zayra-ai-asistant)
- [zayra-voice](https://github.com/rejson59/zayra-voice)

## Odłożone: dobrowolne wsparcie

Właściciel poprosił, aby wrócić później do jednorazowych wpłat oraz ewentualnych planów Pro/Premium. Nie wybrano ani nie skonfigurowano operatora i nie uruchomiono żadnych płatności. Temat należy przypomnieć przy odpowiedniej kolejnej rozmowie; asystent nie ma automatycznego, terminowego przypominania. Przed wdrożeniem ustalić operatora, koszty, zasady rozliczeń oraz bezpieczną weryfikację uprawnień. Istniejące darmowe funkcje mają pozostać dostępne.
