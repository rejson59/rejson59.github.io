#!/usr/bin/env python3
"""Regeneruje js/projects-data.js — kopię zapasową listy repozytoriów.

Strona na żywo pobiera dane z API GitHuba, a ten plik służy jako fallback,
gdyby API było niedostępne (np. limit zapytań). Uruchom:

    python3 scripts/fetch-repos.py
"""

import html
import json
import re
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

USER = "rejson59"
EXCLUDED = {"rejson59", "rejson59.github.io"}  # repo profilowe + samo to repo strony
API = f"https://api.github.com/users/{USER}/repos?per_page=100&sort=updated"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "js" / "projects-data.js"
INDEX = ROOT / "index.html"
# Pozostałe projekty z tekstowymi linkami w HTML; pięć wyróżnionych ma już osobne karty.
STATIC_PROJECTS = ("RejSearch", "ProStudent", "kompi", "OffChat", "ClassQuest")
START = "<!-- static-projects:start -->"
END = "<!-- static-projects:end -->"


def render_static_projects(projects: list[dict]) -> str:
    """Karty awaryjne dla czytelników bez JS i robotów, nie ukryty tekst SEO."""
    by_name = {item["name"]: item for item in projects}
    cards = []
    for name in STATIC_PROJECTS:
        item = by_name.get(name)
        if not item or not item.get("has_pages"):
            continue
        # Nazwy i opisy z GitHuba nigdy nie są wstawiane do HTML bez escapowania.
        title = html.escape(name, quote=True)
        slug = urllib.parse.quote(name, safe="")
        live = "https://rejson59.github.io/" + slug + "/"
        repo = "https://github.com/rejson59/" + slug
        description = html.escape(item.get("description") or "Projekt Rejson59 dostępny na GitHubie.", quote=True)
        created = html.escape((item.get("created_at") or "")[:10], quote=True)
        updated = html.escape(max(item.get("updated_at") or "", item.get("pushed_at") or "")[:10], quote=True)
        meta = (f'<span class="meta-item mono">Utworzono: {created}</span>' if created else "")
        meta += (f'<span class="meta-item mono">Aktualizacja: {updated}</span>' if updated else "")
        cards.append(
            f'        <article class="project-card"><div class="card-inner">'
            f'<h3 class="card-title"><a href="{live}" data-journey target="_blank" rel="noopener noreferrer">{title}</a></h3>'
            f'<p class="card-desc">{description}</p><p class="card-meta">{meta}</p>'
            f'<div class="card-actions"><a class="btn btn-ghost btn-sm" href="{repo}" target="_blank" rel="noopener noreferrer">Repozytorium GitHub ↗</a></div>'
            f'</div></article>'
        )
    if not cards:
        raise ValueError("Brak wybranych projektów z GitHub Pages; nie nadpisuję statycznej listy")
    return "\n".join(cards)


def update_static_projects(projects: list[dict]) -> None:
    text = INDEX.read_text(encoding="utf-8")
    if text.count(START) != 1 or text.count(END) != 1 or text.index(START) > text.index(END):
        raise ValueError("Brak lub niejednoznaczne znaczniki listy w index.html")
    cards = render_static_projects(projects)
    # Podmiana tylko w obszarze znaczników, bez zmian pozostałych sekcji.
    text = re.sub(re.escape(START) + r".*?" + re.escape(END),
                  lambda _: START + "\n" + cards + "\n        " + END,
                  text, count=1, flags=re.DOTALL)
    INDEX.write_text(text, encoding="utf-8")


def main() -> None:
    req = urllib.request.Request(API, headers={"User-Agent": "rejson59-site"})
    with urllib.request.urlopen(req) as resp:
        repos = json.load(resp)

    projects = [
        {
            "name": r["name"],
            "description": r.get("description"),
            "html_url": r["html_url"],
            "homepage": r.get("homepage") or None,
            "has_pages": bool(r.get("has_pages")),
            "language": r.get("language"),
            "stargazers_count": r.get("stargazers_count", 0),
            "forks_count": r.get("forks_count", 0),
            "topics": r.get("topics", []),
            "created_at": r.get("created_at"),
            "updated_at": r.get("updated_at"),
            "pushed_at": r.get("pushed_at"),
        }
        for r in repos
        if r["name"] not in EXCLUDED and not r.get("fork")
    ]

    # Upewnij się, że statyczny fallback da się przygotować, zanim zapiszemy dane.
    render_static_projects(projects)
    update_static_projects(projects)
    body = json.dumps(projects, ensure_ascii=False, indent=2)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "// Kopia zapasowa listy projektów (fallback, gdyby API GitHuba było niedostępne).\n"
        f"// Wygenerowano: {date.today().isoformat()} — odśwież: python3 scripts/fetch-repos.py\n"
        f"window.PROJECTS_GENERATED_AT = {json.dumps(date.today().isoformat())};\n"
        f"window.PROJECTS_FALLBACK = {body};\n",
        encoding="utf-8",
    )
    print(f"Zapisano {len(projects)} projektów do {OUT} i zaktualizowano statyczne linki w {INDEX}")


if __name__ == "__main__":
    main()
