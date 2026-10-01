# Progress

## 2026-10-01 — Restore daily OSS stats

- Restored `.github/workflows/update-oss-stats.yml` and `scripts/update-oss-stats.mjs` (removed in 48166da).
- Script now queries `santhiprakash` + `garudaccs`, excludes own-account repos (`santhiprakash`, `garudaccs`, `santhiprakashb`, `minervainfo`), writes a full per-repo table sorted by merged count, and drops Opened badges.
- README Upstream section uses generated markers; footer no longer claims pins are upstream work.
- Decision: keep hand-written "What I work on there" out of the generated table — it goes stale; repo full name + merged count is the durable signal.
