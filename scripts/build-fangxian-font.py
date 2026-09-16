"""Build the user-supplied Fangxian title subset locally, preserving font metadata."""
import argparse
import hashlib
import json
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    args = parser.parse_args()
    original = args.source.read_bytes()
    font = TTFont(args.source, recalcTimestamp=False)
    characters = set(range(32, 127))
    characters.update(map(ord, '学院负责人讲话报幕主题背景'))
    catalog = json.loads((ROOT / 'docs/event-program-2026.json').read_text(encoding='utf-8'))
    for item in catalog['items']:
        characters.update(map(ord, item['titleAsProvided']))
    # Existing on-screen titles and dialog copy; participant names use Noto.
    for directory in ['frontend/src/pages/screen', 'frontend/src/components']:
        for source in (ROOT / directory).rglob('*.vue'):
            characters.update(ord(c) for c in source.read_text(encoding='utf-8') if ord(c) >= 0x3000)
    options = subset.Options()
    options.recalc_timestamp = False
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.layout_features = ['*']
    builder = subset.Subsetter(options=options)
    builder.populate(unicodes=characters)
    builder.subset(font)
    target = ROOT / 'frontend/src/assets/fonts/fangxian-title.woff2'
    font.flavor = 'woff2'
    font.save(target)
    manifest = {
        'source': args.source.name,
        'sourceBytes': len(original),
        'sourceSha256': hashlib.sha256(original).hexdigest(),
        'family': font['name'].getDebugName(1),
        'style': font['name'].getDebugName(2),
        'fsType': font['OS/2'].fsType,
        'usage': 'User-supplied font for local D-106 review; no separate web redistribution license supplied.',
        'metadataPreserved': True,
        'file': target.name, 'bytes': target.stat().st_size,
        'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        'codepoints': sorted(font.getBestCmap()),
    }
    target.with_suffix('.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in manifest.items() if k != 'codepoints'}, ensure_ascii=True))

if __name__ == '__main__':
    main()
