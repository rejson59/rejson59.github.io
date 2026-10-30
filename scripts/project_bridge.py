#!/usr/bin/env python3
"""Przygotuj osobne PR-y na podstawie zatwierdzonego planu. Nigdy nie scalaj.

Wyłącznie workflow uruchomiony przez właściciela z main powinien używać create.
Bez zewnętrznych pakietów; jedyne źródło autoryzacji to krótkotrwały token aplikacji.
"""
from __future__ import annotations

import base64
import hashlib
import html
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
PLAN = ROOT / "koordynator" / "plan.json"
OWNER = "rejson59"
MAX_FILES = 150
MAX_BYTES = 10 * 1024 * 1024


class BridgeError(Exception):
    pass


def text(value, name, maximum):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum or any(ord(c) < 32 and c not in "\n\t" for c in value):
        raise BridgeError(f"Nieprawidłowe pole: {name}.")
    return value.strip()


def safe_path(value, name):
    if not isinstance(value, str) or not value or len(value) > 240 or "\\" in value or "\0" in value:
        raise BridgeError(f"Nieprawidłowa ścieżka: {name}.")
    path = PurePosixPath(value)
    if path.is_absolute() or value != path.as_posix() or any(part in (".", "..", ".git") for part in path.parts):
        raise BridgeError(f"Niedozwolona ścieżka: {name}.")
    return value


def read_payload(root, plan_id, source):
    source = safe_path(source, "plik paczki")
    prefix = f"koordynator/paczki/{plan_id}/"
    if not source.startswith(prefix):
        raise BridgeError("Plik paczki musi znajdować się w katalogu bieżącego planu.")
    cursor = root
    for part in PurePosixPath(source).parts:
        cursor = cursor / part
        if cursor.is_symlink():
            raise BridgeError("Dowiązania symboliczne nie są dozwolone w paczce.")
    if not cursor.is_file() or not cursor.resolve().is_relative_to(root.resolve()):
        raise BridgeError(f"Brak pliku paczki: {source}")
    if cursor.stat().st_size > MAX_BYTES:
        raise BridgeError("Plik paczki jest za duży.")
    return cursor.read_bytes()


def load_plan(root=ROOT):
    try:
        raw = (root / "koordynator" / "plan.json").read_bytes()
        if len(raw) > 256 * 1024:
            raise BridgeError("Plan jest za duży.")
        plan = json.loads(raw)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise BridgeError("Nie można odczytać planu.") from exc
    if not isinstance(plan, dict) or plan.get("wersja") != 1:
        raise BridgeError("Nieznany format planu.")
    if plan.get("stan") == "brak":
        return None
    if plan.get("stan") != "gotowy":
        raise BridgeError("Plan nie ma stanu 'gotowy'.")
    plan_id = plan.get("id")
    if not isinstance(plan_id, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", plan_id) or len(plan_id) > 40:
        raise BridgeError("Nieprawidłowy identyfikator planu.")
    title = text(plan.get("tytul"), "tytuł", 120)
    description = text(plan.get("opis"), "opis", 4000)
    items = plan.get("projekty")
    if not isinstance(items, list) or not 1 <= len(items) <= 50:
        raise BridgeError("Plan musi zawierać od 1 do 50 projektów.")
    seen, projects, count, total = set(), [], 0, 0
    for item in items:
        if not isinstance(item, dict):
            raise BridgeError("Nieprawidłowy projekt.")
        repo = item.get("repozytorium")
        if not isinstance(repo, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}", repo) or repo.lower() in seen or repo.lower() == "rejson59.github.io":
            raise BridgeError("Nieprawidłowe lub powtórzone repozytorium.")
        seen.add(repo.lower())
        base = item.get("podstawa")
        if not isinstance(base, str) or not re.fullmatch(r"[a-f0-9]{40}", base):
            raise BridgeError(f"Nieprawidłowy commit bazowy: {repo}.")
        changes = item.get("pliki")
        if not isinstance(changes, list) or not changes:
            raise BridgeError(f"Brak plików dla {repo}.")
        paths, files = set(), []
        for entry in changes:
            if not isinstance(entry, dict):
                raise BridgeError("Nieprawidłowy plik.")
            target = safe_path(entry.get("sciezka"), "w projekcie")
            if target in paths or target.lower().startswith(".github/workflows/"):
                raise BridgeError(f"Powtórzony lub niedozwolony plik: {target}")
            paths.add(target)
            count += 1
            if entry.get("usun") is True:
                if set(entry) != {"sciezka", "usun"}:
                    raise BridgeError("Usunięcie nie może zawierać nowej treści.")
                files.append({"path": target, "data": None})
            else:
                if set(entry) != {"sciezka", "zrodlo", "sha256"}:
                    raise BridgeError("Brak pliku paczki lub sumy kontrolnej.")
                data = read_payload(root, plan_id, entry["zrodlo"])
                digest = entry["sha256"]
                if not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest) or hashlib.sha256(data).hexdigest() != digest:
                    raise BridgeError(f"Nie zgadza się suma kontrolna: {target}")
                total += len(data)
                files.append({"path": target, "data": data})
        projects.append({"repo": repo, "base": base, "files": files})
    if count > MAX_FILES or total > MAX_BYTES:
        raise BridgeError("Paczka przekracza limit rozmiaru lub liczby plików.")
    return {"id": plan_id, "title": title, "description": description, "projects": projects, "digest": hashlib.sha256(raw).hexdigest()}


def git_blob_hash(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


class GitHub:
    def __init__(self, token):
        if not token:
            raise BridgeError("Brak dostępu aplikacji do repozytoriów.")
        self.token = token

    def call(self, method, path, data=None, missing_ok=False):
        body = None if data is None else json.dumps(data).encode("utf-8")
        req = Request("https://api.github.com" + path, data=body, method=method, headers={
            "Accept": "application/vnd.github+json", "Authorization": "Bearer " + self.token,
            "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "rejson-project-bridge"})
        try:
            with urlopen(req, timeout=30) as response:
                return json.load(response)
        except HTTPError as exc:
            if exc.code == 404 and missing_ok:
                return None
            raise BridgeError(f"GitHub odrzucił operację ({exc.code}): {method} {path.split('?')[0]}") from None
        except (URLError, TimeoutError, ValueError):
            raise BridgeError(f"Nie udało się połączyć z GitHubem: {method} {path.split('?')[0]}") from None


def repo_path(repo):
    return "/repos/" + OWNER + "/" + quote(repo, safe="")


def branch_head(api, rp, branch):
    ref = api.call("GET", rp + "/git/ref/heads/" + quote(branch, safe=""))
    return ref.get("object", {}).get("sha")


def preflight(api, plan):
    """Sprawdź wszystkie projekty zanim powstanie pierwsza gałąź."""
    prepared = []
    for project in plan["projects"]:
        repo = project["repo"]
        rp = repo_path(repo)
        metadata = api.call("GET", rp)
        if metadata.get("private") is not False or metadata.get("archived") is not False or metadata.get("owner", {}).get("login", "").lower() != OWNER:
            raise BridgeError(f"{repo}: obsługiwane są tylko publiczne i niearchiwalne repozytoria właściciela.")
        if metadata.get("name") != repo:
            raise BridgeError(f"{repo}: użyj dokładnej nazwy repozytorium z GitHuba.")
        default = metadata.get("default_branch")
        if not isinstance(default, str) or not default:
            raise BridgeError(f"{repo}: brak gałęzi domyślnej.")
        if branch_head(api, rp, default) != project["base"]:
            raise BridgeError(f"{repo}: projekt zmienił się od przygotowania planu. Przygotuj nowy plan.")
        branch = "rejson-propozycja/" + plan["id"]
        existing = api.call("GET", rp + "/git/ref/heads/" + quote(branch, safe=""), missing_ok=True)
        if existing is not None:
            raise BridgeError(f"{repo}: gałąź {branch} już istnieje. Nie nadpisano jej.")
        commit = api.call("GET", rp + "/git/commits/" + project["base"])
        tree_sha = commit.get("tree", {}).get("sha")
        if not isinstance(tree_sha, str) or not re.fullmatch(r"[a-f0-9]{40}", tree_sha):
            raise BridgeError(f"{repo}: nieprawidłowe drzewo commitów.")
        tree = api.call("GET", rp + "/git/trees/" + tree_sha + "?recursive=1")
        if tree.get("truncated") or not isinstance(tree.get("tree"), list):
            raise BridgeError(f"{repo}: nie można bezpiecznie sprawdzić wszystkich plików.")
        entries = {e["path"]: e for e in tree["tree"] if isinstance(e, dict) and isinstance(e.get("path"), str)}
        changes = []
        for item in project["files"]:
            target, data = item["path"], item["data"]
            existing = entries.get(target)
            for ancestor in PurePosixPath(target).parents:
                if str(ancestor) != "." and (entry := entries.get(str(ancestor))) and entry.get("type") != "tree":
                    raise BridgeError(f"{repo}/{target}: katalog jest dowiązaniem lub plikiem.")
            if existing and (existing.get("type") != "blob" or existing.get("mode") not in ("100644", "100755")):
                raise BridgeError(f"{repo}/{target}: dozwolone są tylko zwykłe pliki.")
            if data is None and existing is None:
                raise BridgeError(f"{repo}/{target}: nie ma pliku do usunięcia.")
            if data is not None and existing and existing.get("sha") == git_blob_hash(data):
                raise BridgeError(f"{repo}/{target}: treść nie zmieniła się.")
            changes.append({"path": target, "data": data, "mode": existing["mode"] if existing else "100644"})
        prepared.append({"repo": repo, "rp": rp, "default": default, "base": project["base"], "tree": tree_sha, "branch": branch, "changes": changes})
    return prepared


def create(api, plan, report=print):
    prepared = preflight(api, plan)
    results = []
    for item in prepared:
        rp, repo = item["rp"], item["repo"]
        entries = []
        for file in item["changes"]:
            data = file["data"]
            if data is None:
                entries.append({"path": file["path"], "mode": file["mode"], "type": "blob", "sha": None})
            else:
                blob = api.call("POST", rp + "/git/blobs", {"content": base64.b64encode(data).decode("ascii"), "encoding": "base64"})
                if blob.get("sha") != git_blob_hash(data):
                    raise BridgeError(f"{repo}: GitHub zwrócił nieprawidłowy skrót pliku.")
                entries.append({"path": file["path"], "mode": file["mode"], "type": "blob", "sha": blob["sha"]})
        tree = api.call("POST", rp + "/git/trees", {"base_tree": item["tree"], "tree": entries})
        commit = api.call("POST", rp + "/git/commits", {"message": plan["title"], "tree": tree["sha"], "parents": [item["base"]],
            "author": {"name": "Rejson Project Bridge", "email": "noreply@github.com"},
            "committer": {"name": "Rejson Project Bridge", "email": "noreply@github.com"}})
        if branch_head(api, rp, item["default"]) != item["base"]:
            raise BridgeError(f"{repo}: gałąź domyślna zmieniła się podczas pracy; nie utworzono gałęzi propozycji.")
        api.call("POST", rp + "/git/refs", {"ref": "refs/heads/" + item["branch"], "sha": commit["sha"]})
        report(f"{repo}: utworzono gałąź propozycji; przygotowuję PR.")
        try:
            pull = api.call("POST", rp + "/pulls", {"title": plan["title"], "head": item["branch"], "base": item["default"],
                "body": plan["description"] + "\n\n---\nPlan: `" + plan["id"] + "` · SHA-256 planu: `" + plan["digest"] + "`\n\nPropozycja utworzona po uruchomieniu workflow przez właściciela. Nie jest scalana automatycznie."})
        except BridgeError as exc:
            raise BridgeError(f"{repo}: gałąź {item['branch']} już powstała, ale PR się nie udał: {exc}") from exc
        url = pull.get("html_url", "")
        if not isinstance(url, str) or not url.startswith("https://github.com/" + OWNER + "/" + repo + "/pull/"):
            raise BridgeError(f"{repo}: PR utworzony, ale GitHub nie podał poprawnego adresu.")
        results.append(url)
        report(f"{repo}: {url}")
    return results


def write_output(key, value):
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        delimiter = "bridge_" + os.urandom(16).hex()
        with open(output, "a", encoding="utf-8") as stream:
            stream.write(f"{key}<<{delimiter}\n{value}\n{delimiter}\n")


def summary(message):
    print(message)
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as stream:
            stream.write(message + "\n")


def main():
    try:
        if len(sys.argv) != 2 or sys.argv[1] not in ("inspect", "create"):
            raise BridgeError("Wymagane polecenie inspect albo create.")
        plan = load_plan()
        if plan is None:
            if sys.argv[1] == "create":
                raise BridgeError("Nie ma przygotowanego planu.")
            write_output("ready", "false")
            summary("## Nie ma jeszcze przygotowanych zmian\nGdy plan będzie gotowy i zatwierdzony na stronie głównej, uruchom ten workflow ponownie.")
            return 0
        write_output("ready", "true")
        write_output("repositories", "\n".join(p["repo"] for p in plan["projects"]))
        lines = ["## Plan: " + plan["id"], "**" + html.escape(plan["title"]) + "**", "", html.escape(plan["description"]), ""]
        for project in plan["projects"]:
            lines.append("### " + project["repo"] + " · podstawa `" + project["base"] + "`")
            for file in project["files"]:
                operation = "usuń" if file["data"] is None else "dodaj lub zmień"
                lines.append("- " + operation + ": <code>" + html.escape(file["path"]) + "</code>")
        lines.append("\nTa kontrola sprawdza pliki paczki, ale nie aktualny stan repozytoriów. Szczegóły treści są w planie i paczce w repozytorium.")
        summary("\n".join(lines))
        if sys.argv[1] == "create":
            urls = create(GitHub(os.environ.get("PROJECT_BRIDGE_TOKEN")), plan, report=summary)
            summary("## Gotowe — propozycje do obejrzenia\n" + "\n".join("- " + u for u in urls) + "\nŻaden projekt nie został automatycznie scalony.")
        return 0
    except (BridgeError, KeyError, TypeError) as exc:
        print("Błąd: " + str(exc), file=sys.stderr)
        summary("## Nie ukończono tworzenia propozycji\nSprawdź dziennik zadania. Utworzone wcześniej propozycje pozostają na GitHubie; nic nie jest automatycznie scalane.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
