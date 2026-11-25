# Maintaining this profile

## Upstream fix count

`README.md` leads with "N fixes landed upstream". That number is maintained by
`.github/workflows/upstream-count.yml`, which runs `scripts/upstream-count.mjs`
daily at 06:00 IST (and on demand from the Actions tab).

**Definition.** Pull requests authored by `santhiprakash` with `is:merged`, in
repositories **not** owned by `santhiprakash`, `minervainfo`, `minervainfoedtech`
or `santhiprakashb`. Own-repo and client-account merges are excluded, so the
headline counts only other people's projects.

**Source.** The GitHub search index (`/search/issues`), the same source as the
per-repo shields.io badges in `README.md`. Do not count with the
list-pull-requests REST endpoint: it ignores the `creator` filter.

**What changes when.**

| Change | Committed |
|---|---|
| A merge lands or a PR is opened | `README.md` headline + "counted" date (date = last change), `data/upstream-stats.json` |
| Only stats fields move (month rolls over) | `data/upstream-stats.json` |
| Nothing changed | nothing, unless the last commit is 45+ days old (empty keepalive commit) |

The date beside the headline is the day the number last changed, not the day of
the last check.

**"Three recent examples"** is written by hand. `data/upstream-stats.json` →
`upstream.latest` lists the three newest merges to start from.

## Changing the definition

Edit `EXCLUDED_OWNERS` in `scripts/upstream-count.mjs`, then run the workflow by
hand so the README and JSON agree with the new rule the same day.

## Data

`data/upstream-stats.json` is a snapshot of the last run: merged, submitted and
open counts upstream, merge rate, trailing-30-day merges, the last six months,
top repositories, the three latest merges, and how many upstream PR bodies state
AI assistance. Safe to read from other tools.
