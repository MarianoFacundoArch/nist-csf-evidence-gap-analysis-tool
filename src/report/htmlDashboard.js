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
 *
 * REPORT LANGUAGE. The embedded script has two forms, written as ONE source
 * (APP_TEMPLATE) so they cannot drift apart structurally:
 *  - the English form carries its English text inline, exactly as it always
 *    has. It is the template with the localization markers removed, so an
 *    English dashboard is byte-identical to the one this module produced
 *    before it could be rendered in another language.
 *  - the localized form takes, at every marker, the alternative expression
 *    written beside the English one. That expression reads its text from the
 *    embedded JSON (`i18n`) through a small lookup function — the script still
 *    holds no template literal and still writes text with textContent only.
 * A marker looks like this in the template:
 *     el('h2', null, /*L10N tx('dashboard.docs.title') *\/'Evidence by document'/*END*\/)
 * i.e. `/*L10N <localized expression> *\/<English expression>/*END*\/`, and the
 * English expression is live code while the template is read as JavaScript.
 * The data a localized page embeds is the same as an English page's plus the
 * one `i18n` key: messages, display labels, and the framework text of the
 * published translation of the Core (Function names, Category names,
 * outcomes) for the identifiers it covers. Implementation Examples are NIST's
 * English in every language. A test renders both forms with English text and
 * compares the pages they build, so the catalog and the inline text agree.
 */

import { orderFunctions } from '../csf/order.js';
import { planOrder } from '../target/targetProfile.js';
import { documentViewNotes } from './documentView.js';
import { messageCatalog } from '../i18n/index.js';
import { asLocale } from '../i18n/locale.js';

/**
 * @param {object} profile the Current Profile from buildProfile()
 * @param {object|null} [targetView] the target view from buildTargetView(), if any
 * @param {{documentView?: object, crosswalk?: object, locale?: object}} [extras] optional
 *   sections, each read from its own key and embedded only when passed
 *   (omitting it leaves the embedded data unchanged): `documentView` — the view
 *   from buildDocumentView(), shown as the "Evidence by document" table;
 *   `crosswalk` — crosswalkDashboardData(view): reference identifiers per
 *   Subcategory, shown as "related references" in the explorer; `locale` — a
 *   report locale (src/i18n/locale.js): the page is rendered in its language.
 *   Without one, or with the English locale, the page is the English page.
 */
export function renderDashboardHtml(profile, targetView = null, extras = {}) {
  // English — given, absent, or not a locale at all — is the page as it always was.
  const given = asLocale(extras?.locale);
  const locale = given.isEnglish ? null : given;
  const payload = {
    profile,
    target: targetView,
    planOrder: targetView
      ? planOrder(targetView.entries.filter((e) => !e.not_applicable && !e.met)).map((e) => e.subcategory_id)
      : [],
    functionOrder: orderFunctions(profile.subcategories),
  };
  // Each is added only when given, so the embedded data is unchanged without it.
  if (extras?.documentView) payload.documentView = extras.documentView;
  if (extras?.crosswalk) payload.crosswalk = extras.crosswalk;
  // Only a localized page carries it, so an English page's data is unchanged.
  if (locale) payload.i18n = localeData(locale, profile, extras?.documentView);
  // <-escape so document text can never close the script element.
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  const page = locale ? localizedPage(locale) : ENGLISH_PAGE;

  return `<!doctype html>
<html lang="${page.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${page.title}</title>
<style>${CSS}</style>
</head>
<body>
<script id="csf-data" type="application/json">${json}</script>
<noscript><p style="padding:24px">${page.noscript}</p></noscript>
<div id="app"></div>
<script>${page.script}</script>
</body>
</html>
`;
}

/* ------------------------------ report language ---------------------------- */

// Catalog keys a localized page may look up (its `i18n.strings`): everything
// under these prefixes, plus the few shared messages listed by name.
const PAGE_KEY_PREFIXES = ['dashboard.', 'coverage.', 'review.', 'priority.', 'tier.name.'];
const PAGE_KEYS = ['common.page', 'crosswalk.thirdParty.label'];

/** Minimal HTML escaping for catalog text placed in the page's static markup. */
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The static parts of a localized page: language, title, <noscript>, and the script form. */
function localizedPage(locale) {
  const code = (name) => `<code>${name}</code>`;
  // The message is escaped first; the file names are then set in <code>.
  const noscript = escapeHtml(locale.t.template('dashboard.noscript'))
    .replace('{profile}', code('current-profile.json'))
    .replace('{gap}', code('gap-analysis.md'))
    .replace('{evidence}', code('evidence-map.csv'));
  return {
    lang: escapeHtml(locale.language),
    title: escapeHtml(locale.t('dashboard.title')),
    noscript,
    script: LOCALIZED_APP_JS,
  };
}

/**
 * What a localized page embeds under `i18n` and reads through its lookup
 * functions. Everything here is display text; the rest of the embedded data
 * is the same in every language.
 */
function localeData(locale, profile, documentView) {
  const { t, csfText } = locale;
  const english = messageCatalog('en');

  const strings = {};
  for (const key of Object.keys(english)) {
    if (PAGE_KEYS.includes(key) || PAGE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      strings[key] = t.template(key);
    }
  }

  // Sentences the data carries in English (the disclaimer, a staleness reason,
  // the rationale of an outcome that was never assessed) -> this language.
  const fixed = {};
  const fixedPrefixes = [];
  for (const key of Object.keys(english)) {
    if (t.template(key) === english[key]) continue;
    if (key.startsWith('fixed.')) fixed[english[key]] = t.template(key);
    // The same for a sentence that leads other text: [English, this language].
    if (key.startsWith('fixedPrefix.')) fixedPrefixes.push([english[key], t.template(key)]);
  }

  // The framework's text, from the published translation, for the elements
  // it applies to; the page falls back to the profile's own text for the rest.
  // Function names are looked up by the name the page groups by; Category
  // labels and outcomes by Subcategory, exactly as the Markdown reports
  // resolve them, so the two can never disagree about one entry.
  const csf = { functions: {}, categories: {}, outcomes: {} };
  if (csfText) {
    const functionName = locale.functionNames(profile.subcategories);
    for (const entry of profile.subcategories) {
      const name = functionName(entry.function);
      if (name !== entry.function) csf.functions[entry.function] = name;
      const category = locale.categoryLabel(entry);
      if (category !== entry.category) csf.categories[entry.subcategory_id] = category;
      const outcome = locale.outcome(entry);
      if (outcome !== entry.outcome) csf.outcomes[entry.subcategory_id] = outcome;
    }
  }

  const note = locale.frameworkNote(profile.subcategories);
  return {
    language: locale.language,
    strings,
    fixed,
    fixedPrefixes,
    csf,
    frameworkNote: note ? `${note.label}. ${note.text}` : null,
    examplesNote: locale.examplesNote(),
    ...documentNotes(documentView, locale),
  };
}

/**
 * The caveats of the document view in the page's language, as `documentNotes`
 * — but only when the view carries its own standard caveats. A view whose
 * `notes` someone replaced, or one too incomplete to derive them again, keeps
 * the notes it has: the page then shows those, untouched, as an English page
 * does.
 */
function documentNotes(view, locale) {
  if (!view) return {};
  try {
    const standard = documentViewNotes(view);
    const unchanged =
      Array.isArray(view.notes) && view.notes.length === standard.length && standard.every((note, i) => note === view.notes[i]);
    return unchanged ? { documentNotes: documentViewNotes(view, undefined, locale) } : {};
  } catch {
    return {};
  }
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
.det .xref{color:var(--ink2);margin:4px 0;overflow-wrap:anywhere}
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
//
// This is the TEMPLATE of the script, in both of its forms (see the module
// comment): at each /*L10N ... */.../*END*/ marker the English form keeps the
// expression after the first comment and the localized form takes the one
// inside it. When a string is added or changed here, give it a marker and add
// its message to BOTH catalogs (src/i18n/en.js, es.js) — a test compares the
// two forms and fails when the catalog and the inline English disagree.

const APP_TEMPLATE = `
(function(){
'use strict';
var DATA = JSON.parse(document.getElementById('csf-data').textContent);
var P = DATA.profile, T = DATA.target;
var XW = DATA.crosswalk || null;/*L10N-HELPERS*/
/* Reference ids one crosswalk relates to an outcome: to the outcome itself,
   to its whole Category, to its whole Function (as the mapping records them). */
function xwIds(cw, e){
  var catId = e.subcategory_id.split('-')[0];
  var fnId = e.function_id || e.subcategory_id.split('.')[0];
  return [
    { label: '', ids: cw.map[e.subcategory_id] || [] },
    { label: /*L10N tx('dashboard.xref.category', {id: catId}) */'Category ' + catId/*END*/, ids: (cw.categories || {})[catId] || [] },
    { label: /*L10N tx('dashboard.xref.function', {id: fnId}) */'Function ' + fnId/*END*/, ids: (cw.functions || {})[fnId] || [] }
  ];
}
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
  if (!iso) return el('span', null, fallback || /*L10N tx('dashboard.notRecorded') */'Not recorded'/*END*/);
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
  n.setAttribute('aria-label', /*L10N tx('dashboard.time.aria', {label: label, iso: iso}) */label + '; ISO timestamp ' + iso/*END*/);
  return n;
}

/* ------------------------------- header ---------------------------------- */
var wrap = el('div','wrap');
app.appendChild(wrap);

var top = el('header','top');
var hbox = el('div');
hbox.appendChild(el('h1', null, /*L10N tx('dashboard.title') */'NIST CSF 2.0 — Assessment Dashboard'/*END*/));
var sub = el('p','sub');
function subSpan(t){ sub.appendChild(el('span', null, t)); }
function subSep(){ var s = el('span','sep','·'); sub.appendChild(s); }
subSpan(P.framework + ' (' + P.frameworkVersion + ')');
subSep();
sub.appendChild(document.createTextNode(/*L10N tx('dashboard.generated') + ' ' */'Generated '/*END*/));
sub.appendChild(timeNode(P.generatedAt, /*L10N tx('dashboard.dateUnavailable.lower') */'date unavailable'/*END*/));
subSep(); subSpan(/*L10N tx('dashboard.providers.embeddings', {id: P.providers.embeddings}) */'embeddings: ' + P.providers.embeddings/*END*/);
subSep(); subSpan(/*L10N tx('dashboard.providers.reasoning', {id: P.providers.llm}) */'reasoning: ' + P.providers.llm/*END*/);
if (P.tool && P.tool.name) { subSep(); subSpan(P.tool.name + ' v' + P.tool.version); }
hbox.appendChild(sub);
top.appendChild(hbox);

var themeBtn = el('button','ghost',/*L10N tx('dashboard.theme.auto') */'Theme: auto'/*END*/);
themeBtn.type = 'button';
function themeLabel(){
  var t = document.documentElement.dataset.theme;
  themeBtn.textContent = /*L10N tx(t === 'light' ? 'dashboard.theme.light' : t === 'dark' ? 'dashboard.theme.dark' : 'dashboard.theme.auto') */'Theme: ' + (t === 'light' ? 'light' : t === 'dark' ? 'dark' : 'auto')/*END*/;
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
  var st = el('strong', null, /*L10N tx('dashboard.draft.title') */'Draft — not fully reviewed.'/*END*/);
  bt.appendChild(st);
  bt.appendChild(document.createTextNode(/*L10N ' ' + tx('dashboard.draft.text', {unreviewed: S.unreviewed, stale: S.stale}) */' ' + S.unreviewed + ' unreviewed and ' + S.stale +
    ' stale item(s) remain. AI output is a proposal; a human must validate every item before this profile is authoritative.'/*END*/));
  bn.appendChild(bt);
  wrap.appendChild(bn);
}

/* ------------------------- activity / snapshot ---------------------------- */
var A = P.activity || {};
var activity = el('section','card activity-card');
activity.setAttribute('aria-labelledby','activity-title');
var activityHead = el('div','head');
var activityHd = el('div');
var activityTitle = el('h2', null, /*L10N tx('dashboard.activity.title') */'Assessment activity'/*END*/);
activityTitle.id = 'activity-title';
activityHd.appendChild(activityTitle);
activityHd.appendChild(el('p','desc',
  /*L10N tx('dashboard.activity.desc') */'Milestones captured in this self-contained snapshot. Regenerate the report to reflect later work.'/*END*/));
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
  ? /*L10N tx('dashboard.activity.documents.detail', {parsed: A.documents.parsed, skipped: A.documents.skipped, failed: A.documents.failed}) */A.documents.parsed + ' parsed · ' + A.documents.skipped + ' skipped · ' + A.documents.failed + ' failed'/*END*/
  : /*L10N tx('dashboard.activity.documents.unavailable') */'Document counts unavailable'/*END*/;
var documentState = A.ingestedAt
  ? A.documents && A.documents.failed > 0 ? 'attention' : 'ok'
  : 'optional';
activityItem(/*L10N tx('dashboard.activity.ingested') */'Documents ingested'/*END*/, A.ingestedAt, docDetail, documentState, /*L10N tx('dashboard.notRecorded') */'Not recorded'/*END*/);
var analysisActivity = A.analysis || {};
var analyzedCount = analysisActivity.assessed == null ? S.totalSubcategories : analysisActivity.assessed;
var analyzedTotal = analysisActivity.total == null ? S.totalSubcategories : analysisActivity.total;
var analysisDetail = /*L10N tx('dashboard.activity.analysis.detail', {assessed: analyzedCount, total: analyzedTotal}) */analyzedCount + ' of ' + analyzedTotal + ' outcomes assessed'/*END*/;
if (analysisActivity.reasons && analysisActivity.reasons.length) {
  analysisDetail += ' · ' + /*L10N analysisActivity.reasons.map(txFixed).join(', ') */analysisActivity.reasons.join(', ')/*END*/;
}
var analysisState = analysisActivity.status === 'complete'
  ? 'ok'
  : analyzedCount > 0 || A.analyzedAt ? 'attention' : 'optional';
activityItem(/*L10N tx('dashboard.activity.analyzed') */'Coverage analyzed'/*END*/, A.analyzedAt, analysisDetail,
  analysisState, /*L10N tx('dashboard.notRecorded') */'Not recorded'/*END*/);
var reviewPending = S.unreviewed + S.stale;
var reviewDetail = /*L10N tx('dashboard.activity.review.detail', {current: S.reviewed, pending: reviewPending}) */S.reviewed + ' current · ' + reviewPending + ' pending'/*END*/;
activityItem(/*L10N tx('dashboard.activity.review') */'Human review'/*END*/, A.lastReviewedAt, reviewDetail,
  reviewPending ? 'attention' : A.lastReviewedAt ? 'ok' : 'optional', /*L10N tx('dashboard.activity.review.none') */'No review recorded'/*END*/);
var targetAt = T ? (T.updatedAt || T.createdAt) : null;
activityItem(/*L10N tx('dashboard.activity.target') */'Target updated'/*END*/, targetAt,
  T ? /*L10N tx('dashboard.activity.target.baseline', {baseline: txCov(T.baseline)}) */'Baseline: ' + T.baseline/*END*/ : /*L10N tx('dashboard.activity.target.optional') */'Optional stage'/*END*/, targetAt ? 'ok' : 'optional', T ? /*L10N tx('dashboard.dateUnavailable') */'Date unavailable'/*END*/ : /*L10N tx('dashboard.activity.target.notConfigured') */'Not configured'/*END*/);
activityItem(/*L10N tx('dashboard.activity.snapshot') */'Snapshot generated'/*END*/, P.generatedAt, /*L10N tx('dashboard.activity.snapshot.detail') */'Offline, self-contained report'/*END*/, 'ok', /*L10N tx('dashboard.dateUnavailable') */'Date unavailable'/*END*/);
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
tile(/*L10N tx('dashboard.tile.addressed') */'Outcomes addressed'/*END*/, pct(addressed, S.totalSubcategories) + '%',
  /*L10N tx('dashboard.tile.addressed.ctx', {count: addressed, total: S.totalSubcategories}) */addressed + ' of ' + S.totalSubcategories + ' substantial or full'/*END*/);
/*L10N tile(tx('dashboard.tile.gaps') */tile('Gaps'/*END*/, String(S.gaps), /*L10N tx('dashboard.tile.gaps.ctx', {none: S.byCoverage.none, partial: S.byCoverage.partial}) */'none ' + S.byCoverage.none + ' · partial ' + S.byCoverage.partial/*END*/);
tile(/*L10N tx('dashboard.tile.review') */'Review progress'/*END*/, pct(S.reviewed, S.totalSubcategories) + '%',
  /*L10N tx('dashboard.tile.review.ctx', {reviewed: S.reviewed, unreviewed: S.unreviewed, stale: S.stale}) */S.reviewed + ' reviewed · ' + S.unreviewed + ' unreviewed · ' + S.stale + ' stale'/*END*/);
tile(/*L10N tx('dashboard.tile.overrides') */'Human overrides'/*END*/, String(S.overridden), /*L10N tx('dashboard.tile.overrides.ctx') */'AI judgments changed by a current human review'/*END*/);
tile(/*L10N tx('dashboard.tile.downgrades') */'Verifier downgrades'/*END*/, String(S.downgradedByVerifier), /*L10N tx('dashboard.tile.downgrades.ctx') */'claims dropped for unverifiable quotes'/*END*/);
if (T) tile(/*L10N tx('dashboard.tile.target') */'Target met'/*END*/, T.summary.pctMet + '%',
  /*L10N tx('dashboard.tile.target.ctx', {met: T.summary.met, applicable: T.summary.applicable}) */T.summary.met + ' of ' + T.summary.applicable + ' applicable at target'/*END*/ +
  (T.summary.notApplicable ? /*L10N ' · ' + tx('dashboard.tile.target.outOfScope', {count: T.summary.notApplicable}) */' · ' + T.summary.notApplicable + ' out of scope'/*END*/ : ''));
/* The organization's own CSF Tier selection, when it recorded one. A Tier is
   chosen, never computed from the coverage figures beside it — the tile says so. */
if (T && T.tiers && (T.tiers.current || T.tiers.target)) {
  var tierCur = T.tiers.current, tierTgt = T.tiers.target;
  tile(/*L10N tx('dashboard.tile.tier') */'CSF Tier'/*END*/,
    tierCur && tierTgt ? tierCur.tier + ' → ' + tierTgt.tier : String((tierCur || tierTgt).tier),
    /*L10N (tierCur && tierTgt ? tx('dashboard.tile.tier.both', {current: txTier(tierCur), target: txTier(tierTgt)})
      : tierCur ? tx('dashboard.tile.tier.currentOnly', {current: txTier(tierCur)})
      : tx('dashboard.tile.tier.targetOnly', {target: txTier(tierTgt)})) +
    ' · ' + tx('dashboard.tile.tier.basis') */(tierCur && tierTgt ? 'Current ' + tierCur.name + ' → target ' + tierTgt.name
      : tierCur ? 'Current ' + tierCur.name + ' · target not recorded'
      : 'Target ' + tierTgt.name + ' · current not recorded') +
    ' · selected by the organization, not derived by this tool'/*END*/);
}
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
  var tbtn = /*L10N el('button','ghost',tx('dashboard.chart.viewTable')) */el('button','ghost','View as table')/*END*/;
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
    tbtn.textContent = /*L10N tx(mode === 'chart' ? 'dashboard.chart.viewTable' : 'dashboard.chart.viewChart') */mode === 'chart' ? 'View as table' : 'View as chart'/*END*/;
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
    /*L10N it.appendChild(el('span', null, txCovTitle(lv))); */it.appendChild(el('span', null, cap(lv)));/*END*/
    legend.appendChild(it);
  });
  body.appendChild(legend);

  var W = 760, gutter = 120, right = 46, barH = 20, rowH = 34, padTop = 6, axisH = 22;
  var H = padTop + fnRows.length * rowH + axisH;
  var maxTotal = Math.max.apply(null, fnRows.map(function(r){ return r.total; }).concat([1]));
  var plotW = W - gutter - right;
  var xs = function(v){ return gutter + v / maxTotal * plotW; };
  var svg = svgEl('svg', { class:'chart', viewBox:'0 0 ' + W + ' ' + H, role:'img',
    'aria-label':/*L10N tx('dashboard.coverage.aria') */'Stacked bars: coverage tier counts per CSF Function'/*END*/ });

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
    /*L10N lbl.textContent = txFn(row.fn); */lbl.textContent = row.fn;/*END*/
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

    var aria = /*L10N txFn(row.fn) + ': ' + LEVELS.map(function(lv){ return txCov(lv) + ' ' + row.counts[lv]; }).join(', ') +
      ', ' + tx('dashboard.coverage.rowTotal', {total: row.total}) */row.fn + ': ' + LEVELS.map(function(lv){ return lv + ' ' + row.counts[lv]; }).join(', ') +
      ', total ' + row.total/*END*/;
    var hit = svgEl('rect', { class:'row-hit', x:0, y:padTop + i * rowH, width:W,
      height:rowH, fill:'transparent', tabindex:'0', role:'img', 'aria-label':aria });
    function fill(evt){
      tt.textContent = '';
      /*L10N tt.appendChild(el('div','t', txFn(row.fn))); */tt.appendChild(el('div','t', row.fn));/*END*/
      LEVELS.forEach(function(lv){
        /*L10N ttRow(tt, cssVar(LEVEL_VAR[lv]), txCovTitle(lv), String(row.counts[lv])); */ttRow(tt, cssVar(LEVEL_VAR[lv]), cap(lv), String(row.counts[lv]));/*END*/
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
  /*L10N tr.appendChild(el('th', null, tx('dashboard.col.function'))); */tr.appendChild(el('th', null, 'Function'));/*END*/
  LEVELS.forEach(function(lv){ /*L10N var th = el('th','n',txCovTitle(lv)); */var th = el('th','n',cap(lv));/*END*/ tr.appendChild(th); });
  tr.appendChild(/*L10N el('th','n',tx('dashboard.col.total')) */el('th','n','Total')/*END*/);
  tr.appendChild(/*L10N el('th','n',tx('dashboard.col.pctAddressed')) */el('th','n','% addressed')/*END*/);
  t.appendChild(tr);
  fnRows.forEach(function(row){
    var r = el('tr');
    /*L10N r.appendChild(el('td', null, txFn(row.fn))); */r.appendChild(el('td', null, row.fn));/*END*/
    LEVELS.forEach(function(lv){ r.appendChild(el('td','n',String(row.counts[lv]))); });
    r.appendChild(el('td','n',String(row.total)));
    r.appendChild(el('td','n', pct(row.counts.substantial + row.counts.full, row.total) + '%'));
    t.appendChild(r);
  });
  body.appendChild(t);
}

chartCard(/*L10N tx('dashboard.coverage.title') */'Coverage by Function'/*END*/,
  /*L10N tx('dashboard.coverage.desc', {count: S.totalSubcategories}) */'How the ' + S.totalSubcategories + ' assessed outcomes distribute across the four coverage tiers.'/*END*/,
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
      'aria-label':/*L10N tx('dashboard.target.aria') */'Bars: percent of applicable outcomes at target, per CSF Function'/*END*/ });
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
      /*L10N lbl.textContent = txFn(f.function); */lbl.textContent = f.function;/*END*/
      grp.appendChild(lbl);
      var w = Math.max(xs(f.pctMet) - gutter, 0.5);
      grp.appendChild(svgEl('path', { class:'seg', d:barPath(gutter, y, w, barH), fill:cssVar('--accent') }));
      var vl = svgEl('text', { x:xs(f.pctMet) + 8, y:y + barH / 2 + 4, fill:cssVar('--ink'),
        style:'font-variant-numeric:tabular-nums' });
      vl.textContent = f.pctMet + '%';
      grp.appendChild(vl);

      var aria = /*L10N f.notApplicable
        ? tx('dashboard.target.rowAria.outOfScope', {'function': txFn(f.function), pct: f.pctMet, met: f.met, applicable: f.applicable, outOfScope: f.notApplicable})
        : tx('dashboard.target.rowAria', {'function': txFn(f.function), pct: f.pctMet, met: f.met, applicable: f.applicable}) */f.function + ': ' + f.pctMet + '% at target (' + f.met + ' of ' + f.applicable +
        ' applicable' + (f.notApplicable ? ', ' + f.notApplicable + ' out of scope' : '') + ')'/*END*/;
      var hit = svgEl('rect', { class:'row-hit', x:0, y:padTop + i * rowH, width:W,
        height:rowH, fill:'transparent', tabindex:'0', role:'img', 'aria-label':aria });
      function fill(evt){
        tt.textContent = '';
        /*L10N tt.appendChild(el('div','t', txFn(f.function))); */tt.appendChild(el('div','t', f.function));/*END*/
        ttRow(tt, cssVar('--accent'), /*L10N tx('dashboard.target.atTarget') */'At target'/*END*/, f.met + '/' + f.applicable);
        /*L10N ttRow(tt, cssVar('--grid'), tx('dashboard.target.unmet'), String(f.unmet)); */ttRow(tt, cssVar('--grid'), 'Unmet', String(f.unmet));/*END*/
        if (f.notApplicable) /*L10N ttRow(tt, cssVar('--grid'), tx('dashboard.outOfScope'), String(f.notApplicable)); */ttRow(tt, cssVar('--grid'), 'Out of scope', String(f.notApplicable));/*END*/
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
    /*L10N [tx('dashboard.col.function'),tx('dashboard.col.applicable'),tx('dashboard.col.met'),tx('dashboard.col.unmet'),tx('dashboard.outOfScope'),tx('dashboard.col.pctMet')] */['Function','Applicable','Met','Unmet','Out of scope','% met']/*END*/.forEach(function(h, i){
      tr.appendChild(el('th', i ? 'n' : null, h));
    });
    t.appendChild(tr);
    tf.forEach(function(f){
      var r = el('tr');
      /*L10N r.appendChild(el('td', null, txFn(f.function))); */r.appendChild(el('td', null, f.function));/*END*/
      [f.applicable, f.met, f.unmet, f.notApplicable].forEach(function(v){
        r.appendChild(el('td','n',String(v)));
      });
      r.appendChild(el('td','n', f.pctMet + '%'));
      t.appendChild(r);
    });
    body.appendChild(t);
  }
  chartCard(/*L10N tx('dashboard.target.title') */'Current vs Target'/*END*/,
    /*L10N tx('dashboard.target.desc', {baseline: txCov(T.baseline)}) */'Percent of applicable outcomes already at or above their target (baseline: ' + T.baseline + ').'/*END*/,
    renderTargetChart, renderTargetTable);
}

/* ----------------------- top remediation priorities ----------------------- */
if (T && DATA.planOrder.length) {
  var byId = {};
  T.entries.forEach(function(e){ byId[e.subcategory_id] = e; });
  var card = el('section','card');
  var head = el('div','head');
  var hd = el('div');
  hd.appendChild(el('h2', null, /*L10N tx('dashboard.plan.title') */'Top remediation priorities'/*END*/));
  hd.appendChild(el('p','desc',/*L10N tx('dashboard.plan.desc', {shown: Math.min(10, DATA.planOrder.length), total: DATA.planOrder.length}) */'First ' + Math.min(10, DATA.planOrder.length) + ' of ' +
    DATA.planOrder.length + ' unmet targets, in plan order — the full plan with NIST suggested actions is in remediation-plan.md.'/*END*/));
  head.appendChild(hd);
  card.appendChild(head);
  var ol = el('ol','plan');
  DATA.planOrder.slice(0, 10).forEach(function(id){
    var e = byId[id];
    var li = el('li');
    var meta = el('span','meta');
    var strong = el('strong', null, e.subcategory_id);
    meta.appendChild(strong);
    meta.appendChild(document.createTextNode(/*L10N ' — ' + txCov(e.current_coverage) + ' → ' + txCov(e.target_coverage) +
      ' · ' + txPriorityPhrase(e.priority) */' — ' + e.current_coverage + ' → ' + e.target_coverage +
      ' · ' + e.priority + ' priority'/*END*/));
    li.appendChild(meta);
    /*L10N li.appendChild(el('span','o', txOutcome(e))); */li.appendChild(el('span','o', e.outcome));/*END*/
    ol.appendChild(li);
  });
  card.appendChild(ol);
  wrap.appendChild(card);
}

/* -------------------------- evidence by document -------------------------- */
/* The reverse view: document -> outcomes it is quoted for. A plain table, not
   a chart: the content is a list of named documents with several figures each.
   Names are untrusted text and go through textContent like everything else. */
var DV = DATA.documentView;
if (DV) {
  var DV_LIMIT = 10;
  var dvSum = DV.summary;
  var dvShowAll = DV.documents.length <= DV_LIMIT;
  function dvCell(value){ return value == null ? '—' : String(value); }
  function dvCount(n, noun){ return n + ' ' + noun + (n === 1 ? '' : 's'); }
  var dvCard = el('section','card');
  var dvHead = el('div','head');
  var dvHd = el('div');
  dvHd.appendChild(el('h2', null, /*L10N tx('dashboard.docs.title') */'Evidence by document'/*END*/));
  dvHd.appendChild(el('p','desc',
    /*L10N (dvSum.documentsIngested == null
      ? txCount('dashboard.docs.summary.reconstructed', dvSum.documents)
      : dvSum.documentNames === dvSum.documentsIngested
        ? txCount('dashboard.docs.summary.ingested', dvSum.documentsIngested)
        : txCount('dashboard.docs.summary.shared', dvSum.documentNames, {files: dvSum.documentsIngested})) +
    ' · ' + tx('dashboard.docs.summary.quoted', {count: dvSum.documentsQuoted}) +
    ' · ' + tx('dashboard.docs.summary.neverQuoted', {count: dvSum.documentsNeverQuoted}) +
    (dvSum.documentsUnlisted ? ' · ' + tx('dashboard.docs.summary.unlisted', {count: dvSum.documentsUnlisted}) : '') + ' · ' +
    tx('dashboard.docs.summary.outcomes', {count: dvSum.outcomesWithQuotes, total: dvSum.outcomes}) + ' ' +
    tx('dashboard.docs.summary.detail') */(dvSum.documentsIngested == null
      ? dvCount(dvSum.documents, 'document') + ' seen in the assessment (list reconstructed)'
      : dvSum.documentNames === dvSum.documentsIngested
        ? dvCount(dvSum.documentsIngested, 'document') + ' ingested'
        : dvSum.documentsIngested + ' files ingested under ' + dvCount(dvSum.documentNames, 'distinct name')) +
    ' · ' + dvSum.documentsQuoted + ' quoted at least once · ' + dvSum.documentsNeverQuoted + ' never quoted' +
    (dvSum.documentsUnlisted ? ' · ' + dvSum.documentsUnlisted + ' not in the ingest record' : '') + ' · ' +
    dvSum.outcomesWithQuotes + ' of ' + dvSum.outcomes + ' outcomes have a verified quote. ' +
    'Per-document detail is in evidence-by-document.md.'/*END*/));
  dvHead.appendChild(dvHd);
  var dvBtn = null;
  if (!dvShowAll) {
    dvBtn = el('button','ghost','');
    dvBtn.type = 'button';
    dvHead.appendChild(dvBtn);
  }
  dvCard.appendChild(dvHead);
  /*L10N (I18N.documentNotes || DV.notes).forEach( */DV.notes.forEach(/*END*/function(note){ dvCard.appendChild(el('p','desc',/*L10N tx('dashboard.docs.note', {note: note}) */'Note: ' + note/*END*/)); });
  var dvBody = el('div');
  dvBody.style.overflowX = 'auto';
  if (DV.notes.length) dvBody.style.marginTop = '10px';
  dvCard.appendChild(dvBody);
  var dvFoot = el('p','desc',
    /*L10N tx('dashboard.docs.footer') */'A document that is never quoted is not thereby irrelevant: no passage from it was selected as verbatim evidence for a CSF outcome in this assessment.'/*END*/);
  dvFoot.style.marginTop = '10px';
  dvCard.appendChild(dvFoot);

  function renderDocuments(){
    dvBody.textContent = '';
    var t = el('table','tbl');
    var tr = el('tr');
    /*L10N [tx('dashboard.docs.col.document'),tx('dashboard.docs.col.chunks'),tx('dashboard.docs.col.retrievedFor'),tx('dashboard.docs.col.quotedFor'),tx('dashboard.docs.col.quotes'),tx('dashboard.docs.col.coverage'),tx('dashboard.docs.col.functions')] */['Document','Chunks','Retrieved for','Quoted for','Quotes','Coverage of quoted outcomes','Functions']/*END*/.forEach(function(h, i){
      tr.appendChild(el('th', i >= 1 && i <= 4 ? 'n' : null, h));
    });
    t.appendChild(tr);
    (dvShowAll ? DV.documents : DV.documents.slice(0, DV_LIMIT)).forEach(function(d){
      var r = el('tr');
      r.appendChild(el('td', null, d.source_file +
        (d.files > 1 ? /*L10N ' (' + tx('dashboard.docs.sharedName', {files: d.files}) + ')' */' (' + d.files + ' files share this name)'/*END*/ : '') +
        (d.listed ? '' : /*L10N ' (' + tx('dashboard.docs.unlisted') + ')' */' (not in the ingest record)'/*END*/)));
      r.appendChild(el('td','n', dvCell(d.chunks)));
      r.appendChild(el('td','n', dvCell(d.retrieved_for)));
      r.appendChild(el('td','n', String(d.cited_in.length)));
      r.appendChild(el('td','n', String(d.quotes)));
      var cov = LEVELS.filter(function(lv){ return d.cited_by_coverage[lv] > 0; })
        .map(function(lv){ /*L10N return txCov(lv) + ' ' + d.cited_by_coverage[lv]; */return lv + ' ' + d.cited_by_coverage[lv];/*END*/ });
      r.appendChild(el('td', null, cov.length ? cov.join(' · ') : '—'));
      r.appendChild(el('td', null, d.functions.length ? /*L10N d.functions.map(txFn).join(', ') */d.functions.join(', ')/*END*/ : '—'));
      t.appendChild(r);
    });
    dvBody.appendChild(t);
    if (dvBtn) {
      dvBtn.textContent = dvShowAll
        ? /*L10N tx('dashboard.docs.showFirst', {count: DV_LIMIT}) */'Show the first ' + DV_LIMIT/*END*/
        : /*L10N tx('dashboard.docs.showAll', {count: DV.documents.length}) */'Show all ' + DV.documents.length + ' documents'/*END*/;
      dvBtn.setAttribute('aria-pressed', String(dvShowAll));
    }
  }
  if (dvBtn) dvBtn.addEventListener('click', function(){ dvShowAll = !dvShowAll; renderDocuments(); });
  renderDocuments();
  wrap.appendChild(dvCard);
}

/* --------------------------- subcategory explorer ------------------------- */
var targetById = {};
if (T) T.entries.forEach(function(e){ targetById[e.subcategory_id] = e; });

var xcard = el('section','card');
var xhead = el('div','head');
var xhd = el('div');
xhd.appendChild(el('h2', null, /*L10N tx('dashboard.explorer.title') */'All subcategories'/*END*/));
xhd.appendChild(el('p','desc',/*L10N tx(T ? 'dashboard.explorer.desc.target' : 'dashboard.explorer.desc') */'Every assessed outcome with its verified evidence. Click a row for the rationale, quotes' +
  (T ? ', and NIST suggested actions.' : '.')/*END*/));
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
quickFilters.setAttribute('aria-label',/*L10N tx('dashboard.quick.label') */'Quick filters'/*END*/);
quickFilters.appendChild(el('span','qlbl',/*L10N tx('dashboard.quick.label') */'Quick filters'/*END*/));
function addQuickFilter(mode, label){
  var count = P.subcategories.filter(function(e){ return quickMatches(mode, e); }).length;
  var b = el('button','filter-chip',label + ' · ' + count);
  b.type = 'button';
  b.setAttribute('aria-pressed','false');
  b.setAttribute('aria-label',/*L10N tx('dashboard.quick.aria', {label: label, count: count}) */label + ', ' + count + ' outcomes'/*END*/);
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
addQuickFilter('attention',/*L10N tx('dashboard.quick.attention') */'Needs attention'/*END*/);
/*L10N addQuickFilter('gaps',tx('dashboard.quick.gaps')); */addQuickFilter('gaps','Gaps');/*END*/
addQuickFilter('review',/*L10N tx('dashboard.quick.review') */'Review pending'/*END*/);
if (T) /*L10N addQuickFilter('unmet',tx('dashboard.quick.unmet')); */addQuickFilter('unmet','Unmet target');/*END*/
xcard.appendChild(quickFilters);

var filters = el('div','filters');
var search = document.createElement('input');
search.type = 'search';
search.placeholder = /*L10N tx('dashboard.search.placeholder') */'Search outcomes, rationale, notes, sources, quotes…'/*END*/;
search.setAttribute('aria-label',/*L10N tx('dashboard.search.aria') */'Search subcategories and evidence'/*END*/);
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
var fFn = /*L10N sel(tx('dashboard.filter.function'), [['',tx('dashboard.filter.function.all')]].concat(DATA.functionOrder.map(function(f){ return [f, txFn(f)]; }))) */sel('Function', [['','All Functions']].concat(DATA.functionOrder.map(function(f){ return [f, f]; })))/*END*/;
var fCov = /*L10N sel(tx('dashboard.filter.coverage'), [['',tx('dashboard.filter.coverage.all')],['gaps',tx('dashboard.filter.coverage.gaps')]].concat(LEVELS.map(function(l){ return [l, txCovTitle(l)]; }))) */sel('Coverage', [['','All coverage'],['gaps','Gaps (none + partial)']].concat(LEVELS.map(function(l){ return [l, cap(l)]; })))/*END*/;
var fRev = /*L10N sel(tx('dashboard.filter.review'), [['',tx('dashboard.filter.review.all')],['reviewed',tx('review.title.reviewed')],['unreviewed',tx('review.title.unreviewed')],['stale',tx('review.title.stale')]]) */sel('Review status', [['','All review states'],['reviewed','Reviewed'],['unreviewed','Unreviewed'],['stale','Stale']])/*END*/;
var fTgt = null;
if (T) fTgt = /*L10N sel(tx('dashboard.filter.target'), [['',tx('dashboard.filter.target.all')],['unmet',tx('dashboard.filter.target.unmet')],['met',tx('dashboard.filter.target.met')],['na',tx('dashboard.outOfScope')]]) */sel('Target status', [['','All vs target'],['unmet','Unmet target'],['met','At/above target'],['na','Out of scope']])/*END*/;
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
  ];/*L10N
  parts.push(txOutcome(e), txCategory(e), txFn(e.function), txCov(e.coverage), txFixed(e.rationale)); *//*END*/
  (e.evidence || []).forEach(function(ev){ parts.push(ev.source_file, ev.quote); });
  var tgt = targetById[e.subcategory_id];
  if (tgt) {
    parts.push(tgt.target_coverage, tgt.priority, tgt.note);
    (tgt.implementation_examples || []).forEach(function(ex){ parts.push(ex); });
  }
  if (XW) XW.crosswalks.forEach(function(cw){
    xwIds(cw, e).forEach(function(group){
      group.ids.forEach(function(id){ parts.push(id); });
    });
  });
  searchIndex[e.subcategory_id] = parts.filter(function(value){
    return value != null && value !== '';
  }).join(' ').toLowerCase();
});

function coverageChip(cov){
  var c = el('span','chip');
  var d = el('span','dot');
  d.style.background = cssVar(LEVEL_VAR[cov]);
  c.appendChild(d);
  /*L10N c.appendChild(el('span', null, txCov(cov))); */c.appendChild(el('span', null, cov));/*END*/
  return c;
}
function reviewBadge(st){
  var b = el('span','badge');
  var d = el('span','st');
  d.style.background = cssVar(REV_COLOR[st] || '--muted');
  b.appendChild(d);
  b.appendChild(el('span', null, /*L10N REV_ICON[st] + ' ' + txReview(st) */REV_ICON[st] + ' ' + st/*END*/));
  return b;
}

function detailCell(e, t, cols){
  var td = document.createElement('td');
  td.colSpan = cols;
  var box = el('div','det');
  /*L10N box.appendChild(el('p','out', txOutcome(e))); */box.appendChild(el('p','out', e.outcome));/*END*/
  /*L10N box.appendChild(el('p','rat', txFixed(e.rationale))); */box.appendChild(el('p','rat', e.rationale));/*END*/
  if (e.human_coverage != null) {
    box.appendChild(el('p','rat',/*L10N e.reviewer
      ? tx('dashboard.detail.override.by', {ai: txCov(e.ai_coverage), human: txCov(e.human_coverage), reviewer: e.reviewer})
      : tx('dashboard.detail.override', {ai: txCov(e.ai_coverage), human: txCov(e.human_coverage)}) */'Human override: AI proposed ' + e.ai_coverage +
      '; reviewer set ' + e.human_coverage + (e.reviewer ? ' (' + e.reviewer + ')' : '') + '.'/*END*/));
  }
  if (e.reviewer_notes) box.appendChild(el('p','rat',/*L10N tx('dashboard.detail.reviewerNote', {note: e.reviewer_notes}) */'Reviewer note: ' + e.reviewer_notes/*END*/));
  if (t && t.note) box.appendChild(el('p','rat',/*L10N tx('dashboard.detail.targetNote', {note: t.note}) */'Target note: ' + t.note/*END*/));

  box.appendChild(el('h4', null, /*L10N tx('dashboard.detail.evidence', {count: e.evidence.length}) */'Verified evidence (' + e.evidence.length + ')'/*END*/));
  if (!e.evidence.length) {
    box.appendChild(el('p','rat',/*L10N tx('dashboard.detail.none') */'(none)'/*END*/));
  } else {
    e.evidence.forEach(function(ev){
      var q = el('div','q');
      q.appendChild(el('span','src', ev.source_file + (ev.page ? /*L10N ', ' + tx('common.page', {page: ev.page}) */', p.' + ev.page/*END*/ : '')));
      q.appendChild(document.createTextNode('“' + ev.quote + '”'));
      box.appendChild(q);
    });
  }
  if (t && t.implementation_examples && t.implementation_examples.length) {
    box.appendChild(el('h4', null, /*L10N tx('dashboard.detail.examples') */'NIST implementation examples (suggested actions)'/*END*/));/*L10N
    if (I18N.examplesNote) box.appendChild(el('p','xref', I18N.examplesNote)); *//*END*/
    var ol = document.createElement('ol');
    t.implementation_examples.forEach(function(ex){ ol.appendChild(el('li', null, ex)); });
    box.appendChild(ol);
  }
  if (XW) {
    box.appendChild(el('h4', null, /*L10N tx('dashboard.detail.references') */'Related references (informative)'/*END*/));
    box.appendChild(el('p','xref',/*L10N tx('dashboard.detail.references.desc') */'Identifiers that the selected mappings relate to this outcome. Related is not equivalent: ' +
      'coverage of this outcome is not a determination of conformance with any of them.'/*END*/));
    var anyRef = false;
    var whole = [];
    XW.crosswalks.forEach(function(cw){
      var name = cw.framework + (cw.thirdParty ? /*L10N ' (' + tx('crosswalk.thirdParty.label') + ')' */' (third-party mapping)'/*END*/ : '');
      var groups = xwIds(cw, e);
      if (groups[0].ids.length) {
        anyRef = true;
        var line = el('p','xref');
        line.appendChild(el('strong', null, name + ': '));
        line.appendChild(document.createTextNode(groups[0].ids.join(', ')));
        box.appendChild(line);
      }
      var above = groups.slice(1).filter(function(g){ return g.ids.length; }).map(function(g){
        return g.label + ': ' + g.ids.join(', ');
      });
      if (above.length) whole.push(name + ' — ' + above.join('; '));
    });
    if (!anyRef) box.appendChild(el('p','xref',/*L10N tx('dashboard.detail.references.none') */'(none recorded for this outcome itself in the selected mappings)'/*END*/));
    if (whole.length) {
      var wline = el('p','xref');
      wline.appendChild(el('strong', null, /*L10N tx('dashboard.detail.references.whole') + ' ' */'Related to its whole Category or Function, not to this outcome alone: '/*END*/));
      wline.appendChild(document.createTextNode(whole.join(' · ')));
      box.appendChild(wline);
    }
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
  countLbl.textContent = /*L10N tx('dashboard.explorer.count', {shown: rows.length, total: P.subcategories.length}) */rows.length + ' of ' + P.subcategories.length/*END*/;

  var t = el('table','tbl');
  var tr = el('tr');
  var heads = /*L10N ['', tx('dashboard.col.id'), tx('dashboard.col.function'), tx('dashboard.col.coverage'), tx('dashboard.col.confidence'), tx('dashboard.col.review')] */['', 'ID', 'Function', 'Coverage', 'Conf.', 'Review']/*END*/;
  if (T) heads = heads.concat(/*L10N [tx('dashboard.col.target'), tx('dashboard.col.priority')] */['Target', 'Priority']/*END*/);
  heads = heads.concat(/*L10N [tx('dashboard.col.evidence')] */['Evidence']/*END*/);
  heads.forEach(function(h, i){
    tr.appendChild(el('th', /*L10N (h === tx('dashboard.col.confidence') || h === tx('dashboard.col.evidence')) */(h === 'Conf.' || h === 'Evidence')/*END*/ ? 'n' : null, h));
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
    /*L10N r.appendChild(el('td', null, txFn(e.function))); */r.appendChild(el('td', null, e.function));/*END*/
    var covTd = document.createElement('td');
    covTd.appendChild(coverageChip(e.coverage));
    if (e.human_coverage != null) {
      var overrideTag = /*L10N el('span','override-tag',tx('dashboard.override.tag')) */el('span','override-tag','human')/*END*/;
      overrideTag.setAttribute('title',/*L10N tx('dashboard.override.title', {from: txCov(e.ai_coverage), to: txCov(e.human_coverage)}) */'Human override: ' + e.ai_coverage + ' → ' + e.human_coverage/*END*/);
      overrideTag.setAttribute('aria-label',/*L10N tx('dashboard.override.aria', {from: txCov(e.ai_coverage), to: txCov(e.human_coverage)}) */'Human override from ' + e.ai_coverage + ' to ' + e.human_coverage/*END*/);
      covTd.appendChild(overrideTag);
    }
    r.appendChild(covTd);
    r.appendChild(el('td','n', e.confidence.toFixed(2)));
    var revTd = document.createElement('td');
    revTd.appendChild(reviewBadge(e.review_status));
    r.appendChild(revTd);
    if (T) {
      var tv = tgt ? /*L10N (tgt.not_applicable ? tx('dashboard.target.na') : txCov(tgt.target_coverage) + (tgt.met ? ' ✓' : '')) */(tgt.not_applicable ? 'n/a' : tgt.target_coverage + (tgt.met ? ' ✓' : ''))/*END*/ : '—';
      r.appendChild(el('td', null, tv));
      r.appendChild(el('td', null, /*L10N tgt && tgt.priority ? txPriority(tgt.priority) : '—' */tgt && tgt.priority ? tgt.priority : '—'/*END*/));
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
/*L10N foot.appendChild(el('div', null, txFixed(P.disclaimer))); */foot.appendChild(el('div', null, P.disclaimer));/*END*//*L10N
if (I18N.frameworkNote) foot.appendChild(el('div', null, I18N.frameworkNote)); *//*END*/
if (T) foot.appendChild(el('div', null,
  /*L10N (T.description
    ? tx('dashboard.footer.target.described', {baseline: txCov(T.baseline), description: T.description})
    : tx('dashboard.footer.target', {baseline: txCov(T.baseline)})) */'Target profile: baseline "' + T.baseline + '"' + (T.description ? ' — ' + T.description : '') +
  '. Targets, priorities, and scoping are human decisions; suggested actions are official NIST CSF 2.0 Implementation Examples (public domain).'/*END*/));
if (XW) foot.appendChild(el('div', null,
  /*L10N tx('dashboard.footer.crosswalk', {source: XW.source, retrievedAt: XW.retrievedAt}) */'Related references: identifiers only, as each selected mapping records them for a Subcategory, a whole ' +
  'Category or a whole Function. Mapping source: ' + XW.source + ' (retrieved ' + XW.retrievedAt + '). A mapping records a relationship, ' +
  'not equivalence or conformance. Search also matches these identifiers, as plain text; see crosswalk.md for details.'/*END*/));
foot.appendChild(el('div', null,
  /*L10N tx('dashboard.footer.generated', {tool: (P.tool ? P.tool.name + ' v' + P.tool.version : 'csf-tool')}) */'Self-contained report generated by ' + (P.tool ? P.tool.name + ' v' + P.tool.version : 'csf-tool') +
  ' — no network access is required or used by this page.'/*END*/));
wrap.appendChild(foot);
})();
`;

/* ------------------------- the two forms of the script ---------------------- */

// `/*L10N <localized expression> */<English expression>/*END*/` — see the
// module comment. The localized side never contains "*/", so the first one
// after "L10N" ends it, however the marker is spaced.
const L10N_MARKER = /\/\*L10N\s([\s\S]*?)\*\/([\s\S]*?)\/\*END\*\//g;
// Where the localized form defines its lookup functions; empty in English.
const L10N_HELPERS_SLOT = '/*L10N-HELPERS*/';

// The lookup functions of the localized form. Same rules as the rest of the
// script: ES5, no template literals, and nothing here ever builds HTML — each
// function returns a string that the caller writes with textContent. A message
// or label the page was not given is shown as its key or its raw value rather
// than failing: one untranslated word must not blank the whole dashboard.
const L10N_HELPERS = String.raw`
/* -------------------------- report language (i18n) ------------------------ */
var I18N = DATA.i18n || {};
function txOwn(map, key){
  return map && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
}
/* The text of a message, with each {name} replaced by params.name. */
function tx(key, params){
  var text = txOwn(I18N.strings, key);
  if (text == null) return key;
  return text.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, function(match, name){
    return params && Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match;
  });
}
/* A message with .one and .other forms, chosen by the count (also passed as {count}). */
function txCount(key, count, params){
  var all = { count: count };
  for (var name in params) all[name] = params[name];
  return tx(key + (count === 1 ? '.one' : '.other'), all);
}
/* A sentence the data carries in English, in the language of the page when the
   tool knows it; also when it only leads the text (the rest is left as written). */
function txFixed(text){
  var known = txOwn(I18N.fixed, text);
  if (known != null || typeof text !== 'string') return known == null ? text : known;
  var leads = I18N.fixedPrefixes || [];
  for (var i = 0; i < leads.length; i++) {
    if (text.indexOf(leads[i][0]) === 0) return leads[i][1] + text.slice(leads[i][0].length);
  }
  return text;
}
/* A data value (coverage level, review state, priority) as its display label. */
function txLabel(labels, value){
  var known = txOwn(labels, value);
  return known == null ? value : known;
}
var TX_COVERAGE = { none: tx('coverage.none'), partial: tx('coverage.partial'),
  substantial: tx('coverage.substantial'), full: tx('coverage.full') };
var TX_COVERAGE_TITLE = { none: tx('coverage.title.none'), partial: tx('coverage.title.partial'),
  substantial: tx('coverage.title.substantial'), full: tx('coverage.title.full') };
var TX_REVIEW = { reviewed: tx('review.reviewed'), unreviewed: tx('review.unreviewed'), stale: tx('review.stale') };
var TX_PRIORITY = { high: tx('priority.high'), medium: tx('priority.medium'), low: tx('priority.low') };
var TX_PRIORITY_PHRASE = { high: tx('dashboard.plan.priority.high'), medium: tx('dashboard.plan.priority.medium'),
  low: tx('dashboard.plan.priority.low') };
var TX_TIER = { 1: tx('tier.name.1'), 2: tx('tier.name.2'), 3: tx('tier.name.3'), 4: tx('tier.name.4') };
function txCov(value){ return txLabel(TX_COVERAGE, value); }
function txCovTitle(value){ return txLabel(TX_COVERAGE_TITLE, value); }
function txReview(value){ return txLabel(TX_REVIEW, value); }
function txPriority(value){ return txLabel(TX_PRIORITY, value); }
function txPriorityPhrase(value){
  var known = txOwn(TX_PRIORITY_PHRASE, value);
  return known == null ? tx('dashboard.plan.priorityOf', {priority: value}) : known;
}
/* The name of a recorded Tier ({tier, name}); the official name when the page has no other. */
function txTier(tier){
  var known = txOwn(TX_TIER, tier.tier);
  return known == null ? tier.name : known;
}
/* Framework text from the published translation of the Core; the English text
   of the profile for every identifier that translation does not cover. */
var TX_CSF = I18N.csf || {};
function txFn(name){
  var known = txOwn(TX_CSF.functions, name);
  return known == null ? name : known;
}
function txOutcome(e){
  var known = txOwn(TX_CSF.outcomes, e.subcategory_id);
  return known == null ? e.outcome : known;
}
function txCategory(e){
  var known = txOwn(TX_CSF.categories, e.subcategory_id);
  return known == null ? e.category : known;
}`;

// Replacer functions throughout: the pieces are code, and "$&" in one of them
// must stay "$&".

/** The script of an English page: the template with its English expressions in place. */
const ENGLISH_APP_JS = APP_TEMPLATE.replace(L10N_MARKER, (_marker, _localized, english) => english).replace(
  L10N_HELPERS_SLOT,
  () => '',
);

/** The script of a page in another language: the alternative expressions, plus their lookup functions. */
const LOCALIZED_APP_JS = APP_TEMPLATE.replace(L10N_MARKER, (_marker, localized) => localized.trimEnd()).replace(
  L10N_HELPERS_SLOT,
  () => L10N_HELPERS,
);

/** The static parts of the English page, exactly as they have always been written. */
const ENGLISH_PAGE = {
  lang: 'en',
  title: 'NIST CSF 2.0 — Assessment Dashboard',
  noscript: `This dashboard needs JavaScript. The same data is in
<code>current-profile.json</code>, <code>gap-analysis.md</code>, and <code>evidence-map.csv</code>
next to this file.`,
  script: ENGLISH_APP_JS,
};
