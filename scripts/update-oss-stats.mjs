#!/usr/bin/env node
// Regenerates the Upstream OSS-STATS block in README.md from live GitHub
// data. Counts merged PRs authored by santhiprakash and garudaccs into
// repos not owned by any of his accounts. Run manually or via the
// update-oss-stats workflow.

import { readFileSync, writeFileSync } from "node:fs";

const AUTHORS = ["santhiprakash", "garudaccs"];
// Own / alt accounts — contributions into these orgs are not "upstream".
const EXCLUDE_OWNERS = new Set([
  "santhiprakash",
  "garudaccs",
  "santhiprakashb",
  "minervainfo",
]);
const TOKEN = process.env.GITHUB_TOKEN;
const START_MARKER = "<!-- OSS-STATS:START -->";
const END_MARKER = "<!-- OSS-STATS:END -->";

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function fetchMergedPRsForAuthor(author) {
  const items = [];
  let page = 1;
  for (;;) {
    const data = await gh(
      `/search/issues?q=${encodeURIComponent(
        `is:pr is:merged author:${author}`
      )}&per_page=100&page=${page}`
    );
    for (const item of data.items) {
      items.push({ ...item, _author: author });
    }
    if (data.items.length < 100) break;
    page += 1;
    // Search API is secondary-rate-limited; pause between pages.
    await new Promise((r) => setTimeout(r, 800));
  }
  return items;
}

function repoFullName(item) {
  return item.repository_url.replace("https://api.github.com/repos/", "");
}

function formatMergedCell(entry) {
  const garuda = entry.byAuthor.garudaccs || 0;
  if (garuda === 0) return String(entry.total);
  const via =
    garuda === entry.total
      ? `all via [@garudaccs](https://github.com/garudaccs)`
      : `${garuda} via [@garudaccs](https://github.com/garudaccs)`;
  return `${entry.total} · ${via}`;
}

async function main() {
  const prs = [];
  for (const author of AUTHORS) {
    const items = await fetchMergedPRsForAuthor(author);
    console.log(`${author}: ${items.length} merged PRs`);
    prs.push(...items);
  }

  /** @type {Map<string, { total: number, byAuthor: Record<string, number> }>} */
  const counts = new Map();
  for (const pr of prs) {
    const repo = repoFullName(pr);
    const owner = repo.split("/")[0];
    if (EXCLUDE_OWNERS.has(owner)) continue;
    if (!counts.has(repo)) {
      counts.set(repo, { total: 0, byAuthor: {} });
    }
    const entry = counts.get(repo);
    entry.total += 1;
    entry.byAuthor[pr._author] = (entry.byAuthor[pr._author] || 0) + 1;
  }

  const total = [...counts.values()].reduce((sum, e) => sum + e.total, 0);
  const projectCount = counts.size;

  const sorted = [...counts.entries()].sort((a, b) => {
    if (b[1].total !== a[1].total) return b[1].total - a[1].total;
    return a[0].localeCompare(b[0]);
  });

  const tableRows = sorted
    .map(([repo, entry]) => {
      const label = repo.split("/")[1];
      return `| [**${label}**](https://github.com/${repo}) <br/><sub>${repo}</sub> | ${formatMergedCell(entry)} |`;
    })
    .join("\n");

  const section = `${START_MARKER}
Open source contributions: ${total} PRs merged across ${projectCount} projects.

| Project | Merged |
|:--|:--:|
${tableRows}

<sub>Auto-updated daily from live GitHub data — [\`scripts/update-oss-stats.mjs\`](scripts/update-oss-stats.mjs). Counts [@santhiprakash](https://github.com/santhiprakash) + [@garudaccs](https://github.com/garudaccs); excludes repos owned by either account or [@santhiprakashb](https://github.com/santhiprakashb).</sub>
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
    console.log(
      `Updated: ${total} merged PRs across ${projectCount} projects.`
    );
  } else {
    console.log(`No changes (${total} merged PRs across ${projectCount} projects).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
