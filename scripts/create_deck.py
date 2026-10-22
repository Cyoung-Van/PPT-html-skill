#!/usr/bin/env python3
"""Create an editable local deck project; never overwrite an existing directory."""
import argparse
import json
import shutil
from pathlib import Path
from build_deck import build, STYLES

ROOT = Path(__file__).resolve().parent.parent


def create(out, style, title=None):
    out = Path(out).resolve()
    if out.exists():
        raise FileExistsError('Choose a new project directory: ' + str(out))
    config = json.loads((ROOT / 'assets' / 'templates' / (style + '.json')).read_text(encoding='utf-8'))
    if title:
        config['title'] = title
    out.mkdir(parents=True)
    (out / 'assets').mkdir()
    (out / 'scripts').mkdir()
    (out / 'assets' / 'fonts').mkdir()
    for file in {f['path'] for f in config.get('fonts', [])}:
        shutil.copy2(ROOT / file, out / file)
    shutil.copytree(ROOT / 'assets/fonts/licenses', out / 'assets/fonts/licenses')
    shutil.copy2(ROOT / 'assets/fonts/sources.json', out / 'assets/fonts/sources.json')
    for name in ('base.css', 'themes.css', 'engine.js', 'decor.json'):
        shutil.copy2(ROOT / 'assets' / name, out / 'assets' / name)
    for name in ('build_deck.py', 'browser.mjs', 'export_pdf.mjs', 'check_deck.mjs'):
        shutil.copy2(ROOT / 'scripts' / name, out / 'scripts' / name)
    (out / 'deck.json').write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')
    (out / 'assets' / 'custom.css').write_text('/* Project-specific adjustments; paths in url() are relative to the project root. */\n', encoding='utf-8')
    return build(out)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--style', choices=STYLES, default='swiss')
    parser.add_argument('--title')
    args = parser.parse_args()
    print(json.dumps(create(args.out, args.style, args.title), ensure_ascii=False))
