# rejson59.github.io — portfolio

Strona portfolio dostępna pod [https://rejson59.github.io/](https://rejson59.github.io/) — przegląd wszystkich publicznych projektów użytkownika [rejson59](https://github.com/rejson59) z GitHuba. Karty 3D, wyszukiwarka, filtry po języku i sortowanie. Dane pobierane na żywo z API GitHuba z fallbackiem w `js/projects-data.js`.

## Struktura plików

```
.
├── index.html            # strona główna (tytuł: „Rejson — projekty open source”)
├── 404.html              # własna strona 404
├── favicon.svg           # ikona strony
├── .nojekyll            # wyłącza Jekyll na GitHub Pages
├── css/
│   └── style.css         # style strony
├── js/
│   ├── app.js            # logika: fetch z API GitHuba, render kart, filtry
│   └── projects-data.js  # kopia zapasowa listy 42 projektów (fallback)
└── scripts/
    └── fetch-repos.py    # generuje js/projects-data.js z API GitHuba
```

## Uruchomienie lokalne

W katalogu głównym repozytorium:

```bash
python3 -m http.server 8000
# lub dowolny inny port, np. 8080
```

Otwórz [http://localhost:8000/](http://localhost:8000/) — wszystkie pliki powinny zwracać HTTP 200.

Sprawdzenie składni JS:

```bash
node --check js/app.js
```

## Odświeżanie danych

Lista projektów na żywo pochodzi z `https://api.github.com/users/rejson59/repos`, ale dla niezawodności strona korzysta z kopii zapasowej. Aby ją zaktualizować:

```bash
python3 scripts/fetch-repos.py
```

Skrypt pomija repozytoria infrastrukturalne (`rejson59`, `rejson59.github.io`) i forki, zapisuje wynik do `js/projects-data.js` wraz z datą generowania.

Źródło strony zostało przetestowane w repo [`rejson59/rejson59`](https://github.com/rejson59/rejson59) na branchu `arena/d5e14535-rejson59` ([PR #1](https://github.com/rejson59/rejson59/pull/1)).

## Publikacja

GitHub Pages publikuje z brancha `main` (folder `/`). Każdy push na `main` automatycznie wdraża stronę pod https://rejson59.github.io/.
