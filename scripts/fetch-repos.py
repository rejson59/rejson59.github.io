#!/usr/bin/env python3
"""Regeneruje js/projects-data.js — kopię zapasową listy repozytoriów.

Strona na żywo pobiera dane z API GitHuba, a ten plik służy jako fallback,
gdyby API było niedostępne (np. limit zapytań). Uruchom:

    python3 scripts/fetch-repos.py
"""

import json
import urllib.request
from datetime import date
from pathlib import Path

USER = "rejson59"
EXCLUDED = {"rejson59", "rejson59.github.io"}  # repo profilowe + samo to repo strony
API = f"https://api.github.com/users/{USER}/repos?per_page=100&sort=updated"
OUT = Path(__file__).resolve().parent.parent / "js" / "projects-data.js"


def main() -> None:
    req = urllib.request.Request(API, headers={"User-Agent": "rejson59-portfolio"})
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
        }
        for r in repos
        if r["name"] not in EXCLUDED and not r.get("fork")
    ]

    body = json.dumps(projects, ensure_ascii=False, indent=2)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "// Kopia zapasowa listy projektów (fallback, gdyby API GitHuba było niedostępne).\n"
        f"// Wygenerowano: {date.today().isoformat()} — odśwież: python3 scripts/fetch-repos.py\n"
        f"window.PROJECTS_GENERATED_AT = {json.dumps(date.today().isoformat())};\n"
        f"window.PROJECTS_FALLBACK = {body};\n",
        encoding="utf-8",
    )
    print(f"Zapisano {len(projects)} projektów do {OUT}")


if __name__ == "__main__":
    main()
