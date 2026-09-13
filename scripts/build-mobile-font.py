"""Rebuild the checked-in, locally served mobile UI subset; never downloads fonts.

Requires fontTools with WOFF2 support only when rebuilding the asset. Application
builds use the committed WOFF2 and do not require Python or fontTools.
"""

import argparse
import hashlib
import json
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE_COMMIT = "523d033d6cb47f4a80c58a35753646f5c3608a78"
SOURCE_URL = f"https://raw.githubusercontent.com/notofonts/noto-cjk/{SOURCE_COMMIT}/Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf"
LICENSE_URL = f"https://raw.githubusercontent.com/notofonts/noto-cjk/{SOURCE_COMMIT}/LICENSE"
SOURCE_SHA256 = "d68bafcb48a2707749396aa12bbbd833cb70401f3a9a689fd2902c7e0d295964"
LICENSE_SHA256 = "6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2"
COPY_FILES = (
    "frontend/src/pages/student/V2WelcomeExperience.vue",
    "frontend/src/pages/student/PersonalMemento.vue",
    "frontend/src/pages/student/v2-mobile-state.js",
    "frontend/src/services/api.js",
)
ASSET = ROOT / "frontend/src/assets/fonts/welcome-sans-sc-ui.woff2"
MANIFEST = ASSET.with_name("welcome-sans-sc-ui.json")
LICENSE_OUTPUT = ROOT / "frontend/public/licenses/welcome-sans-sc-OFL.txt"


def checksum(data):
    return hashlib.sha256(data).hexdigest()


def ui_characters():
    characters = {chr(value) for value in range(32, 127)}
    for filename in COPY_FILES:
        # Only fixed, public source text. Never consume a roster or runtime DB.
        characters.update(c for c in (ROOT / filename).read_text(encoding="utf-8") if c.isprintable())
    program_file = ROOT / "docs/event-program-2026.json"
    for item in json.loads(program_file.read_text(encoding="utf-8"))["items"]:
        characters.update(item["titleAsProvided"])
        characters.update(item.get("interludeLabelAsProvided", ""))
    return {ord(c) for c in characters}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Pinned upstream NotoSansSC-VF.ttf")
    parser.add_argument("--license", type=Path, help="Pinned upstream OFL license")
    parser.add_argument("--check", action="store_true", help="Verify committed asset and current fixed UI coverage")
    args = parser.parse_args()
    requested = ui_characters()

    if args.check:
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        font = TTFont(ASSET)
        missing = requested - set(font.getBestCmap())
        if missing:
            raise ValueError("UI subset needs rebuilding; missing: " + ", ".join(f"U+{c:04X}" for c in sorted(missing)))
        assert checksum(ASSET.read_bytes()) == manifest["output"]["sha256"], "Asset checksum mismatch"
        assert LICENSE_OUTPUT.is_file(), "Served OFL notice is missing"
        if args.license:
            assert LICENSE_OUTPUT.read_text(encoding="utf-8").endswith(args.license.read_text(encoding="utf-8")), "OFL notice mismatch"
        assert ASSET.stat().st_size <= 200 * 1024, "Mobile font exceeds the 200 KiB budget"
        print(json.dumps({"check": "passed", "coveredCodepoints": len(requested), "bytes": ASSET.stat().st_size}))
        return

    if not args.source or not args.license:
        parser.error("Rebuilding requires --source and --license; no network download is performed")
    source_bytes = args.source.read_bytes()
    license_bytes = args.license.read_bytes()
    if checksum(source_bytes) != SOURCE_SHA256 or checksum(license_bytes) != LICENSE_SHA256:
        raise ValueError("Unexpected font or license; use the pinned upstream source")

    font = TTFont(args.source, recalcTimestamp=False)
    missing = requested - set(font.getBestCmap())
    if missing:
        raise ValueError("Upstream font lacks UI characters: " + ", ".join(f"U+{c:04X}" for c in sorted(missing)))
    options = subset.Options()
    options.recalc_timestamp = False
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=requested)
    subsetter.subset(font)
    font = instantiateVariableFont(font, {"wght": (400, 400, 700)}, inplace=True)

    # Give the derivative an explicit name while retaining author/license metadata.
    renamed = {
        1: "Welcome Sans SC", 2: "Regular",
        3: "WelcomeSansSC:2.004:mobile-ui", 4: "Welcome Sans SC",
        6: "WelcomeSansSC-Regular", 16: "Welcome Sans SC", 17: "Regular",
    }
    for record in font["name"].names:
        if record.nameID in renamed:
            record.string = renamed[record.nameID].encode(record.getEncoding())
    for name_id, value in renamed.items():
        font["name"].setName(value, name_id, 3, 1, 0x409)
    font.flavor = "woff2"
    ASSET.parent.mkdir(parents=True, exist_ok=True)
    font.save(ASSET)
    if ASSET.stat().st_size > 200 * 1024:
        raise ValueError("Mobile subset exceeds the 200 KiB budget; review scope before shipping")
    LICENSE_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    copyright_notice = font["name"].getDebugName(0) or "Copyright 2014-2021 Adobe"
    LICENSE_OUTPUT.write_text(
        "Welcome Sans SC is a renamed UI subset of Noto Sans SC 2.004.\n"
        + copyright_notice + "\nSource: " + SOURCE_URL + "\n\n"
        + license_bytes.decode("utf-8"), encoding="utf-8",
    )
    manifest = {
        "family": "Welcome Sans SC", "upstreamFamily": "Noto Sans SC",
        "upstreamVersion": "2.004", "sourceCommit": SOURCE_COMMIT,
        "sourceUrl": SOURCE_URL, "sourceSha256": SOURCE_SHA256,
        "license": "OFL-1.1", "licenseUrl": LICENSE_URL,
        "upstreamLicenseSha256": LICENSE_SHA256,
        "weightRange": [400, 700], "copySources": list(COPY_FILES),
        "programTitleSource": "docs/event-program-2026.json",
        "codepoints": [f"U+{c:04X}" for c in sorted(requested)],
        "fallback": "System CJK fonts for characters outside the public UI subset",
        "output": {"file": ASSET.name, "bytes": ASSET.stat().st_size, "sha256": checksum(ASSET.read_bytes())},
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"codepoints": len(requested), "bytes": ASSET.stat().st_size, "weights": [400, 700]}))


if __name__ == "__main__":
    main()
