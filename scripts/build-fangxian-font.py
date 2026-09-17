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
    characters.update(map(ord, (ROOT / 'backend/migrations/0020_awards_and_stage.sql').read_text(encoding='utf-8')))
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
    def unicode_ranges(points):
        spans = []
        for n in sorted(points):
            if spans and spans[-1][1] + 1 == n: spans[-1][1] = n
            else: spans.append([n, n])
        return ','.join(f'U+{a:X}' if a == b else f'U+{a:X}-{b:X}' for a,b in spans)
    all_points = set(TTFont(args.source).getBestCmap())
    core_points = set(font.getBestCmap())
    remaining = sorted(all_points - core_points)
    records = []
    faces = ['/* D-109 Fangxian core plus disjoint local ranges. */']
    def record(file, points):
        records.append({'file': file.name, 'bytes': file.stat().st_size, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(), 'unicodeRange': unicode_ranges(points)})
        faces.append("@font-face{font-family:'Fangxian';src:url('../assets/fonts/" + file.name + "') format('woff2');font-style:normal;font-weight:300;font-display:swap;unicode-range:" + unicode_ranges(points) + ";}")
    record(target, core_points)
    for index in range(0, len(remaining), 384):
        part = TTFont(args.source, recalcTimestamp=False)
        builder = subset.Subsetter(options=options)
        builder.populate(unicodes=remaining[index:index+384]); builder.subset(part)
        part.flavor = 'woff2'
        output = target.parent / f'fangxian-{index//384:03}.woff2'
        part.save(output); record(output,set(part.getBestCmap()))
    (ROOT / 'frontend/src/styles/fangxian-ranges.css').write_text('\n'.join(faces)+'\n',encoding='utf8')
    manifest = {
        'source': args.source.name,
        'sourceBytes': len(original),
        'sourceSha256': hashlib.sha256(original).hexdigest(),
        'family': font['name'].getDebugName(1),
        'style': font['name'].getDebugName(2),
        'fsType': font['OS/2'].fsType,
        'usage': 'User-supplied font; D-109 title ranges. Source metadata retained.',
        'metadataPreserved': True,
        'file': target.name, 'bytes': target.stat().st_size,
        'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        'codepoints': sorted(font.getBestCmap()),
        'coveredCodepoints': len(all_points), 'ranges': records, 'totalBytes': sum(item['bytes'] for item in records),
    }
    target.with_suffix('.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in manifest.items() if k != 'codepoints'}, ensure_ascii=True))

if __name__ == '__main__':
    main()
