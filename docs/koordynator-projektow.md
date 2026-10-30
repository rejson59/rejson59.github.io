# Jeden czat, propozycje do wielu projektów

To narzędzie pozwala przygotować zmiany w tym czacie, a następnie **właścicielowi** jednym ręcznym uruchomieniem utworzyć osobne propozycje (pull requesty) w swoich projektach. Nie scala ich. Ten czat nadal pracuje tylko w gałęzi sesji bieżącego repozytorium; to GitHub, po osobnej decyzji właściciela, wykonuje akcję w innych projektach.

**Obecnie plan jest pusty.** Żaden inny projekt nie został zmieniony. Narzędzie przetestowano bez sieci, na imitacji GitHuba; pierwsze prawdziwe użycie wymaga konfiguracji poniżej i jeszcze nie zostało sprawdzone.

## Jednorazowe przygotowanie przez właściciela

GitHub nie pozwala użyć standardowego `GITHUB_TOKEN` do zapisywania w innych repozytoriach. Połączenie Arena w tej sesji nie ma dostępu do zarządzania ustawieniami Actions/sekretami, więc poniższych czynności agent nie może wykonać za Ciebie.

1. Wejdź w [GitHub → Settings → Developer settings → GitHub Apps → New GitHub App](https://github.com/settings/apps/new). Nadaj aplikacji unikalną nazwę, jako **Homepage URL** możesz wpisać `https://github.com/rejson59/rejson59.github.io`. Wyłącz **Webhook → Active**. W **Repository permissions** ustaw tylko **Contents: Read and write** oraz **Pull requests: Read and write** (Metadata pozostaje Read-only). Wybierz instalację **Only on this account** i utwórz aplikację.
2. Na stronie aplikacji zapisz jej **App ID**. W **Private keys** wygeneruj klucz i pobierz plik `.pem`. Traktuj go jak hasło: **nie wysyłaj go na czat, nie dodawaj do repozytorium ani nie publikuj**.
3. W aplikacji wybierz **Install App**, zainstaluj ją na swoim koncie, wybierając **Only select repositories** oraz tylko te swoje projekty, w których chcesz tworzyć PR-y. Możesz później zmienić wybór. Nie ma potrzeby nadawać aplikacji dostępu do tego głównego repozytorium, chyba że potrzebujesz go do czegoś innego.
4. Otwórz ustawienia repozytorium [rejson59.github.io → Secrets and variables → Actions](https://github.com/rejson59/rejson59.github.io/settings/secrets/actions). W zakładce **Variables** dodaj zmienną repozytorium `PROJECT_BRIDGE_APP_ID` z numerem App ID. W zakładce **Secrets** dodaj sekret repozytorium `PROJECT_BRIDGE_APP_PRIVATE_KEY`, wklejając całą zawartość pliku `.pem` bezpośrednio w formularzu GitHuba. Klucza nie przekazuj agentowi. Usuń pobrany plik z urządzenia, jeśli nie jest Ci potrzebny, a gdyby się ujawnił — unieważnij go w ustawieniach aplikacji i wygeneruj nowy.

Instalacja aplikacji daje jej powyższe uprawnienia do **wybranych** repozytoriów. Przy uruchomieniu tworzony jest krótkotrwały token ograniczony dodatkowo do repozytoriów wymienionych w planie; GitHub unieważnia go po zakończeniu zadania. To zaufana aplikacja: jej prywatny klucz pozwala uzyskać dostęp do wybranych projektów, więc przechowuj go wyłącznie w GitHub Secrets i kontroluj, kto może zmieniać workflow i sekret.

## Korzystanie

1. Napisz w tym czacie, co zmienić w których projektach. Agent analizuje je i przygotowuje plan oraz pliki w tym repozytorium. Agent nie uruchamia narzędzia i nie zapisuje bezpośrednio do innych projektów.
2. Przejrzyj przygotowany `koordynator/plan.json` i wskazane w nim pliki `koordynator/paczki/`. Zmiany tego repozytorium muszą trafić na `main`, zanim workflow będzie mógł je zobaczyć. **Repozytorium jest publiczne:** nie umieszczaj w planie ani paczkach haseł, kluczy, prywatnych danych ani kodu z prywatnych repozytoriów.
3. W [Actions → Zmiany w projektach](https://github.com/rejson59/rejson59.github.io/actions/workflows/zmiany-w-projektach.yml) wybierz **Run workflow**, gałąź `main`. Uruchomienie bez zaznaczonej zgody tylko sprawdza format i sumy plików oraz pokazuje listę projektów i ścieżek w podsumowaniu; **nie sprawdza aktualnego stanu innych repozytoriów** i nie wymaga aplikacji. Aby rzeczywiście utworzyć PR-y, ponownie uruchom workflow z zaznaczonym **„Zatwierdzam utworzenie propozycji…”**. Tylko właściciel konta może uruchomić wykonanie.
4. Obejrzyj wynik uruchomienia i każdy PR w projekcie. To Ty decydujesz, czy go scalić. GitHub pokazuje bieżący diff; sprawdź go także wtedy, gdy od przygotowania planu projekt się zmienił.

Narzędzie przed tworzeniem gałęzi sprawdza wszystkie projekty: publiczną widoczność, właściciela, dokładny commit gałęzi domyślnej, brak kolizji gałęzi, zwykłe pliki i sumy paczek. Tuż przed utworzeniem każdej gałęzi ponownie sprawdza stan gałęzi domyślnej, ale w GitHubie nie ma atomowej transakcji obejmującej wiele repozytoriów ani blokady równoległych zmian: stan może się zmienić również po sprawdzeniu. Nie zmienia gałęzi domyślnych i nie scala PR-ów. Każde repo dostaje gałąź `rejson-propozycja/<id-planu>`.

Jeśli część projektów się uda, a następny zgłosi błąd, wcześniejsze PR-y zostają. Jeśli samo utworzenie PR nie powiedzie się po utworzeniu gałęzi, gałąź zostaje bez PR. Nic nie jest automatycznie usuwane ani nadpisywane. Wynik i nazwa gałęzi są w dzienniku. Ponowne uruchomienie nie nadpisze istniejącej gałęzi i nie utworzy duplikatu; przed ponowieniem sprawdź już utworzone PR-y/gałęzie i poproś agenta o nowy plan dla pozostałych projektów.

## Format planu dla agenta

Pusty plan ma `{"wersja": 1, "stan": "brak"}`. Gotowy plan:

```json
{
  "wersja": 1,
  "stan": "gotowy",
  "id": "unikalny-identyfikator",
  "tytul": "Krótki tytuł PR",
  "opis": "Co i dlaczego zmieniono, oraz jak to przetestowano.",
  "projekty": [
    {
      "repozytorium": "NazwaPublicznegoRepo",
      "podstawa": "0123456789012345678901234567890123456789",
      "pliki": [
        {"sciezka": "src/plik.js", "zrodlo": "koordynator/paczki/unikalny-identyfikator/NazwaPublicznegoRepo/plik.js", "sha256": "tu-suma-sha256-pliku"},
        {"sciezka": "stary-plik.js", "usun": true}
      ]
    }
  ]
}
```

Powyższe wartości są przykładowe — przed użyciem trzeba podać rzeczywisty commit, sumę i pliki. `podstawa` to dokładny 40-znakowy SHA aktualnego commitu gałęzi domyślnej. `zrodlo` wskazuje **pełną nową treść** pliku w publicznej paczce, a nie diff. Każdy plan ma nowy identyfikator. Limit: 50 publicznych repozytoriów właściciela, 150 plików, łącznie 10 MiB. Bez dowiązań symbolicznych i submodułów. Usunięcia są jawne. Nowe pliki są zwykłymi plikami; dla istniejących zachowany jest bit wykonywalności. Pliki `.github/workflows/` są celowo wyłączone (aplikacja nie ma uprawnienia Workflows): takie zmiany wymagają osobnej, świadomej drogi. Plan nie wykonuje kodu z paczek.

Testy lokalne: `python3 scripts/test_project_bridge.py`. Testy nie wykonują żądań ani zapisów w prawdziwych repozytoriach.
