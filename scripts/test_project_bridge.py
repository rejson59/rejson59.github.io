#!/usr/bin/env python3
"""Testy koordynatora bez sieci i bez tworzenia repozytoriów lub gałęzi."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import project_bridge as bridge


class FakeGitHub:
    def __init__(self):
        self.calls = []
        self.refs = {"RejStream": "a" * 40, "mconline": "b" * 40}
        self.private = set()
        self.existing_branches = set()
        self.truncated = set()
        self.trees = {
            "RejStream": [{"path": "index.html", "type": "blob", "mode": "100644", "sha": "3" * 40},
                          {"path": "run.sh", "type": "blob", "mode": "100755", "sha": "4" * 40}],
            "mconline": [{"path": "src", "type": "tree", "mode": "040000", "sha": "5" * 40}],
        }
        self.commits = 0

    def call(self, method, path, data=None, missing_ok=False):
        self.calls.append((method, path, data))
        repo = path.split("/")[3]
        if method == "GET" and path == bridge.repo_path(repo):
            return {"name": repo, "private": repo in self.private, "archived": False, "owner": {"login": "rejson59"}, "default_branch": "main"}
        if method == "GET" and "/git/ref/heads/" in path:
            if path.endswith("/main"):
                return {"object": {"sha": self.refs[repo]}}
            return {"object": {"sha": "c" * 40}} if repo in self.existing_branches else None
        if method == "GET" and "/git/commits/" in path:
            return {"tree": {"sha": "d" * 40}}
        if method == "GET" and "/git/trees/" in path:
            return {"truncated": repo in self.truncated, "tree": self.trees[repo]}
        if method == "POST" and path.endswith("/git/blobs"):
            import base64
            return {"sha": bridge.git_blob_hash(base64.b64decode(data["content"]))}
        if method == "POST" and path.endswith("/git/trees"):
            return {"sha": "e" * 40}
        if method == "POST" and path.endswith("/git/commits"):
            self.commits += 1
            return {"sha": "f" * 40}
        if method == "POST" and path.endswith("/git/refs"):
            return {"ref": data["ref"]}
        if method == "POST" and path.endswith("/pulls"):
            return {"html_url": f"https://github.com/rejson59/{repo}/pull/12"}
        raise AssertionError((method, path))


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        path = self.root / "koordynator" / "paczki" / "konto-test" / "RejStream"
        path.mkdir(parents=True)
        self.payload = path / "index.html"
        self.payload.write_text("nowa treść\n", encoding="utf-8")
        self.plan = {
            "wersja": 1, "stan": "gotowy", "id": "konto-test", "tytul": "Przykład", "opis": "Opis",
            "projekty": [{"repozytorium": "RejStream", "podstawa": "a" * 40, "pliki": [
                {"sciezka": "index.html", "zrodlo": "koordynator/paczki/konto-test/RejStream/index.html", "sha256": hashlib.sha256(self.payload.read_bytes()).hexdigest()},
                {"sciezka": "run.sh", "usun": True}]},
                {"repozytorium": "mconline", "podstawa": "b" * 40, "pliki": [
                    {"sciezka": "src/nowy.txt", "zrodlo": "koordynator/paczki/konto-test/RejStream/index.html", "sha256": hashlib.sha256(self.payload.read_bytes()).hexdigest()}]}]
        }
        self.write_plan()

    def tearDown(self):
        self.temp.cleanup()

    def write_plan(self):
        (self.root / "koordynator" / "plan.json").write_text(json.dumps(self.plan), encoding="utf-8")

    def load(self):
        return bridge.load_plan(self.root)

    def test_empty_plan_requires_no_credentials(self):
        self.plan = {"wersja": 1, "stan": "brak"}
        self.write_plan()
        self.assertIsNone(self.load())

    def test_all_repos_are_checked_before_any_write_then_only_prs(self):
        api = FakeGitHub()
        result = bridge.create(api, self.load(), report=lambda x: None)
        self.assertEqual(result, ["https://github.com/rejson59/RejStream/pull/12", "https://github.com/rejson59/mconline/pull/12"])
        first_write = next(i for i, c in enumerate(api.calls) if c[0] == "POST")
        for repo in ("RejStream", "mconline"):
            self.assertTrue(any(c[1] == bridge.repo_path(repo) for c in api.calls[:first_write]))
        refs = [c for c in api.calls if c[1].endswith("/git/refs")]
        self.assertTrue(all(c[2]["ref"] == "refs/heads/rejson-propozycja/konto-test" for c in refs))
        self.assertTrue(all(c[2]["base"] == "main" for c in api.calls if c[1].endswith("/pulls")))
        self.assertFalse(any("merge" in c[1] for c in api.calls))
        deletion = [c for c in api.calls if c[1].endswith("/git/trees")][0][2]["tree"][-1]
        self.assertEqual(deletion, {"path": "run.sh", "mode": "100755", "type": "blob", "sha": None})

    def test_stale_other_repo_stops_before_any_write(self):
        api = FakeGitHub(); api.refs["mconline"] = "0" * 40
        with self.assertRaisesRegex(bridge.BridgeError, "zmienił się"):
            bridge.create(api, self.load(), report=lambda x: None)
        self.assertFalse(any(c[0] == "POST" for c in api.calls))

    def test_private_existing_branch_and_truncated_tree_are_rejected(self):
        for field in ("private", "existing_branches", "truncated"):
            api = FakeGitHub(); getattr(api, field).add("mconline")
            with self.assertRaises(bridge.BridgeError):
                bridge.create(api, self.load(), report=lambda x: None)
            self.assertFalse(any(c[0] == "POST" for c in api.calls))

    def test_payload_hash_path_and_workflow_changes_rejected(self):
        self.payload.write_text("inne dane")
        with self.assertRaisesRegex(bridge.BridgeError, "suma kontrolna"):
            self.load()
        self.payload.write_text("nowa treść\n", encoding="utf-8")
        self.plan["projekty"][0]["pliki"][0]["sciezka"] = "../outside"
        self.write_plan()
        with self.assertRaises(bridge.BridgeError): self.load()
        self.plan["projekty"][0]["pliki"][0]["sciezka"] = ".github/workflows/test.yml"
        self.write_plan()
        with self.assertRaises(bridge.BridgeError): self.load()

    def test_symlink_and_nonregular_remote_file_are_rejected(self):
        self.payload.unlink(); self.payload.symlink_to('/etc/passwd')
        with self.assertRaisesRegex(bridge.BridgeError, "Dowiązania"): self.load()
        self.payload.unlink(); self.payload.write_text("nowa treść\n", encoding="utf-8")
        api = FakeGitHub(); api.trees["RejStream"][0]["mode"] = "120000"
        with self.assertRaisesRegex(bridge.BridgeError, "zwykłe pliki"):
            bridge.create(api, self.load(), report=lambda x: None)
        self.assertFalse(any(c[0] == "POST" for c in api.calls))

    def test_failure_after_one_pr_reports_partial_result_and_leaves_no_merge(self):
        class PartialFailure(FakeGitHub):
            def call(self, method, path, data=None, missing_ok=False):
                if method == "POST" and path.endswith("/pulls") and "/mconline/" in path:
                    raise bridge.BridgeError("przykładowy błąd GitHuba")
                return super().call(method, path, data, missing_ok)
        api = PartialFailure(); messages = []
        with self.assertRaisesRegex(bridge.BridgeError, "gałąź .* już powstała"):
            bridge.create(api, self.load(), report=messages.append)
        self.assertTrue(any("RejStream/pull/12" in m for m in messages))
        self.assertEqual(sum(c[1].endswith("/git/refs") for c in api.calls), 2)
        self.assertFalse(any("merge" in c[1] for c in api.calls))

    def test_refuse_no_op_and_ancestor_symlink(self):
        api = FakeGitHub()
        api.trees["RejStream"][0]["sha"] = bridge.git_blob_hash(self.payload.read_bytes())
        with self.assertRaisesRegex(bridge.BridgeError, "nie zmieniła"):
            bridge.create(api, self.load(), report=lambda x: None)
        self.assertFalse(any(c[0] == "POST" for c in api.calls))
        api = FakeGitHub()
        api.trees["mconline"][0].update({"type": "blob", "mode": "120000"})
        with self.assertRaisesRegex(bridge.BridgeError, "dowiązaniem"):
            bridge.create(api, self.load(), report=lambda x: None)
        self.assertFalse(any(c[0] == "POST" for c in api.calls))

    def test_changed_base_during_creation_aborts_before_branch(self):
        api = FakeGitHub()
        calls = 0
        original = bridge.branch_head
        def changing(api_arg, rp, branch):
            nonlocal calls
            calls += 1
            if calls == 3: return "0" * 40
            return original(api_arg, rp, branch)
        with patch.object(bridge, "branch_head", changing):
            with self.assertRaisesRegex(bridge.BridgeError, "zmieniła się"):
                bridge.create(api, self.load(), report=lambda x: None)
        self.assertFalse(any(c[1].endswith("/git/refs") for c in api.calls))


if __name__ == "__main__":
    unittest.main(verbosity=2)
