# Panel fonts

Subsetted OFL fonts, embedded as data URIs into the SVG panels by
`scripts/build-panels.mjs` (GitHub shows SVGs through `<img>`, so external font
files would never load).

- Source: github.com/google/fonts at commit `83c62e30d87daa70216dab6b984d00d20d96d585`
- Families: Schibsted Grotesk, Spline Sans Mono — both SIL Open Font License 1.1
  (licence texts alongside, unmodified apart from instancing and subsetting)
- Rebuild: Actions tab → **Build panel fonts** → Run workflow. Only needed when
  the pinned commit changes or a panel starts using new glyphs.
