# Mobile UI font

`welcome-sans-sc-ui.woff2` is a renamed subset of **Noto Sans SC 2.004**, distributed
under the SIL Open Font License 1.1. Its CSS family is `Welcome Sans SC`; the
weight axis covers 400–700. The source is pinned to the official Noto CJK commit
`523d033d6cb47f4a80c58a35753646f5c3608a78`. The exact upstream URLs, checksums,
output checksum and included codepoints are recorded in `welcome-sans-sc-ui.json`.

The font is served from the application's own origin and is only used by the
v2 `/welcome` surface. There is no runtime font CDN, Python requirement or npm
font package. The production build copies the [copyright and OFL notice](../../../public/licenses/welcome-sans-sc-OFL.txt)
to `/licenses/welcome-sans-sc-OFL.txt`.

This subset covers fixed, public mobile UI copy and the public titles in the
current program transcription. It is not a complete Chinese character set.
Participant names, user input and future copy can contain other characters;
normal system font fallback must remain enabled. Do not feed a private roster,
database, invitation mapping or real messages into the subset generator.

To rebuild after fixed UI copy changes, download the pinned source TTF and license
from the manifest to an ignored local directory, then run:

```text
python scripts/build-mobile-font.py --source <NotoSansSC-VF.ttf> --license <OFL.txt>
python scripts/build-mobile-font.py --check
```

Only this asset maintenance step needs Python fontTools with WOFF2 support.
Ordinary application builds use the checked-in WOFF2. The rebuild validates the
upstream hashes, checks required glyphs, limits output to 200 KiB, preserves the
license and gives the derivative a separate family name. Font loading never
gates activation, controls or animation state; `font-display: swap` keeps the
system fallback usable while the asset loads or if it fails.
