#!/usr/bin/env python3
"""Regeneruje js/project-updates.js — pigułki wersji projektów.

Zasada działania strony: wersja jest ZGODNA z rzeczywistą datą ostatniego
git pusha do repozytorium (pole pushed_at z GitHub API), w formacie
vRRRR.MM.DD — dlatego ten skrypt może bezpiecznie działać automatycznie
(co noc przez GitHub Action, workflow .github/workflows/project-updates.yml).

Ręczne dopiski (note) NIE są nadpisywane: skrypt odczytuje dotychczasowy
plik, wyciąga z niego notatki per projekt i przenosi je dalej. Notatkę
dodaje się raz, ręczną edycją js/project-updates.js — kolejne uruchomienia
skryptu ją zachowają.

Uruchomienie lokalne:

    python3 scripts/update-project-updates.py
"""

import json
import os
import re
import urllib.request
from pathlib import Path

USER = "rejson59"
# Repo profilowe to nie projekt; strona (rejson59.github.io) ma własną pigułkę
EXCLUDED = {"rejson59"}
API = f"https://api.github.com/users/{USER}/repos?per_page=100&sort=pushed"
OUT = Path(__file__).resolve().parent.parent / "js" / "project-updates.js"

HEADER = """/*!
 * Pigułki wersji projektów — WYŁĄCZNIE prawdziwe dane.
 *
 * Projekty nie mają oficjalnych wydań (releases) na GitHubie, więc wersja
 * jest zgodna z rzeczywistą datą ostatniej aktualizacji repozytorium
 * (ostatni `git push` wg GitHub API, format: vRRRR.MM.DD).
 * Dopisek (note) pojawia się tylko wtedy, gdy dana zmiana NAPRAWDĘ
 * została wdrożona — żadnych wymyślonych notatek.
 *
 * PLIK GENEROWANY AUTOMATYCZNIE (GitHub Action raz na dobę +
 * scripts/update-project-updates.py). Ręcznie edytuj TYLKO dopiski note.
 */
"""

ENTRY_RE = re.compile(r'"([^"]+)"\s*:\s*\{([^}]*)\}')
NOTE_RE = re.compile(r'note\s*:\s*"((?:[^"\\]|\\.)*)"')


def fetch_repos() -> list:
    headers = {"User-Agent": "rejson59-site", "Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(API, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def read_existing_notes() -> dict:
    if not OUT.exists():
        return {}
    text = OUT.read_text(encoding="utf-8")
    notes = {}
    for name, body in ENTRY_RE.findall(text):
        m = NOTE_RE.search(body)
        if m:
            notes[name] = m.group(1)
    return notes


def js_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def main() -> None:
    repos = fetch_repos()
    notes = read_existing_notes()

    entries = []
    for r in repos:
        if r.get("fork") or r.get("name") in EXCLUDED:
            continue
        pushed = r.get("pushed_at")
        if not pushed:
            continue
        version = "v" + pushed[:10].replace("-", ".")
        name = r["name"]
        line = f'  "{js_escape(name)}": {{ version: "{version}"'
        if name in notes:
            line += f', note: "{notes[name]}"'
        line += " }"
        entries.append((pushed, line))

    entries.sort(key=lambda e: e[0], reverse=True)
    body = ",\n".join(line for _, line in entries)

    OUT.write_text(f"{HEADER}window.PROJECT_UPDATES = {{\n{body}\n}};\n", encoding="utf-8")
    print(f"Zaktualizowano {len(entries)} pigułek wersji -> {OUT}")


if __name__ == "__main__":
    main()
