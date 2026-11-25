#!/usr/bin/env bash
# Instances the two OFL families at fixed weights and subsets them to the glyphs
# the panels use. Run by .github/workflows/build-fonts.yml — fonttools is not
# installed on the MacBook, by policy, so this only runs in Actions.
set -euo pipefail
cd "$(dirname "$0")/.."

PIN="${GOOGLE_FONTS_PIN:-83c62e30d87daa70216dab6b984d00d20d96d585}" # google/fonts commit
BASE="https://raw.githubusercontent.com/google/fonts/${PIN}/ofl"
# Latin, Latin-1 (· ×), dashes and quotes, bullet, rupee sign, arrows.
UNICODES="U+0020-007E,U+00A0-00FF,U+2010-2014,U+2018-201D,U+2022,U+20B9,U+2190-2193"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

fetch() { curl -fsSL "$BASE/$1" -o "$2"; }

instance() { # variable font file, weight, output stem
  fonttools varLib.instancer "$work/$1" "wght=$2" -o "$work/$3.ttf" >/dev/null
  pyftsubset "$work/$3.ttf" --unicodes="$UNICODES" --flavor=woff2 --layout-features='kern' \
    --no-hinting --output-file="assets/fonts/$3.woff2"
}

mkdir -p assets/fonts
fetch "schibstedgrotesk/SchibstedGrotesk%5Bwght%5D.ttf" "$work/SchibstedGrotesk.ttf"
fetch "splinesansmono/SplineSansMono%5Bwght%5D.ttf" "$work/SplineSansMono.ttf"
fetch "schibstedgrotesk/OFL.txt" "assets/fonts/OFL-SchibstedGrotesk.txt"
fetch "splinesansmono/OFL.txt" "assets/fonts/OFL-SplineSansMono.txt"

instance SchibstedGrotesk.ttf 400 SchibstedGrotesk-400
instance SchibstedGrotesk.ttf 700 SchibstedGrotesk-700
instance SplineSansMono.ttf 400 SplineSansMono-400
instance SplineSansMono.ttf 500 SplineSansMono-500

cat > assets/fonts/README.md <<EOF
# Panel fonts

Subsetted OFL fonts, embedded as data URIs into the SVG panels by
\`scripts/build-panels.mjs\` (GitHub shows SVGs through \`<img>\`, so external font
files would never load).

- Source: github.com/google/fonts at commit \`${PIN}\`
- Families: Schibsted Grotesk, Spline Sans Mono — both SIL Open Font License 1.1
  (licence texts alongside, unmodified apart from instancing and subsetting)
- Rebuild: Actions tab → **Build panel fonts** → Run workflow. Only needed when
  the pinned commit changes or a panel starts using new glyphs.
EOF
ls -la assets/fonts
