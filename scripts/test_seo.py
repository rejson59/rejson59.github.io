#!/usr/bin/env python3
"""Kontrola mapy i wygenerowanych statycznych linków bez dostępu do sieci."""
import importlib.util
import json
from pathlib import Path
import re
import unittest
import xml.etree.ElementTree as ET
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('fetch_repos', ROOT / 'scripts/fetch-repos.py')
fetch_repos = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetch_repos)


class SeoTests(unittest.TestCase):
    def test_robots_and_sitemap(self):
        robots = (ROOT / 'robots.txt').read_text(encoding='utf8')
        self.assertRegex(robots, r'(?im)^Sitemap: https://rejson59\.github\.io/sitemap\.xml\s*$')
        self.assertNotRegex(robots, r'(?im)^Disallow:\s*/\s*$')
        tree = ET.parse(ROOT / 'sitemap.xml')
        ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        locs = [el.text for el in tree.findall('s:url/s:loc', ns)]
        self.assertEqual(len(locs), len(set(locs)))
        self.assertGreaterEqual(len(locs), 10)
        self.assertIn('https://rejson59.github.io/', locs)
        for loc in locs:
            p = urlparse(loc)
            self.assertEqual((p.scheme, p.netloc, p.query, p.fragment), ('https', 'rejson59.github.io', '', ''))
            self.assertNotRegex(p.path.lower(), r'(^|/)(rejfile|admin|logowanie|spolecznosc)(/|$)')
        self.assertIsNone(tree.find('.//s:lastmod', ns), 'Nie dodawaj fikcyjnych dat')
        self.assertRegex((ROOT / 'rejfile.html').read_text(encoding='utf8'), r'name="robots" content="noindex,nofollow"')
        for file, url in [('index.html', '/'), ('rejchat.html', '/rejchat'), ('tablica-pomyslow.html', '/tablica-pomyslow'), ('uslugi.html', '/uslugi'), ('partnerstwo.html', '/partnerstwo'), ('widzety.html', '/widzety'), ('rejson-widgets/index.html', '/rejson-widgets/')]:
            text = (ROOT / file).read_text(encoding='utf8')
            full_url = 'https://rejson59.github.io' + url
            self.assertIn(full_url, locs)
            self.assertIn('rel="canonical" href="' + full_url + '"', text)
            self.assertNotRegex(text, r'(?i)name="robots" content="noindex')

    def test_generated_cards_match_data(self):
        data = (ROOT / 'js/projects-data.js').read_text(encoding='utf8')
        projects = json.loads(data.split('window.PROJECTS_FALLBACK = ', 1)[1].strip().removesuffix(';'))
        index = (ROOT / 'index.html').read_text(encoding='utf8')
        current = index.split(fetch_repos.START, 1)[1].split(fetch_repos.END, 1)[0].strip()
        self.assertEqual(current, fetch_repos.render_static_projects(projects).strip())
        for name in fetch_repos.STATIC_PROJECTS:
            self.assertIn(f'https://rejson59.github.io/{name}/', current)

    def test_generator_escapes_html_and_omits_non_pages(self):
        repos = [{'name': 'RejSearch', 'has_pages': True, 'description': '<script>alert("x")</script>', 'created_at': '2026-01-01', 'updated_at': '2026-01-02'}, {'name': 'kompi', 'has_pages': False}]
        cards = fetch_repos.render_static_projects(repos)
        self.assertIn('&lt;script&gt;', cards)
        self.assertNotIn('<script>', cards)
        self.assertNotIn('/kompi/', cards)
        with self.assertRaises(ValueError):
            fetch_repos.render_static_projects([])


if __name__ == '__main__':
    unittest.main()
