# RejClass — nauka i postępy

Fiszka najpierw pokazuje polskie znaczenie, po kliknięciu angielski bezokolicznik, a po kolejnym II i III formę. Quiz podaje polskie znaczenie i prosi o trzy angielskie formy. Dla znaczeń wspólnych kilku czasowników z listy akceptuje także inne pasujące słowo wraz z jego formami; inne poprawne tłumaczenia spoza listy warto sprawdzić z nauczycielem.

„Już umiem” oraz poprawna odpowiedź oznaczają dany czasownik jako znany; „Jeszcze raz” oraz błąd oznaczają go do powtórki. Licznik pokazuje zapisane oznaczenia, nie przewiduje wyniku kartkówki. Postępy dotyczą tego zestawu 138 słówek, a nie historii wszystkich wyników quizów.

- Gość korzysta z lokalnych danych przeglądarki. Istniejąca lista `rejclass-irregular-hard-v1` pozostaje dostępna.
- Po zalogowaniu odczyt i zapis używają sesji wspólnego konta, a rekordy są przypisane do zweryfikowanego `user_id`. Nie są publiczne ani przechowywane w URL. Przy powrocie lub po zmianie widoczności dane są odświeżane, a równoczesne zmiany tego samego słowa rozstrzyga ostatni zapis, który dotrze do serwera.
- Lokalne dane nie są automatycznie przypisywane do konta na współdzielonym urządzeniu. Przycisk „Przenieś lokalne postępy” po potwierdzeniu dodaje tylko słowa bez istniejącego statusu na koncie, nie nadpisuje wcześniejszego stanu konta i nie usuwa danych gościa.
- Błędy sieci są widoczne. Niewysłane zmiany są ponawiane; jeśli przeglądarka pozwala na zapis, oczekują lokalnie pod identyfikatorem zweryfikowanego konta. W przypadku braku zapisu lokalnego pozostają tylko w otwartej karcie. Po przełączeniu kont oczekujące zmiany nie są wysyłane do innego konta.
- Migracja: `supabase/2026-11-09_rejclass_progress.sql`, `supabase/2026-11-09_rejclass_import.sql`; testy izolacji i uprawnień w `supabase/tests/`.
