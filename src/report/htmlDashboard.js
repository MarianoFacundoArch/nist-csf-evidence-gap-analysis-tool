/**
 * Renders the self-contained HTML dashboard (reports/dashboard.html) — the
 * deliverable you open with a double click and hand to a non-technical
 * stakeholder. One file, zero network: styles, script, and the assessment data
 * (embedded as JSON) all live inline, so it works offline and never leaks the
 * assessment to a CDN or font host.
 *
 * Rendering happens client-side from the embedded JSON with DOM APIs using
 * textContent only — evidence quotes and reviewer notes are untrusted document
 * text and must never be concatenated into HTML. The embedded script is plain
 * ES5-ish JavaScript (no template literals) so this module's own template
 * literal never needs escaping.
 *
 * Chart design follows the dataviz method: coverage tiers are an ORDERED scale,
 * so the stacked bars use a single-hue ordinal blue ramp (validated for light
 * and dark surfaces, CVD-safe by construction); the target chart is a single
 * series (no legend, direct labels); every chart has a table-view twin and a
 * hover/focus tooltip, so no value is gated behind color or pointer.
 */

import { orderFunctions } from '../csf/order.js';
import { planOrder } from '../target/targetProfile.js';

export function renderDashboardHtml(profile, targetView = null) {
  const payload = {
    profile,
    target: targetView,
    planOrder: targetView
      ? planOrder(targetView.entries.filter((e) => !e.not_applicable && !e.met)).map((e) => e.subcategory_id)
      : [],
    functionOrder: orderFunctions(profile.subcategories),
  };
  // <-escape so document text can never close the script element.
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NIST CSF 2.0 — Assessment Dashboard</title>
<style>${CSS}</style>
</head>
<body>
<script id="csf-data" type="application/json">${json}</script>
<noscript><p style="padding:24px">This dashboard needs JavaScript. The same data is in
<code>current-profile.json</code>, <code>gap-analysis.md</code>, and <code>evidence-map.csv</code>
next to this file.</p></noscript>
<div id="app"></div>
<script>${APP_JS}</script>
</body>
</html>
`;
}

/* ---------------------------------- CSS ----------------------------------- */
// Palette roles per the validated reference palette (dataviz skill): ordinal
// blue ramp for the ordered coverage tiers, slot-1 blue for the single-series
// target chart, fixed status steps (always icon + label, never color alone).

const CSS = `
:root{
  --page:#f9f9f7; --surface:#fcfcfb; --ink:#0b0b0b; --ink2:#52514e; --muted:#898781;
  --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10);
  --cov-none:#86b6ef; --cov-partial:#3987e5; --cov-substantial:#1c5cab; --cov-full:#0d366b;
  --accent:#246bc1; --accent-ink:#fff;
  --good:#0ca30c; --warning:#fab219; --serious:#ec835a; --critical:#d03b3b;
}
@media (prefers-color-scheme: dark){ :root{
  --page:#0d0d0d; --surface:#1a1a19; --ink:#ffffff; --ink2:#c3c2b7; --muted:#898781;
  --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10);
  --cov-none:#184f95; --cov-partial:#2a78d6; --cov-substantial:#6da7ec; --cov-full:#b7d3f6;
  --accent:#3987e5; --accent-ink:#0b0b0b;
}}
:root[data-theme=light]{
  --page:#f9f9f7; --surface:#fcfcfb; --ink:#0b0b0b; --ink2:#52514e; --muted:#898781;
  --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10);
  --cov-none:#86b6ef; --cov-partial:#3987e5; --cov-substantial:#1c5cab; --cov-full:#0d366b;
  --accent:#246bc1; --accent-ink:#fff;
}
:root[data-theme=dark]{
  --page:#0d0d0d; --surface:#1a1a19; --ink:#ffffff; --ink2:#c3c2b7; --muted:#898781;
  --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10);
  --cov-none:#184f95; --cov-partial:#2a78d6; --cov-substantial:#6da7ec; --cov-full:#b7d3f6;
  --accent:#3987e5; --accent-ink:#0b0b0b;
}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);
  font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;}
.wrap{max-width:1100px;margin:0 auto;padding:24px 20px 48px}
a{color:var(--accent)}
header.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:8px}
h1{font-size:20px;font-weight:650;margin:0}
.sub{color:var(--ink2);font-size:13px;margin:4px 0 0}
.sub .sep{color:var(--muted);margin:0 6px}
button.ghost{background:none;border:1px solid var(--border);border-radius:8px;color:var(--ink2);
  font:inherit;font-size:12.5px;padding:5px 10px;cursor:pointer}
button.ghost:hover{color:var(--ink)}
button.ghost[aria-pressed=true]{color:var(--ink);border-color:var(--axis)}
.banner{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--border);
  border-left:3px solid var(--warning);border-radius:8px;background:var(--surface);
  padding:10px 14px;margin:14px 0 0;font-size:13px;color:var(--ink2)}
.banner .ic{flex:none;font-size:14px}
.banner strong{color:var(--ink)}
.activity-card{padding:14px 16px;margin:14px 0 0}
.activity-card .head{margin-bottom:10px}
.activity-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
.activity-item{min-width:0;background:var(--page);border:1px solid var(--border);
  border-radius:8px;padding:9px 10px}
.activity-top{display:flex;align-items:center;gap:6px;color:var(--ink2);font-size:12px}
.activity-mark{font-weight:700;line-height:1}
.activity-item.ok .activity-mark{color:var(--good)}
.activity-item.attention .activity-mark{color:var(--serious)}
.activity-item.optional .activity-mark{color:var(--muted)}
.activity-when{display:block;color:var(--ink);font-size:12.5px;font-weight:600;margin-top:3px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.activity-meta{color:var(--ink2);font-size:11.5px;margin-top:1px;min-height:17px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:18px 0}
.tile{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px}
.tile .lbl{font-size:12.5px;color:var(--ink2)}
.tile .val{font-size:30px;font-weight:600;margin:2px 0 0}
.tile .ctx{font-size:12px;color:var(--ink2);margin-top:2px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:10px;
  padding:18px 20px;margin:0 0 16px;position:relative}
.card h2{font-size:15px;font-weight:650;margin:0}
.card .desc{font-size:12.5px;color:var(--ink2);margin:2px 0 0}
.card .head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}
.legend{display:flex;flex-wrap:wrap;gap:14px;margin:2px 0 10px;font-size:12px;color:var(--ink2)}
.legend .it{display:inline-flex;align-items:center;gap:6px}
.legend .sw{width:12px;height:12px;border-radius:3px;flex:none}
svg.chart{width:100%;height:auto;display:block}
svg.chart text{font:11.5px system-ui,-apple-system,"Segoe UI",sans-serif}
svg .row-hit{opacity:0;cursor:default;outline:none}
svg .row-hit:focus-visible{opacity:1;fill:none;stroke:var(--accent);stroke-width:1.5}
svg g.brow.hot rect.seg,svg g.brow.hot path.seg{filter:brightness(1.08)}
.tt{position:absolute;z-index:5;pointer-events:none;background:var(--surface);border:1px solid var(--axis);
  border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.14);padding:8px 11px;font-size:12px;
  min-width:150px;display:none}
.tt .t{font-weight:600;margin-bottom:4px}
.tt .r{display:flex;align-items:center;gap:7px;margin:2px 0;color:var(--ink2)}
.tt .k{width:12px;height:3px;border-radius:2px;flex:none}
.tt .v{font-weight:600;color:var(--ink);margin-left:auto;font-variant-numeric:tabular-nums}
table.tbl{width:100%;border-collapse:collapse;font-size:13px}
table.tbl th{color:var(--ink2);font-weight:600;text-align:left;padding:7px 10px;border-bottom:1px solid var(--axis)}
table.tbl td{padding:7px 10px;border-bottom:1px solid var(--grid);vertical-align:top}
table.tbl td.n,table.tbl th.n{text-align:right;font-variant-numeric:tabular-nums}
.chip{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.chip .dot{width:9px;height:9px;border-radius:3px;flex:none}
.badge{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;font-size:12px;color:var(--ink2)}
.badge .st{width:8px;height:8px;border-radius:50%;flex:none}
.override-tag{display:inline-block;margin-left:6px;border:1px solid var(--border);border-radius:999px;
  color:var(--ink2);font-size:10.5px;line-height:1.4;padding:1px 5px;vertical-align:1px}
.quick-filters{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin:0 0 9px}
.quick-filters .qlbl{color:var(--ink2);font-size:12px;margin-right:1px}
button.filter-chip{background:var(--page);border:1px solid var(--border);border-radius:999px;
  color:var(--ink2);cursor:pointer;font:inherit;font-size:12px;padding:4px 9px}
button.filter-chip:hover{color:var(--ink);border-color:var(--axis)}
button.filter-chip[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.filters{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
.filters input[type=search],.filters select{background:var(--page);border:1px solid var(--border);
  border-radius:8px;color:var(--ink);font:inherit;font-size:12.5px;padding:6px 9px}
.filters input[type=search]{flex:1 1 200px;min-width:160px}
.filters .count{align-self:center;font-size:12px;color:var(--ink2);margin-left:auto}
tr.mrow{cursor:pointer}
tr.mrow:hover td{background:color-mix(in srgb,var(--accent) 5%,transparent)}
tr.mrow td .chev{display:inline-block;transition:transform .12s;color:var(--muted)}
tr.mrow[aria-expanded=true] td .chev{transform:rotate(90deg)}
tr.drow>td{background:var(--page);padding:14px 16px}
.det .out{font-weight:600;margin:0 0 6px}
.det .rat{color:var(--ink2);margin:0 0 10px}
.det h4{font-size:12px;font-weight:650;color:var(--ink2);text-transform:uppercase;
  letter-spacing:.04em;margin:12px 0 6px}
.det .q{border-left:2px solid var(--axis);padding:4px 12px;margin:6px 0;color:var(--ink2)}
.det .q .src{font-size:12px;color:var(--muted);display:block;margin-bottom:2px}
.det ol{margin:4px 0 4px 20px;padding:0;color:var(--ink2)}
.det ol li{margin:4px 0}
ol.plan{margin:6px 0 2px 22px;padding:0}
ol.plan li{margin:7px 0}
ol.plan .meta{color:var(--ink2)}
ol.plan .o{color:var(--muted);font-size:12.5px;display:block}
footer.foot{color:var(--muted);font-size:12px;margin-top:26px;line-height:1.6}
@media (max-width:800px){ .activity-grid{grid-template-columns:repeat(2,minmax(0,1fr))} }
@media (max-width:640px){ .tiles{grid-template-columns:repeat(2,1fr)} }
@media print{
  :root,:root[data-theme=light],:root[data-theme=dark]{
    --page:#fff;--surface:#fff;--ink:#0b0b0b;--ink2:#52514e;--muted:#52514e;
    --grid:#e1e0d9;--axis:#c3c2b7;--border:rgba(11,11,11,.16);
  }
  .filters,.quick-filters,button.ghost{display:none}
  body{background:#fff}.card{break-inside:avoid}
}
`;

/* -------------------------- client-side application ------------------------ */
// Deliberately no template literals below (this file wraps it in one), and all
// data-derived strings go through textContent — never innerHTML.

const APP_JS = `
(function(){
'use strict';
var DATA = JSON.parse(document.getElementById('csf-data').textContent);
var P = DATA.profile, T = DATA.target;
var LEVELS = ['none','partial','substantial','full'];
var LEVEL_VAR = {none:'--cov-none',partial:'--cov-partial',substantial:'--cov-substantial',full:'--cov-full'};
var app = document.getElementById('app');

/* theme toggle (system default; explicit choice persisted when possible) */
try {
  var saved = localStorage.getItem('csf-dashboard-theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
} catch (e) {}

function el(tag, cls, text){
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function svgEl(tag, attrs){
  var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (var k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}
function cssVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function pct(part, whole){ return whole ? Math.round(part / whole * 100) : 0; }
function cap(s){ return s.charAt(0).toUpperCase() + s.slice(1); }
function timeNode(iso, fallback){
  if (!iso) return el('span', null, fallback || 'Not recorded');
  var d = new Date(iso);
  if (isNaN(d.getTime())) return el('span', null, String(iso));
  var label;
  try {
    label = d.toLocaleString(undefined, {
      year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'
    });
  } catch (e) {
    label = d.toLocaleString();
  }
  var n = el('time', null, label);
  n.setAttribute('datetime', iso);
  n.setAttribute('title', iso);
  n.setAttribute('aria-label', label + '; ISO timestamp ' + iso);
  return n;
}

/* ------------------------------- header ---------------------------------- */
var wrap = el('div','wrap');
app.appendChild(wrap);

var top = el('header','top');
var hbox = el('div');
hbox.appendChild(el('h1', null, 'NIST CSF 2.0 — Assessment Dashboard'));
var sub = el('p','sub');
function subSpan(t){ sub.appendChild(el('span', null, t)); }
function subSep(){ var s = el('span','sep','·'); sub.appendChild(s); }
subSpan(P.framework + ' (' + P.frameworkVersion + ')');
subSep();
sub.appendChild(document.createTextNode('Generated '));
sub.appendChild(timeNode(P.generatedAt, 'date unavailable'));
subSep(); subSpan('embeddings: ' + P.providers.embeddings);
subSep(); subSpan('reasoning: ' + P.providers.llm);
if (P.tool && P.tool.name) { subSep(); subSpan(P.tool.name + ' v' + P.tool.version); }
hbox.appendChild(sub);
top.appendChild(hbox);

var themeBtn = el('button','ghost','Theme: auto');
themeBtn.type = 'button';
function themeLabel(){
  var t = document.documentElement.dataset.theme;
  themeBtn.textContent = 'Theme: ' + (t === 'light' ? 'light' : t === 'dark' ? 'dark' : 'auto');
}
themeBtn.addEventListener('click', function(){
  var cur = document.documentElement.dataset.theme || 'auto';
  var next = cur === 'auto' ? 'light' : cur === 'light' ? 'dark' : 'auto';
  if (next === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = next;
  try {
    if (next === 'auto') localStorage.removeItem('csf-dashboard-theme');
    else localStorage.setItem('csf-dashboard-theme', next);
  } catch (e) {}
  themeLabel();
  rerenderCharts();
});
themeLabel();
top.appendChild(themeBtn);
wrap.appendChild(top);

var S = P.summary;
if (S.unreviewed > 0 || S.stale > 0) {
  var bn = el('div','banner');
  bn.appendChild(el('span','ic','⚠'));
  var bt = el('div');
  var st = el('strong', null, 'Draft — not fully reviewed.');
  bt.appendChild(st);
  bt.appendChild(document.createTextNode(' ' + S.unreviewed + ' unreviewed and ' + S.stale +
    ' stale item(s) remain. AI output is a proposal; a human must validate every item before this profile is authoritative.'));
  bn.appendChild(bt);
  wrap.appendChild(bn);
}

/* ------------------------- activity / snapshot ---------------------------- */
var A = P.activity || {};
var activity = el('section','card activity-card');
activity.setAttribute('aria-labelledby','activity-title');
var activityHead = el('div','head');
var activityHd = el('div');
var activityTitle = el('h2', null, 'Assessment activity');
activityTitle.id = 'activity-title';
activityHd.appendChild(activityTitle);
activityHd.appendChild(el('p','desc',
  'Milestones captured in this self-contained snapshot. Regenerate the report to reflect later work.'));
activityHead.appendChild(activityHd);
activity.appendChild(activityHead);
var activityGrid = el('div','activity-grid');
function activityItem(label, iso, detail, state, emptyText){
  var item = el('div','activity-item ' + state);
  var topLine = el('div','activity-top');
  var mark = el('span','activity-mark', state === 'ok' ? '✓' : state === 'attention' ? '!' : '·');
  mark.setAttribute('aria-hidden','true');
  topLine.appendChild(mark);
  topLine.appendChild(el('span', null, label));
  item.appendChild(topLine);
  var when = el('div','activity-when');
  when.appendChild(timeNode(iso, emptyText));
  item.appendChild(when);
  item.appendChild(el('div','activity-meta',detail));
  activityGrid.appendChild(item);
}
var docDetail = A.documents
  ? A.documents.parsed + ' parsed · ' + A.documents.skipped + ' skipped · ' + A.documents.failed + ' failed'
  : 'Document counts unavailable';
var documentState = A.ingestedAt
  ? A.documents && A.documents.failed > 0 ? 'attention' : 'ok'
  : 'optional';
activityItem('Documents ingested', A.ingestedAt, docDetail, documentState, 'Not recorded');
var analysisActivity = A.analysis || {};
var analyzedCount = analysisActivity.assessed == null ? S.totalSubcategories : analysisActivity.assessed;
var analyzedTotal = analysisActivity.total == null ? S.totalSubcategories : analysisActivity.total;
var analysisDetail = analyzedCount + ' of ' + analyzedTotal + ' outcomes assessed';
if (analysisActivity.reasons && analysisActivity.reasons.length) {
  analysisDetail += ' · ' + analysisActivity.reasons.join(', ');
}
var analysisState = analysisActivity.status === 'complete'
  ? 'ok'
  : analyzedCount > 0 || A.analyzedAt ? 'attention' : 'optional';
activityItem('Coverage analyzed', A.analyzedAt, analysisDetail,
  analysisState, 'Not recorded');
var reviewPending = S.unreviewed + S.stale;
var reviewDetail = S.reviewed + ' current · ' + reviewPending + ' pending';
activityItem('Human review', A.lastReviewedAt, reviewDetail,
  reviewPending ? 'attention' : A.lastReviewedAt ? 'ok' : 'optional', 'No review recorded');
var targetAt = T ? (T.updatedAt || T.createdAt) : null;
activityItem('Target updated', targetAt,
  T ? 'Baseline: ' + T.baseline : 'Optional stage', targetAt ? 'ok' : 'optional', T ? 'Date unavailable' : 'Not configured');
activityItem('Snapshot generated', P.generatedAt, 'Offline, self-contained report', 'ok', 'Date unavailable');
activity.appendChild(activityGrid);
wrap.appendChild(activity);

/* ------------------------------ stat tiles -------------------------------- */
var tiles = el('div','tiles');
function tile(label, value, ctx){
  var t = el('div','tile');
  t.appendChild(el('div','lbl',label));
  t.appendChild(el('div','val',value));
  if (ctx) t.appendChild(el('div','ctx',ctx));
  tiles.appendChild(t);
}
var addressed = S.byCoverage.substantial + S.byCoverage.full;
tile('Outcomes addressed', pct(addressed, S.totalSubcategories) + '%',
  addressed + ' of ' + S.totalSubcategories + ' substantial or full');
tile('Gaps', String(S.gaps), 'none ' + S.byCoverage.none + ' · partial ' + S.byCoverage.partial);
tile('Review progress', pct(S.reviewed, S.totalSubcategories) + '%',
  S.reviewed + ' reviewed · ' + S.unreviewed + ' unreviewed · ' + S.stale + ' stale');
tile('Human overrides', String(S.overridden), 'AI judgments changed by a current human review');
tile('Verifier downgrades', String(S.downgradedByVerifier), 'claims dropped for unverifiable quotes');
if (T) tile('Target met', T.summary.pctMet + '%',
  T.summary.met + ' of ' + T.summary.applicable + ' applicable at target' +
  (T.summary.notApplicable ? ' · ' + T.summary.notApplicable + ' out of scope' : ''));
wrap.appendChild(tiles);

/* --------------------------- chart card helpers --------------------------- */
var chartRenderers = [];
function rerenderCharts(){ chartRenderers.forEach(function(r){ r(); }); }

function chartCard(title, desc, renderChart, renderTable){
  var card = el('section','card');
  var head = el('div','head');
  var hd = el('div');
  hd.appendChild(el('h2', null, title));
  if (desc) hd.appendChild(el('p','desc',desc));
  head.appendChild(hd);
  var tbtn = el('button','ghost','View as table');
  tbtn.type = 'button';
  tbtn.setAttribute('aria-pressed','false');
  head.appendChild(tbtn);
  card.appendChild(head);
  var body = el('div');
  card.appendChild(body);
  var tt = el('div','tt');
  card.appendChild(tt);
  var mode = 'chart';
  function render(){
    body.textContent = '';
    if (mode === 'chart') renderChart(body, tt, card);
    else renderTable(body);
  }
  tbtn.addEventListener('click', function(){
    mode = mode === 'chart' ? 'table' : 'chart';
    tbtn.textContent = mode === 'chart' ? 'View as table' : 'View as chart';
    tbtn.setAttribute('aria-pressed', String(mode === 'table'));
    render();
  });
  render();
  chartRenderers.push(render);
  wrap.appendChild(card);
}

function tooltipShow(tt, card, evt, anchor){
  tt.style.display = 'block';
  var cr = card.getBoundingClientRect();
  var x, y;
  if (evt && evt.clientX != null) { x = evt.clientX - cr.left + 14; y = evt.clientY - cr.top + 14; }
  else { var ar = anchor.getBoundingClientRect(); x = ar.left - cr.left + 20; y = ar.top - cr.top + 24; }
  x = Math.min(x, card.clientWidth - tt.offsetWidth - 10);
  y = Math.min(y, card.clientHeight - tt.offsetHeight - 6);
  tt.style.left = Math.max(6, x) + 'px';
  tt.style.top = Math.max(6, y) + 'px';
}
function ttRow(tt, color, label, value){
  var r = el('div','r');
  var k = el('span','k');
  k.style.background = color;
  r.appendChild(k);
  r.appendChild(el('span', null, label));
  r.appendChild(el('span','v', value));
  tt.appendChild(r);
}
function niceStep(raw){
  var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
  var norm = raw / mag;
  var step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}
/* Horizontal bar: 4px rounded data-end, square at the baseline. */
function barPath(x, y, w, h){
  var r = Math.min(4, w / 2, h / 2);
  return 'M' + x + ' ' + y + 'h' + (w - r) +
    'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r +
    'v' + (h - 2 * r) +
    'a' + r + ' ' + r + ' 0 0 1 ' + -r + ' ' + r +
    'h' + (r - w) + 'z';
}

/* --------------------- chart 1: coverage by Function ----------------------- */
var fnRows = DATA.functionOrder.map(function(fn){
  var es = P.subcategories.filter(function(e){ return e.function === fn; });
  var c = {none:0, partial:0, substantial:0, full:0};
  es.forEach(function(e){ c[e.coverage]++; });
  return { fn: fn, counts: c, total: es.length };
});

function renderCoverageChart(body, tt, card){
  var legend = el('div','legend');
  LEVELS.forEach(function(lv){
    var it = el('span','it');
    var sw = el('span','sw');
    sw.style.background = cssVar(LEVEL_VAR[lv]);
    it.appendChild(sw);
    it.appendChild(el('span', null, cap(lv)));
    legend.appendChild(it);
  });
  body.appendChild(legend);

  var W = 760, gutter = 120, right = 46, barH = 20, rowH = 34, padTop = 6, axisH = 22;
  var H = padTop + fnRows.length * rowH + axisH;
  var maxTotal = Math.max.apply(null, fnRows.map(function(r){ return r.total; }).concat([1]));
  var plotW = W - gutter - right;
  var xs = function(v){ return gutter + v / maxTotal * plotW; };
  var svg = svgEl('svg', { class:'chart', viewBox:'0 0 ' + W + ' ' + H, role:'img',
    'aria-label':'Stacked bars: coverage tier counts per CSF Function' });

  var step = niceStep(maxTotal / 5);
  for (var g = 0; g <= maxTotal; g += step) {
    svg.appendChild(svgEl('line', { x1:xs(g), y1:padTop, x2:xs(g), y2:H - axisH,
      stroke:cssVar('--grid'), 'stroke-width':1 }));
    var tick = svgEl('text', { x:xs(g), y:H - axisH + 14, 'text-anchor':'middle',
      fill:cssVar('--muted'), style:'font-variant-numeric:tabular-nums' });
    tick.textContent = String(g);
    svg.appendChild(tick);
  }
  svg.appendChild(svgEl('line', { x1:gutter, y1:padTop, x2:gutter, y2:H - axisH,
    stroke:cssVar('--axis'), 'stroke-width':1 }));

  fnRows.forEach(function(row, i){
    var y = padTop + i * rowH + (rowH - barH) / 2;
    var grp = svgEl('g', { class:'brow' });
    var lbl = svgEl('text', { x:gutter - 10, y:y + barH / 2 + 4, 'text-anchor':'end', fill:cssVar('--ink2') });
    lbl.textContent = row.fn;
    grp.appendChild(lbl);

    var nonZero = LEVELS.filter(function(lv){ return row.counts[lv] > 0; });
    var cum = 0;
    nonZero.forEach(function(lv, j){
      var x0 = xs(cum), x1 = xs(cum + row.counts[lv]);
      var sx = j === 0 ? x0 : x0 + 2;      /* 2px surface gap between segments */
      var w = Math.max(x1 - sx, 0.5);
      var color = cssVar(LEVEL_VAR[lv]);
      if (j === nonZero.length - 1) {
        grp.appendChild(svgEl('path', { class:'seg', d:barPath(sx, y, w, barH), fill:color }));
      } else {
        grp.appendChild(svgEl('rect', { class:'seg', x:sx, y:y, width:w, height:barH, fill:color }));
      }
      cum += row.counts[lv];
    });

    var total = svgEl('text', { x:xs(row.total) + 8, y:y + barH / 2 + 4, fill:cssVar('--ink'),
      style:'font-variant-numeric:tabular-nums' });
    total.textContent = String(row.total);
    grp.appendChild(total);

    var aria = row.fn + ': ' + LEVELS.map(function(lv){ return lv + ' ' + row.counts[lv]; }).join(', ') +
      ', total ' + row.total;
    var hit = svgEl('rect', { class:'row-hit', x:0, y:padTop + i * rowH, width:W,
      height:rowH, fill:'transparent', tabindex:'0', role:'img', 'aria-label':aria });
    function fill(evt){
      tt.textContent = '';
      tt.appendChild(el('div','t', row.fn));
      LEVELS.forEach(function(lv){
        ttRow(tt, cssVar(LEVEL_VAR[lv]), cap(lv), String(row.counts[lv]));
      });
      grp.classList.add('hot');
      tooltipShow(tt, card, evt, hit);
    }
    function clear(){ tt.style.display = 'none'; grp.classList.remove('hot'); }
    hit.addEventListener('pointerenter', fill);
    hit.addEventListener('pointermove', fill);
    hit.addEventListener('pointerleave', clear);
    hit.addEventListener('focus', function(){ fill(null); });
    hit.addEventListener('blur', clear);
    grp.appendChild(hit);
    svg.appendChild(grp);
  });
  body.appendChild(svg);
}

function renderCoverageTable(body){
  var t = el('table','tbl');
  var tr = el('tr');
  tr.appendChild(el('th', null, 'Function'));
  LEVELS.forEach(function(lv){ var th = el('th','n',cap(lv)); tr.appendChild(th); });
  tr.appendChild(el('th','n','Total'));
  tr.appendChild(el('th','n','% addressed'));
  t.appendChild(tr);
  fnRows.forEach(function(row){
    var r = el('tr');
    r.appendChild(el('td', null, row.fn));
    LEVELS.forEach(function(lv){ r.appendChild(el('td','n',String(row.counts[lv]))); });
    r.appendChild(el('td','n',String(row.total)));
    r.appendChild(el('td','n', pct(row.counts.substantial + row.counts.full, row.total) + '%'));
    t.appendChild(r);
  });
  body.appendChild(t);
}

chartCard('Coverage by Function',
  'How the ' + S.totalSubcategories + ' assessed outcomes distribute across the four coverage tiers.',
  renderCoverageChart, renderCoverageTable);

/* ---------------------- chart 2: current vs target ------------------------ */
if (T) {
  var tf = T.summary.byFunction;
  function renderTargetChart(body, tt, card){
    var W = 760, gutter = 120, right = 56, barH = 20, rowH = 34, padTop = 6, axisH = 22;
    var H = padTop + tf.length * rowH + axisH;
    var plotW = W - gutter - right;
    var xs = function(v){ return gutter + v / 100 * plotW; };
    var svg = svgEl('svg', { class:'chart', viewBox:'0 0 ' + W + ' ' + H, role:'img',
      'aria-label':'Bars: percent of applicable outcomes at target, per CSF Function' });
    [0,25,50,75,100].forEach(function(g){
      svg.appendChild(svgEl('line', { x1:xs(g), y1:padTop, x2:xs(g), y2:H - axisH,
        stroke:cssVar('--grid'), 'stroke-width':1 }));
      var tick = svgEl('text', { x:xs(g), y:H - axisH + 14, 'text-anchor':'middle',
        fill:cssVar('--muted'), style:'font-variant-numeric:tabular-nums' });
      tick.textContent = g + '%';
      svg.appendChild(tick);
    });
    svg.appendChild(svgEl('line', { x1:gutter, y1:padTop, x2:gutter, y2:H - axisH,
      stroke:cssVar('--axis'), 'stroke-width':1 }));

    tf.forEach(function(f, i){
      var y = padTop + i * rowH + (rowH - barH) / 2;
      var grp = svgEl('g', { class:'brow' });
      var lbl = svgEl('text', { x:gutter - 10, y:y + barH / 2 + 4, 'text-anchor':'end', fill:cssVar('--ink2') });
      lbl.textContent = f.function;
      grp.appendChild(lbl);
      var w = Math.max(xs(f.pctMet) - gutter, 0.5);
      grp.appendChild(svgEl('path', { class:'seg', d:barPath(gutter, y, w, barH), fill:cssVar('--accent') }));
      var vl = svgEl('text', { x:xs(f.pctMet) + 8, y:y + barH / 2 + 4, fill:cssVar('--ink'),
        style:'font-variant-numeric:tabular-nums' });
      vl.textContent = f.pctMet + '%';
      grp.appendChild(vl);

      var aria = f.function + ': ' + f.pctMet + '% at target (' + f.met + ' of ' + f.applicable +
        ' applicable' + (f.notApplicable ? ', ' + f.notApplicable + ' out of scope' : '') + ')';
      var hit = svgEl('rect', { class:'row-hit', x:0, y:padTop + i * rowH, width:W,
        height:rowH, fill:'transparent', tabindex:'0', role:'img', 'aria-label':aria });
      function fill(evt){
        tt.textContent = '';
        tt.appendChild(el('div','t', f.function));
        ttRow(tt, cssVar('--accent'), 'At target', f.met + '/' + f.applicable);
        ttRow(tt, cssVar('--grid'), 'Unmet', String(f.unmet));
        if (f.notApplicable) ttRow(tt, cssVar('--grid'), 'Out of scope', String(f.notApplicable));
        grp.classList.add('hot');
        tooltipShow(tt, card, evt, hit);
      }
      function clear(){ tt.style.display = 'none'; grp.classList.remove('hot'); }
      hit.addEventListener('pointerenter', fill);
      hit.addEventListener('pointermove', fill);
      hit.addEventListener('pointerleave', clear);
      hit.addEventListener('focus', function(){ fill(null); });
      hit.addEventListener('blur', clear);
      grp.appendChild(hit);
      svg.appendChild(grp);
    });
    body.appendChild(svg);
  }
  function renderTargetTable(body){
    var t = el('table','tbl');
    var tr = el('tr');
    ['Function','Applicable','Met','Unmet','Out of scope','% met'].forEach(function(h, i){
      tr.appendChild(el('th', i ? 'n' : null, h));
    });
    t.appendChild(tr);
    tf.forEach(function(f){
      var r = el('tr');
      r.appendChild(el('td', null, f.function));
      [f.applicable, f.met, f.unmet, f.notApplicable].forEach(function(v){
        r.appendChild(el('td','n',String(v)));
      });
      r.appendChild(el('td','n', f.pctMet + '%'));
      t.appendChild(r);
    });
    body.appendChild(t);
  }
  chartCard('Current vs Target',
    'Percent of applicable outcomes already at or above their target (baseline: ' + T.baseline + ').',
    renderTargetChart, renderTargetTable);
}

/* ----------------------- top remediation priorities ----------------------- */
if (T && DATA.planOrder.length) {
  var byId = {};
  T.entries.forEach(function(e){ byId[e.subcategory_id] = e; });
  var card = el('section','card');
  var head = el('div','head');
  var hd = el('div');
  hd.appendChild(el('h2', null, 'Top remediation priorities'));
  hd.appendChild(el('p','desc','First ' + Math.min(10, DATA.planOrder.length) + ' of ' +
    DATA.planOrder.length + ' unmet targets, in plan order — the full plan with NIST suggested actions is in remediation-plan.md.'));
  head.appendChild(hd);
  card.appendChild(head);
  var ol = el('ol','plan');
  DATA.planOrder.slice(0, 10).forEach(function(id){
    var e = byId[id];
    var li = el('li');
    var meta = el('span','meta');
    var strong = el('strong', null, e.subcategory_id);
    meta.appendChild(strong);
    meta.appendChild(document.createTextNode(' — ' + e.current_coverage + ' → ' + e.target_coverage +
      ' · ' + e.priority + ' priority'));
    li.appendChild(meta);
    li.appendChild(el('span','o', e.outcome));
    ol.appendChild(li);
  });
  card.appendChild(ol);
  wrap.appendChild(card);
}

/* --------------------------- subcategory explorer ------------------------- */
var targetById = {};
if (T) T.entries.forEach(function(e){ targetById[e.subcategory_id] = e; });

var xcard = el('section','card');
var xhead = el('div','head');
var xhd = el('div');
xhd.appendChild(el('h2', null, 'All subcategories'));
xhd.appendChild(el('p','desc','Every assessed outcome with its verified evidence. Click a row for the rationale, quotes' +
  (T ? ', and NIST suggested actions.' : '.')));
xhead.appendChild(xhd);
xcard.appendChild(xhead);

function quickMatches(mode, e){
  var tgt = targetById[e.subcategory_id];
  var gap = e.coverage === 'none' || e.coverage === 'partial';
  var pendingReview = e.review_status === 'unreviewed' || e.review_status === 'stale';
  var unmetTarget = !!(tgt && !tgt.not_applicable && !tgt.met);
  if (mode === 'attention') return gap || pendingReview || unmetTarget;
  if (mode === 'gaps') return gap;
  if (mode === 'review') return pendingReview;
  if (mode === 'unmet') return unmetTarget;
  return true;
}
var quickMode = '';
var quickButtons = [];
var quickFilters = el('div','quick-filters');
quickFilters.setAttribute('role','group');
quickFilters.setAttribute('aria-label','Quick filters');
quickFilters.appendChild(el('span','qlbl','Quick filters'));
function addQuickFilter(mode, label){
  var count = P.subcategories.filter(function(e){ return quickMatches(mode, e); }).length;
  var b = el('button','filter-chip',label + ' · ' + count);
  b.type = 'button';
  b.setAttribute('aria-pressed','false');
  b.setAttribute('aria-label',label + ', ' + count + ' outcomes');
  b.addEventListener('click', function(){
    quickMode = quickMode === mode ? '' : mode;
    fCov.value = '';
    fRev.value = '';
    if (fTgt) fTgt.value = '';
    updateQuickButtons();
    renderTable();
  });
  quickButtons.push({ mode:mode, button:b });
  quickFilters.appendChild(b);
}
function updateQuickButtons(){
  quickButtons.forEach(function(item){
    item.button.setAttribute('aria-pressed',String(item.mode === quickMode));
  });
}
addQuickFilter('attention','Needs attention');
addQuickFilter('gaps','Gaps');
addQuickFilter('review','Review pending');
if (T) addQuickFilter('unmet','Unmet target');
xcard.appendChild(quickFilters);

var filters = el('div','filters');
var search = document.createElement('input');
search.type = 'search';
search.placeholder = 'Search outcomes, rationale, notes, sources, quotes…';
search.setAttribute('aria-label','Search subcategories and evidence');
filters.appendChild(search);
function sel(labelText, opts){
  var s = document.createElement('select');
  s.setAttribute('aria-label', labelText);
  opts.forEach(function(o){
    var op = document.createElement('option');
    op.value = o[0]; op.textContent = o[1];
    s.appendChild(op);
  });
  filters.appendChild(s);
  return s;
}
var fFn = sel('Function', [['','All Functions']].concat(DATA.functionOrder.map(function(f){ return [f, f]; })));
var fCov = sel('Coverage', [['','All coverage'],['gaps','Gaps (none + partial)']].concat(LEVELS.map(function(l){ return [l, cap(l)]; })));
var fRev = sel('Review status', [['','All review states'],['reviewed','Reviewed'],['unreviewed','Unreviewed'],['stale','Stale']]);
var fTgt = null;
if (T) fTgt = sel('Target status', [['','All vs target'],['unmet','Unmet target'],['met','At/above target'],['na','Out of scope']]);
var countLbl = el('span','count','');
countLbl.setAttribute('role','status');
countLbl.setAttribute('aria-live','polite');
countLbl.setAttribute('aria-atomic','true');
filters.appendChild(countLbl);
xcard.appendChild(filters);

var tblWrap = el('div');
tblWrap.style.overflowX = 'auto';
xcard.appendChild(tblWrap);

var REV_COLOR = { reviewed:'--good', unreviewed:'--warning', stale:'--serious' };
var REV_ICON = { reviewed:'✓', unreviewed:'⚠', stale:'⟳' };
var searchIndex = {};
P.subcategories.forEach(function(e){
  var parts = [
    e.subcategory_id, e.outcome, e.category, e.function, e.coverage, e.ai_coverage,
    e.human_coverage, e.rationale, e.reviewer_notes, e.reviewer
  ];
  (e.evidence || []).forEach(function(ev){ parts.push(ev.source_file, ev.quote); });
  var tgt = targetById[e.subcategory_id];
  if (tgt) {
    parts.push(tgt.target_coverage, tgt.priority, tgt.note);
    (tgt.implementation_examples || []).forEach(function(ex){ parts.push(ex); });
  }
  searchIndex[e.subcategory_id] = parts.filter(function(value){
    return value != null && value !== '';
  }).join(' ').toLowerCase();
});

function coverageChip(cov){
  var c = el('span','chip');
  var d = el('span','dot');
  d.style.background = cssVar(LEVEL_VAR[cov]);
  c.appendChild(d);
  c.appendChild(el('span', null, cov));
  return c;
}
function reviewBadge(st){
  var b = el('span','badge');
  var d = el('span','st');
  d.style.background = cssVar(REV_COLOR[st] || '--muted');
  b.appendChild(d);
  b.appendChild(el('span', null, REV_ICON[st] + ' ' + st));
  return b;
}

function detailCell(e, t, cols){
  var td = document.createElement('td');
  td.colSpan = cols;
  var box = el('div','det');
  box.appendChild(el('p','out', e.outcome));
  box.appendChild(el('p','rat', e.rationale));
  if (e.human_coverage != null) {
    box.appendChild(el('p','rat','Human override: AI proposed ' + e.ai_coverage +
      '; reviewer set ' + e.human_coverage + (e.reviewer ? ' (' + e.reviewer + ')' : '') + '.'));
  }
  if (e.reviewer_notes) box.appendChild(el('p','rat','Reviewer note: ' + e.reviewer_notes));
  if (t && t.note) box.appendChild(el('p','rat','Target note: ' + t.note));

  box.appendChild(el('h4', null, 'Verified evidence (' + e.evidence.length + ')'));
  if (!e.evidence.length) {
    box.appendChild(el('p','rat','(none)'));
  } else {
    e.evidence.forEach(function(ev){
      var q = el('div','q');
      q.appendChild(el('span','src', ev.source_file + (ev.page ? ', p.' + ev.page : '')));
      q.appendChild(document.createTextNode('“' + ev.quote + '”'));
      box.appendChild(q);
    });
  }
  if (t && t.implementation_examples && t.implementation_examples.length) {
    box.appendChild(el('h4', null, 'NIST implementation examples (suggested actions)'));
    var ol = document.createElement('ol');
    t.implementation_examples.forEach(function(ex){ ol.appendChild(el('li', null, ex)); });
    box.appendChild(ol);
  }
  td.appendChild(box);
  return td;
}

function renderTable(){
  tblWrap.textContent = '';
  var q = search.value.trim().toLowerCase();
  var rows = P.subcategories.filter(function(e){
    if (fFn.value && e.function !== fFn.value) return false;
    if (quickMode && !quickMatches(quickMode, e)) return false;
    if (fCov.value === 'gaps') { if (e.coverage !== 'none' && e.coverage !== 'partial') return false; }
    else if (fCov.value && e.coverage !== fCov.value) return false;
    if (fRev.value && e.review_status !== fRev.value) return false;
    if (fTgt && fTgt.value) {
      var t = targetById[e.subcategory_id];
      if (!t) return false;
      if (fTgt.value === 'unmet' && (t.not_applicable || t.met)) return false;
      if (fTgt.value === 'met' && !t.met) return false;
      if (fTgt.value === 'na' && !t.not_applicable) return false;
    }
    if (q) {
      if (searchIndex[e.subcategory_id].indexOf(q) < 0) return false;
    }
    return true;
  });
  countLbl.textContent = rows.length + ' of ' + P.subcategories.length;

  var t = el('table','tbl');
  var tr = el('tr');
  var heads = ['', 'ID', 'Function', 'Coverage', 'Conf.', 'Review'];
  if (T) heads = heads.concat(['Target', 'Priority']);
  heads = heads.concat(['Evidence']);
  heads.forEach(function(h, i){
    tr.appendChild(el('th', (h === 'Conf.' || h === 'Evidence') ? 'n' : null, h));
  });
  t.appendChild(tr);
  var cols = heads.length;

  rows.forEach(function(e){
    var tgt = targetById[e.subcategory_id] || null;
    var r = el('tr','mrow');
    r.setAttribute('aria-expanded','false');
    var c0 = document.createElement('td');
    c0.appendChild(el('span','chev','▸'));
    r.appendChild(c0);
    var idTd = document.createElement('td');
    idTd.appendChild(el('strong', null, e.subcategory_id));
    r.appendChild(idTd);
    r.appendChild(el('td', null, e.function));
    var covTd = document.createElement('td');
    covTd.appendChild(coverageChip(e.coverage));
    if (e.human_coverage != null) {
      var overrideTag = el('span','override-tag','human');
      overrideTag.setAttribute('title','Human override: ' + e.ai_coverage + ' → ' + e.human_coverage);
      overrideTag.setAttribute('aria-label','Human override from ' + e.ai_coverage + ' to ' + e.human_coverage);
      covTd.appendChild(overrideTag);
    }
    r.appendChild(covTd);
    r.appendChild(el('td','n', e.confidence.toFixed(2)));
    var revTd = document.createElement('td');
    revTd.appendChild(reviewBadge(e.review_status));
    r.appendChild(revTd);
    if (T) {
      var tv = tgt ? (tgt.not_applicable ? 'n/a' : tgt.target_coverage + (tgt.met ? ' ✓' : '')) : '—';
      r.appendChild(el('td', null, tv));
      r.appendChild(el('td', null, tgt && tgt.priority ? tgt.priority : '—'));
    }
    r.appendChild(el('td','n', String(e.evidence.length)));

    var dr = el('tr','drow');
    dr.hidden = true;
    dr.appendChild(detailCell(e, tgt, cols));
    r.addEventListener('click', function(){
      dr.hidden = !dr.hidden;
      r.setAttribute('aria-expanded', String(!dr.hidden));
    });
    r.addEventListener('keydown', function(ev){
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); r.click(); }
    });
    r.tabIndex = 0;
    t.appendChild(r);
    t.appendChild(dr);
  });
  tblWrap.appendChild(t);
}
search.addEventListener('input', renderTable);
fFn.addEventListener('input', renderTable);
[fCov, fRev].concat(fTgt ? [fTgt] : []).forEach(function(ctl){
  ctl.addEventListener('input', function(){
    quickMode = '';
    updateQuickButtons();
    renderTable();
  });
});
renderTable();
wrap.appendChild(xcard);

/* --------------------------------- footer --------------------------------- */
var foot = el('footer','foot');
foot.appendChild(el('div', null, P.disclaimer));
if (T) foot.appendChild(el('div', null,
  'Target profile: baseline "' + T.baseline + '"' + (T.description ? ' — ' + T.description : '') +
  '. Targets, priorities, and scoping are human decisions; suggested actions are official NIST CSF 2.0 Implementation Examples (public domain).'));
foot.appendChild(el('div', null,
  'Self-contained report generated by ' + (P.tool ? P.tool.name + ' v' + P.tool.version : 'csf-tool') +
  ' — no network access is required or used by this page.'));
wrap.appendChild(foot);
})();
`;
