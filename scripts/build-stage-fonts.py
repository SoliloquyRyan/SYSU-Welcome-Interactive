"""Build local D-105 title fonts from reviewed upstream downloads; no network."""
import argparse
import hashlib
import io
import json
from pathlib import Path
from zipfile import ZipFile
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'orbitron.ttf': 'https://raw.githubusercontent.com/google/fonts/main/ofl/orbitron/Orbitron%5Bwght%5D.ttf',
    'orbitron-OFL.txt': 'https://raw.githubusercontent.com/google/fonts/main/ofl/orbitron/OFL.txt',
    'source-han-serif-SC.zip': 'https://github.com/adobe-fonts/source-han-serif/releases/download/2.003R/09_SourceHanSerifSC.zip',
    'source-han-serif-OFL.txt': 'https://raw.githubusercontent.com/adobe-fonts/source-han-serif/2.003R/LICENSE.txt',
}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    args = parser.parse_args()
    assets = ROOT / 'frontend/src/assets/fonts'
    licenses = ROOT / 'frontend/public/licenses'
    manifest = {'source': {}, 'outputs': []}
    for name, url in SOURCES.items():
        data = (args.sources / name).read_bytes()
        manifest['source'][name] = {'url': url, 'bytes': len(data), 'sha256': sha(data)}
    orbitron = TTFont(args.sources / 'orbitron.ttf', recalcTimestamp=False)
    with ZipFile(args.sources / 'source-han-serif-SC.zip') as archive:
        serif = TTFont(io.BytesIO(archive.read('OTF/SimplifiedChinese/SourceHanSerifSC-SemiBold.otf')), recalcTimestamp=False)
    characters = set(range(32, 127))
    for item in json.loads((ROOT / 'docs/event-program-2026.json').read_text(encoding='utf-8'))['items']:
        characters.update(map(ord, item['titleAsProvided']))
    options = subset.Options()
    options.recalc_timestamp = False
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.layout_features = ['*']
    sub = subset.Subsetter(options=options)
    sub.populate(unicodes=characters)
    sub.subset(serif)
    renamed = {1: 'Welcome Stage Serif', 2: 'SemiBold', 3: 'WelcomeStageSerif:2.003:D105', 4: 'Welcome Stage Serif SemiBold', 6: 'WelcomeStageSerif-SemiBold', 16: 'Welcome Stage Serif', 17: 'SemiBold'}
    for record in serif['name'].names:
        if record.nameID in renamed:
            record.string = renamed[record.nameID].encode(record.getEncoding())
    for name_id, value in renamed.items():
        serif['name'].setName(value, name_id, 3, 1, 0x409)
    cff = serif['CFF '].cff
    cff.fontNames = ['WelcomeStageSerif-SemiBold']
    cff.topDictIndex[0].FamilyName = 'Welcome Stage Serif'
    cff.topDictIndex[0].FullName = 'Welcome Stage Serif SemiBold'
    for name, font in [('orbitron.woff2', orbitron), ('welcome-stage-serif.woff2', serif)]:
        font.flavor = 'woff2'
        target = assets / name
        font.save(target)
        data = target.read_bytes()
        manifest['outputs'].append({'file': name, 'bytes': len(data), 'sha256': sha(data), 'codepoints': sorted(font.getBestCmap())})
    for source, target in [('orbitron-OFL.txt', 'orbitron-OFL.txt'), ('source-han-serif-OFL.txt', 'welcome-stage-serif-OFL.txt')]:
        notice = 'Welcome Stage Serif is a renamed title subset of Source Han Serif SC 2.003.\n' if source.startswith('source') else 'Orbitron is served locally without design changes.\n'
        (licenses / target).write_text(notice + SOURCES[source] + '\n\n' + (args.sources / source).read_text(encoding='utf-8'), encoding='utf-8')
    (assets / 'stage-fonts.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps([{'file': row['file'], 'bytes': row['bytes'], 'sha256': row['sha256']} for row in manifest['outputs']]))

if __name__ == '__main__':
    main()
