#!/usr/bin/env python3
"""Offline checks for the App installation repository diagnostic."""
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parent.parent
WORKFLOW = ROOT / '.github/workflows/test-dostepu-do-projektow.yml'


class ProjectAccessTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name)
        fake = self.path / 'gh'
        fake.write_text('''#!/usr/bin/env bash
set -eu
[[ "$1" == api && "$2" == --paginate && "$3" == installation/repositories ]] || exit 88
if [[ "${FAKE_FAILURE:-0}" == 1 ]]; then exit 1; fi
printf '%s\\n' "${FAKE_REPOS:-}"
''')
        fake.chmod(0o755)
        content = WORKFLOW.read_text(encoding='utf-8')
        marker = '      - name: Sprawdź połączenie bez zmian w projekcie\n'
        self.script = textwrap.dedent(content.split(marker, 1)[1].split('        run: |\n', 1)[1])
        self.env = dict(os.environ, PATH=str(self.path) + os.pathsep + os.environ['PATH'],
                        REPO='RejStream', GITHUB_STEP_SUMMARY=str(self.path / 'summary'))

    def tearDown(self):
        self.temp.cleanup()

    def run_script(self, **values):
        return subprocess.run(['bash', '-c', self.script], env=dict(self.env, **values),
                              capture_output=True, text=True)

    def test_selected_public_repo_is_verified_through_installation_list(self):
        result = self.run_script(FAKE_REPOS='rejson59/RejStream')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Połączenie działa', (self.path / 'summary').read_text())
        self.assertNotIn('permissions.push', self.script.split('repos=$(', 1)[1])

    def test_wrong_repo_or_empty_list_fails(self):
        for repos in ('rejson59/inne', '', 'rejson59/RejStream-extra'):
            with self.subTest(repos=repos):
                result = self.run_script(FAKE_REPOS=repos)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('nie znajduje się', result.stderr)

    def test_github_api_failure_is_not_success(self):
        result = self.run_script(FAKE_FAILURE='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.path / 'summary').exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
