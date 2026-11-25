#!/usr/bin/env node
/**
 * Renders the chart-recorder panels for README.md as SVG files in assets/.
 *
 * Inputs: data/upstream-stats.json (daily numbers from upstream-count.mjs) and
 * data/profile.json (hand-written content: tagline, platform lanes, agents, cards).
 * One desktop and one mobile layout per panel. Fonts are the OFL subsets in
 * assets/fonts/ (built by scripts/build-fonts.sh), embedded as data URIs because
 * GitHub shows SVGs through <img> and never fetches external resources.
 *
 *   node scripts/build-panels.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'assets');
const FONTS = join(ASSETS, 'fonts');

/** Warm-white chart-recorder paper, ink text, one trace colour per lane. */
const PAL = {
  bg: '#FBFAF6',
  grid: '#ECE7DA',
  gridBold: '#DCD5C4',
  border: '#D9D2C2',
  ink: '#21201C',
  muted: '#6F6A5E',
  faint: '#8A8474',
  red: '#B5402C',
  green: '#2E6B4A',
  ochre: '#B07C1E',
  lessonBg: '#F3EFE4',
};
const TRACE = ['#B5402C', '#2E6B4A', '#35618E', '#6E3A5D', '#B07C1E', '#5C7A3A'];
const SANS = 'Schibsted Grotesk';
const MONO = 'Spline Sans Mono';
const FALLBACK = {
  sans: "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif",
  mono: "ui-monospace,'SF Mono',Menlo,Consolas,monospace",
};
const FACE_FILES = {
  sans400: [SANS, 400, 'SchibstedGrotesk-400'],
  sans700: [SANS, 700, 'SchibstedGrotesk-700'],
  mono400: [MONO, 400, 'SplineSansMono-400'],
  mono500: [MONO, 500, 'SplineSansMono-500'],
};

const stats = JSON.parse(await readFile(join(ROOT, 'data', 'upstream-stats.json'), 'utf8'));
const profile = JSON.parse(await readFile(join(ROOT, 'data', 'profile.json'), 'utf8'));

const faces = {};
const available = { sans: false, mono: false };
for (const [key, [family, weight, file]] of Object.entries(FACE_FILES)) {
  const data = await readFile(join(FONTS, `${file}.woff2`)).catch(() => null);
  if (!data) continue;
  faces[key] = { family, weight, data: data.toString('base64') };
  available[family === SANS ? 'sans' : 'mono'] = true;
}
const FAM = {
  sans: available.sans ? `'${SANS}',${FALLBACK.sans}` : FALLBACK.sans,
  mono: available.mono ? `'${MONO}',${FALLBACK.mono}` : FALLBACK.mono,
};

// ---------- primitives ----------
const esc = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const T = (x, y, str, o = {}) =>
  `<text x="${x}" y="${y}" font-family="${FAM[o.family ?? 'sans']}" font-size="${o.size ?? 14}"` +
  ` font-weight="${o.weight ?? 400}" fill="${o.fill ?? PAL.ink}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}` +
  `${o.spacing ? ` letter-spacing="${o.spacing}"` : ''}>${esc(str)}</text>`;

const lines = (x, y, arr, lh, o) => arr.map((s, i) => T(x, y + i * lh, s, o)).join('');

const hline = (x1, x2, y, stroke = PAL.ink, width = 1) =>
  `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${stroke}" stroke-width="${width}"/>`;

const vline = (x, y1, y2, stroke = PAL.gridBold) =>
  `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${stroke}"/>`;

const frame = (w, h, inner, faceKeys) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">` +
  `<style>${faceKeys
    .filter((key) => faces[key])
    .map((key) => {
      const f = faces[key];
      return `@font-face{font-family:'${f.family}';font-weight:${f.weight};src:url(data:font/woff2;base64,${f.data}) format('woff2')}`;
    })
    .join('')}</style>` +
  `<defs><pattern id="f" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M8 0H0V8" fill="none" stroke="${PAL.grid}"/></pattern>` +
  `<pattern id="b" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="${PAL.gridBold}"/></pattern></defs>` +
  `<rect width="${w}" height="${h}" rx="4" fill="${PAL.bg}"/><rect width="${w}" height="${h}" rx="4" fill="url(#f)"/>` +
  `<rect width="${w}" height="${h}" rx="4" fill="url(#b)"/>` +
  `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="4" fill="none" stroke="${PAL.border}"/>` +
  `${inner}</svg>`;

/** Greedy word wrap by character count; widths are estimated, so keep margins. */
const wrap = (text, maxChars) => {
  const out = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
};

/** Step trace across n month slots, scaled to the lane's own maximum. */
function stepTrace(vals, x0, x1, top, bottom, color, { events = null, dashed = false } = {}) {
  const n = vals.length;
  const slot = (x1 - x0) / n;
  const max = Math.max(...vals, 1);
  const lift = bottom - top - 4;
  const y = (v) => bottom - (v / max) * lift;
  let d = `M${x0},${y(vals[0]).toFixed(1)}`;
  for (let i = 0; i < n; i += 1) {
    d += `H${(x0 + (i + 1) * slot).toFixed(1)}`;
    if (i < n - 1) d += `V${y(vals[i + 1]).toFixed(1)}`;
  }
  let blips = '';
  for (const [index, count] of Object.entries(events ?? {})) {
    const i = Number(index);
    for (let j = 0; j < count; j += 1) {
      const cx = x0 + i * slot + ((j + 0.5) * slot) / count;
      const cy = bottom - (j % 2 === 0 ? 7 : 16);
      blips += `<circle cx="${cx.toFixed(1)}" cy="${cy}" r="3.2" fill="${color}"/>`;
    }
  }
  return (
    `${hline(x0, x1, bottom, PAL.gridBold)}` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"${dashed ? ' stroke-dasharray="4 3"' : ''}/>` +
    blips
  );
}

function sparkline(vals, x0, x1, top, bottom, color) {
  const max = Math.max(...vals, 1);
  const pts = vals.map((v, i) => [x0 + (i * (x1 - x0)) / (vals.length - 1), bottom - (v / max) * (bottom - top - 4)]);
  const d = `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}`;
  return (
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>` +
    pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${color}"/>`).join('')
  );
}

const MONTH_SHORT = (month) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });

const axis = (x0, x1, y, months, size) => {
  const slot = (x1 - x0) / months.length;
  return months.map((m, i) => T(x0 + i * slot + 2, y, MONTH_SHORT(m), { family: 'mono', size, fill: PAL.faint })).join('');
};

const header = (x, y, text, mobile) =>
  `<circle cx="${x + 5}" cy="${y - 4}" r="5" fill="none" stroke="${PAL.ink}" stroke-width="2"/>` +
  T(x + 20, y, text.toUpperCase(), { family: 'mono', size: mobile ? 10 : 10.5, fill: PAL.muted, spacing: 1.6 });

/** A sentence that starts with a number, the number set larger in the mono face. */
const statLine = (x, y, rest, number) =>
  `<text x="${x}" y="${y}" font-family="${FAM.sans}" font-size="15" fill="${PAL.ink}">` +
  `<tspan font-family="${FAM.mono}" font-size="18" font-weight="500">${esc(number)}</tspan>${esc(rest)}</text>`;

const fillTemplate = (text) =>
  text.replace(/\{named_tool\.(\w+)\}/g, (_, key) => String(stats.ai_disclosure.named_tool[key] ?? 0));

// ---------- panel: nameplate ----------
function nameplate(mobile) {
  const W = mobile ? 400 : 900;
  const P = mobile ? 20 : 24;
  const u = stats.upstream;
  const readouts = [
    [String(u.merged), ['FIXES', 'LANDED UPSTREAM']],
    [String(u.repos), ['PROJECTS']],
    [`${Math.round(u.merge_rate_pct)}%`, ['MERGE RATE', `${u.merged} / ${u.submitted}`]],
    [String(u.last_30_days), ['MERGED ·', 'LAST 30 DAYS']],
  ];
  const vals = u.by_month.map((m) => m.merged);
  const eventsLane = profile.platform.find((p) => Object.keys(p.events_by_month ?? {}).length);
  const legend = [
    ...u.by_language.slice(0, 3).map((l, i) => ({ label: `${l.language} merges`, color: TRACE[i] })),
    ...(eventsLane ? [{ label: `${eventsLane.name} work items`, color: eventsLane.color }] : []),
  ];
  const out = [];
  if (!mobile) {
    out.push(T(P, 56, profile.name, { size: 30, weight: 700 }));
    out.push(T(P, 77, profile.title.toUpperCase(), { family: 'mono', size: 10.5, fill: PAL.muted, spacing: 1.6 }));
    out.push(T(P, 103, profile.tagline, { size: 17 }));
    legend.forEach((l, i) => {
      const ly = 44 + i * 17;
      out.push(`<line x1="700" y1="${ly - 4}" x2="720" y2="${ly - 4}" stroke="${l.color}" stroke-width="2"/>`);
      out.push(T(728, ly, l.label, { family: 'mono', size: 12, fill: '#4A463D' }));
    });
    out.push(hline(P, W - P, 124, PAL.ink));
    const cellW = 154;
    readouts.forEach(([value, label], i) => {
      const x = P + i * cellW;
      out.push(T(x, 166, value, { family: 'mono', size: 34, weight: 500 }));
      out.push(lines(x, 186, label, 12, { family: 'mono', size: 10.5, fill: PAL.muted, spacing: 1 }));
      if (i > 0) out.push(vline(x - 12, 138, 198));
    });
    const sx0 = P + 4 * cellW + 4;
    out.push(sparkline(vals, sx0, W - P - 4, 140, 192, PAL.ink));
    out.push(T(sx0, 206, 'MERGED PER MONTH', { family: 'mono', size: 10.5, fill: PAL.muted, spacing: 1 }));
    out.push(hline(P, W - P, 218, PAL.gridBold));
    return frame(W, 240, out.join(''), ['sans400', 'sans700', 'mono400', 'mono500']);
  }

  out.push(T(P, 44, profile.name, { size: 26, weight: 700 }));
  out.push(T(P, 63, profile.title.toUpperCase(), { family: 'mono', size: 10, fill: PAL.muted, spacing: 1.4 }));
  out.push(T(P, 88, profile.tagline, { size: 16 }));
  out.push(hline(P, W - P, 102, PAL.ink));
  readouts.forEach(([value, label], i) => {
    const x = P + (i % 2) * 190;
    const y = 140 + Math.floor(i / 2) * 58;
    out.push(T(x, y, value, { family: 'mono', size: 28, weight: 500 }));
    out.push(lines(x, y + 19, label, 12, { family: 'mono', size: 10, fill: PAL.muted, spacing: 1 }));
  });
  out.push(vline(W / 2, 114, 206));
  out.push(sparkline(vals, P, W - P, 222, 266, PAL.ink));
  out.push(T(P, 282, 'MERGED PER MONTH', { family: 'mono', size: 10, fill: PAL.muted, spacing: 1 }));
  legend.forEach((l, i) => {
    const x = P + (i % 2) * 190;
    const y = 306 + Math.floor(i / 2) * 17;
    out.push(`<line x1="${x}" y1="${y - 4}" x2="${x + 18}" y2="${y - 4}" stroke="${l.color}" stroke-width="2"/>`);
    out.push(T(x + 25, y, l.label, { family: 'mono', size: 11, fill: '#4A463D' }));
  });
  return frame(W, 334, out.join(''), ['sans400', 'sans700', 'mono400', 'mono500']);
}

// ---------- panel: lanes ----------
function laneRow(mobile, W, lane, y) {
  const out = [];
  const color = lane.on ? lane.color : PAL.gridBold;
  if (!mobile) {
    const rowH = Math.max(40, lane.readings.length * 14 + 10);
    const mid = y + rowH / 2;
    out.push(`<circle cx="29" cy="${mid}" r="5" fill="${color}"/>`);
    out.push(T(44, mid + 5, lane.label, { size: 15, weight: 700 }));
    out.push(stepTrace(lane.vals, 190, 640, y + 5, y + rowH - 9, lane.color, { events: lane.events, dashed: !lane.on }));
    const n = lane.readings.length;
    out.push(lines(W - 24, mid + 4 - (n - 1) * 7, lane.readings, 14, { family: 'mono', size: 12, anchor: 'end', fill: lane.on ? PAL.ink : PAL.faint }));
    return { svg: out.join(''), height: rowH };
  }
  const n = lane.readings.length;
  const head = Math.max(20, n * 16);
  out.push(`<circle cx="25" cy="${y + 10}" r="5" fill="${color}"/>`);
  out.push(T(40, y + 15, lane.label, { size: 14, weight: 700 }));
  out.push(lines(W - 20, y + 15 - (n - 1) * 8, lane.readings, 16, { family: 'mono', size: 12, anchor: 'end', fill: lane.on ? PAL.ink : PAL.faint }));
  const top = y + head + 2;
  out.push(stepTrace(lane.vals, 20, W - 20, top, top + 26, lane.color, { events: lane.events, dashed: !lane.on }));
  return { svg: out.join(''), height: head + 34 };
}

function lanes(mobile) {
  const W = mobile ? 400 : 900;
  const P = mobile ? 20 : 24;
  const months = stats.upstream.months;
  const platform = profile.platform.map((p) => ({
    label: p.name,
    color: p.color,
    on: p.state !== 'off',
    readings: p.readings,
    vals: months.map(() => 0),
    events: Object.fromEntries(
      months.map((m, i) => [i, p.events_by_month?.[m] ?? 0]).filter(([, count]) => count > 0),
    ),
  }));
  const code = stats.upstream.by_language.map((l, i) => ({
    label: l.language,
    color: TRACE[i % TRACE.length],
    on: true,
    readings: [`${l.merged} merges`],
    vals: l.by_month,
    events: {},
  }));
  const out = [];
  let y = mobile ? 34 : 38;
  const x0 = mobile ? 20 : 190;
  const x1 = mobile ? W - 20 : 640;
  const group = (title, rows) => {
    out.push(header(P, y, title, mobile));
    y += mobile ? 18 : 14;
    for (const lane of rows) {
      const row = laneRow(mobile, W, lane, y);
      out.push(row.svg);
      y += row.height;
    }
    out.push(axis(x0, x1, y + 10, months, mobile ? 10 : 10.5));
    y += mobile ? 18 : 16;
  };
  group('Platform · six-month trace', platform);
  y += mobile ? 10 : 12;
  group('Code · upstream merges by language, per month', code);
  return frame(W, y + P, out.join(''), ['sans700', 'mono400']);
}

// ---------- panel: agents ----------
function agents(mobile) {
  const W = mobile ? 400 : 900;
  const P = mobile ? 20 : 24;
  const out = [];
  let y = mobile ? 34 : 38;
  out.push(header(P, y, 'Coding agents · operated, not just tried', mobile));
  y += mobile ? 18 : 14;
  for (const agent of profile.agents) {
    const daily = agent.role === 'daily driver';
    const reading = agent.reading.map(fillTemplate);
    if (!mobile) {
      const color = daily ? PAL.ink : PAL.ochre;
      out.push(`<circle cx="29" cy="${y + 20}" r="5" fill="${color}"/>`);
      out.push(T(44, y + 25, agent.name, { size: 15, weight: 700 }));
      out.push(stepTrace([0, 0, 0, 0, 0, 0], 190, 600, y + 5, y + 31, PAL.ink, { dashed: true }));
      const all = [agent.role.toUpperCase(), ...reading];
      const n = all.length;
      const first = y + 24 - (n - 1) * 8;
      out.push(T(W - P, first, all[0], { family: 'mono', size: 10.5, anchor: 'end', fill: PAL.muted, spacing: 1.2 }));
      out.push(lines(W - P, first + 16, all.slice(1), 16, { family: 'mono', size: 12, anchor: 'end', fill: PAL.faint }));
      y += 40;
    } else {
      out.push(`<circle cx="25" cy="${y + 10}" r="5" fill="${daily ? PAL.ink : PAL.ochre}"/>`);
      out.push(T(40, y + 15, agent.name, { size: 14, weight: 700 }));
      out.push(T(W - P, y + 15, agent.role.toUpperCase(), { family: 'mono', size: 10, anchor: 'end', fill: PAL.muted, spacing: 1.2 }));
      out.push(lines(P, y + 33, reading, 16, { family: 'mono', size: 12, fill: PAL.faint }));
      y += 30 + reading.length * 16 + 4;
    }
  }
  y += mobile ? 6 : 8;
  out.push(hline(P, W - P, y, PAL.ink));
  y += mobile ? 26 : 30;
  const number = String(stats.ai_disclosure.states_assistance);
  const sentence = `${number} of ${stats.upstream.merged} upstream merges state AI assistance in the PR body.`;
  const sentenceLines = wrap(sentence, mobile ? 44 : 120);
  out.push(statLine(P, y, sentenceLines[0].slice(number.length), number));
  out.push(lines(P, y + 20, sentenceLines.slice(1), 20, { size: 15 }));
  y += 20 * (sentenceLines.length - 1);
  return frame(W, y + P, out.join(''), ['sans400', 'sans700', 'mono400', 'mono500']);
}

// ---------- panel: cards ----------
function card(mobile, W, x, y0, c) {
  const P = mobile ? 20 : 24;
  const gap = 16;
  const cardW = mobile ? W - 2 * P : (W - 2 * P - gap) / 2;
  const inner = 16;
  const labelW = 66;
  const paraChars = Math.floor((cardW - 2 * inner - labelW - 8) / (13.5 * 0.54));
  const lessonChars = Math.floor((cardW - 24 - labelW) / (13.5 * 0.54));
  const titleChars = Math.floor((cardW - 2 * inner) / (17 * 0.52));
  const paragraphs = [
    ['SYMPTOM', PAL.red, wrap(c.symptom, paraChars)],
    ['CAUSE', PAL.red, wrap(c.cause, paraChars)],
    ['FIX', PAL.green, wrap(c.fix, paraChars)],
  ];
  const lesson = wrap(c.lesson, lessonChars);
  const out = [`<rect x="${x}" y="${y0}" width="${cardW}" height="0" fill="#fff"/>`];
  let y = y0 + inner;
  const title = wrap(c.title, titleChars);
  out.push(lines(x + inner, y + 17, title, 22, { size: 17, weight: 700 }));
  y += title.length * 22 + 2;
  for (const [label, color, textLines] of paragraphs) {
    const ly = y + 14;
    out.push(`<rect x="${x + inner}" y="${ly - 11}" width="60" height="16" fill="none" stroke="${color}" rx="2"/>`);
    out.push(T(x + inner + 6, ly, label, { family: 'mono', size: 9.5, fill: color, spacing: 1 }));
    out.push(lines(x + inner + labelW + 8, ly, textLines, 19, { size: 13.5 }));
    y = ly + (textLines.length - 1) * 19 + 13;
  }
  y += 6;
  const ly = y + 16;
  const boxH = lesson.length * 19 + 14;
  out.push(`<rect x="${x + 12}" y="${ly - 15}" width="${cardW - 24}" height="${boxH}" fill="${PAL.lessonBg}"/>`);
  out.push(`<rect x="${x + 12}" y="${ly - 15}" width="3" height="${boxH}" fill="${PAL.ochre}"/>`);
  out.push(T(x + 24, ly, 'LESSON', { family: 'mono', size: 9.5, fill: PAL.ochre, spacing: 1.2 }));
  out.push(lines(x + 24 + labelW, ly, lesson, 19, { size: 13.5 }));
  y = ly + (lesson.length - 1) * 19 + 15 + inner;
  const height = y - y0;
  out[0] = `<rect x="${x}" y="${y0}" width="${cardW}" height="${height}" fill="#fff" stroke="${PAL.ink}" rx="3"/>`;
  return { svg: out.join(''), height };
}

function cards(mobile) {
  const W = mobile ? 400 : 900;
  const P = mobile ? 20 : 24;
  const faceKeys = ['sans400', 'sans700', 'mono400', 'mono500'];
  if (mobile) {
    const out = [];
    let y = P;
    for (const c of profile.cards) {
      const r = card(true, W, P, y, c);
      out.push(r.svg);
      y += r.height + 14;
    }
    return frame(W, y - 14 + P, out.join(''), faceKeys);
  }
  const cardW = (W - 2 * P - 16) / 2;
  const rendered = profile.cards.map((c, i) => card(false, W, P + i * (cardW + 16), P, c));
  const height = Math.max(...rendered.map((r) => r.height));
  return frame(W, height + 2 * P, rendered.map((r) => r.svg).join(''), faceKeys);
}

// ---------- main ----------
console.log(`fonts: sans=${available.sans} mono=${available.mono}`);
for (const [name, build] of Object.entries({ nameplate, lanes, agents, cards })) {
  for (const mobile of [false, true]) {
    const file = join(ASSETS, `panel-${name}${mobile ? '-m' : ''}.svg`);
    const svg = build(mobile);
    const previous = await readFile(file, 'utf8').catch(() => '');
    if (svg !== previous) await writeFile(file, svg);
    console.log(`${basename(file)}: ${(svg.length / 1024).toFixed(1)} KB${svg === previous ? '' : ' (changed)'}`);
  }
}
