#!/usr/bin/env node
// Regenerates the "Open Source Contributions" section of README.md from
// live GitHub data: merged-PR counts, project count, a recent-activity
// highlight, and a top-3-by-stars table. Run manually or via the
// update-oss-stats workflow.

import { readFileSync, writeFileSync } from "node:fs";

const GITHUB_USER = "santhiprakash";
// Own repos and client work aren't "open-source contributions" — exclude.
const EXCLUDE_OWNERS = new Set(["santhiprakash", "minervainfo"]);
const TOKEN = process.env.GITHUB_TOKEN;
const START_MARKER = "<!-- OSS-STATS:START -->";
const END_MARKER = "<!-- OSS-STATS:END -->";

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function fetchAllMergedPRs() {
  const items = [];
  let page = 1;
  for (;;) {
    const data = await gh(
      `/search/issues?q=${encodeURIComponent(
        `is:pr is:merged author:${GITHUB_USER}`
      )}&per_page=100&page=${page}`
    );
    items.push(...data.items);
    if (data.items.length < 100) break;
    page += 1;
  }
  return items;
}

function repoFullName(item) {
  return item.repository_url.replace("https://api.github.com/repos/", "");
}

async function main() {
  const prs = await fetchAllMergedPRs();

  const counts = new Map();
  for (const pr of prs) {
    const repo = repoFullName(pr);
    const owner = repo.split("/")[0];
    if (EXCLUDE_OWNERS.has(owner)) continue;
    counts.set(repo, (counts.get(repo) || 0) + 1);
  }

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const projectCount = counts.size;

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentCount = prs.filter((pr) => {
    const repo = repoFullName(pr);
    if (EXCLUDE_OWNERS.has(repo.split("/")[0])) return false;
    return new Date(pr.pull_request.merged_at).getTime() >= sevenDaysAgo;
  }).length;

  // Pull stars + description for every repo we contributed to, then pick
  // the top 3 by stars — but only among repos with a sustained contribution
  // history (3+ merged PRs), so a single drive-by typo fix on a huge repo
  // can't outrank real, repeated work on a smaller one.
  const MIN_MERGED_FOR_RANKING = 3;
  const repoMeta = await Promise.all(
    [...counts.keys()].map(async (repo) => {
      const data = await gh(`/repos/${repo}`);
      return {
        repo,
        merged: counts.get(repo),
        stars: data.stargazers_count,
        description: (data.description || "").replace(/\s+/g, " ").trim(),
      };
    })
  );
  const top3 = repoMeta
    .filter((r) => r.merged >= MIN_MERGED_FOR_RANKING)
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 3);

  const tableRows = top3
    .map(
      ({ repo, merged, description }) =>
        `| **[${repo}](https://github.com/${repo})** | 🟢 **${merged}** | ![Stars](https://img.shields.io/github/stars/${repo}?style=flat-square&label=&color=2E8B57) | ${description} |`
    )
    .join("\n");

  const highlight =
    recentCount > 0
      ? ` — 🔥 **${recentCount}** merged in the last 7 days`
      : "";

  const section = `${START_MARKER}
### Open Source Contributions

**${total}** merged PRs across **${projectCount}** public open-source projects${highlight}.

<div align="center">

| Project | Merged PRs | Stars | What it is |
|:---|:---:|:---:|:---|
${tableRows}

</div>

<sub>Auto-updated daily from live GitHub data — see [\`scripts/update-oss-stats.mjs\`](scripts/update-oss-stats.mjs).</sub>
${END_MARKER}`;

  const readmePath = new URL("../README.md", import.meta.url);
  const readme = readFileSync(readmePath, "utf8");
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error("OSS-STATS markers not found in README.md");
  }
  const updated =
    readme.slice(0, startIdx) + section + readme.slice(endIdx + END_MARKER.length);

  if (updated !== readme) {
    writeFileSync(readmePath, updated);
    console.log(`Updated: ${total} merged PRs across ${projectCount} projects (+${recentCount} in last 7 days).`);
  } else {
    console.log("No changes.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
