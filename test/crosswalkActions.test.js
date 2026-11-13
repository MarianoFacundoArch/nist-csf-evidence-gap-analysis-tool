import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildContext } from '../src/core/context.js';
import { parseCliArgs, HELP_TEXT } from '../src/cli/flags.js';
import { ingest } from '../src/actions/ingest.js';
import { analyze } from '../src/actions/analyze.js';
import { report } from '../src/actions/report.js';
import { crosswalk } from '../src/actions/crosswalk.js';
import { isNistHostedUrl } from '../src/crosswalk/crosswalk.schema.js';
import { fileExists } from '../src/util/fsx.js';
import { CrosswalkDataError } from '../src/core/errors.js';

// End-to-end checks through the same entry points the CLI and the menu use:
// the selection travels flag/config -> context -> report stage -> files, and
// the `crosswalk` command describes exactly what the report stage will use.

// A non-existent config path keeps these tests independent of any
// csf-tool.config.json in the working directory.
const NOFILE = { configPath: 'this-file-does-not-exist.json' };

// The shipped data: the default set, and the two third-party mappings that
// are only included when asked for.
const DEFAULT_IDS = [
  'sp800-53-r5', 'sp800-171-r3', 'sp800-218-ssdf', 'csf-1.1', 'cis-v8.1',
  'csa-ccm-v4', 'cri-profile-v2', 'scf-2024.4',
];
const THIRD_PARTY_IDS = ['iso27001-2022', 'pci-dss-4.0.1'];
const SHIPPED_IDS = [...DEFAULT_IDS, ...THIRD_PARTY_IDS];

function quietContext(ctx, messages = []) {
  ctx.logger = {
    level: 'info',
    debug: () => {},
    info: (...args) => messages.push(args.join(' ')),
    warn: (...args) => messages.push(`warning: ${args.join(' ')}`),
    error: (...args) => messages.push(`error: ${args.join(' ')}`),
  };
  ctx.ui = {
    isInteractive: false,
    info: (m) => messages.push(m),
    warn: (m) => messages.push(m),
    success: (m) => messages.push(m),
    note: (title, body) => messages.push(`${title}\n${body}`),
  };
  return messages;
}

/** Distinct values of the first CSV column, in file order (header skipped). */
function crosswalkIdsInCsv(csv) {
  const ids = [];
  for (const line of csv.split('\r\n').slice(1)) {
    const id = line.split(',')[0];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function embeddedData(html) {
  const m = /<script id="csf-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'embedded data block present');
  return JSON.parse(m[1]);
}

test('--crosswalk: default, all, none, and lists of ids', () => {
  const selection = (...argv) => {
    const parsed = parseCliArgs(['report', ...argv]);
    assert.equal(parsed.error, null);
    return parsed.overrides.report?.crosswalks;
  };
  // Not passed: the flag sets nothing, so the config file (or the built-in default) decides.
  assert.equal(parseCliArgs(['report']).overrides.report, undefined);
  // "default" is an explicit null: it also overrides a list in the config file.
  assert.equal(selection('--crosswalk', 'default'), null);
  assert.equal(selection('--crosswalk', 'DEFAULT'), null);
  // "all" stays a selection — the one that includes third-party mappings.
  assert.deepEqual(selection('--crosswalk', 'all'), ['all']);
  assert.deepEqual(selection('--crosswalk', ' All '), ['all']);
  assert.deepEqual(selection('--crosswalk', 'none'), []);
  assert.deepEqual(selection('--crosswalk', ''), []);
  assert.deepEqual(selection('--crosswalk', 'cis-v8.1, iso27001-2022,'), ['cis-v8.1', 'iso27001-2022']);
  // Keywords inside a list are left for the selection to interpret.
  assert.deepEqual(selection('--crosswalk', 'default,pci-dss-4.0.1'), ['default', 'pci-dss-4.0.1']);
  assert.match(HELP_TEXT, /--crosswalk <ids>\s+Crosswalks to include in reports: comma-separated ids,\n\s+"default" \(all except third-party mappings\), "all"\n\s+\(third-party mappings included\), or "none"/);
});

test('report: the crosswalk selection works end-to-end from --crosswalk and from the config file', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'csf-tool-crosswalk-'));
  const base = {
    ...NOFILE,
    docsPath: 'examples/sample-docs/data-protection-note.txt',
    workDir,
    embeddings: { provider: 'mock', model: 'mock' },
    llm: { provider: 'mock', model: 'mock' },
    fixedNow: '2026-07-23T12:00:00.000Z',
  };
  const contextFor = async (overrides) => {
    const ctx = await buildContext({ ...base, ...overrides });
    const messages = quietContext(ctx);
    return { ctx, messages };
  };
  const flags = (...argv) => {
    const parsed = parseCliArgs(['report', ...argv]);
    assert.equal(parsed.error, null);
    return parsed.overrides;
  };
  const csvOf = (ctx) => readFile(ctx.paths.crosswalkCsv, 'utf8');

  try {
    // 1) Nothing configured: the default set — every mapping except third-party ones.
    const byDefault = await contextFor({});
    assert.equal(byDefault.ctx.config.report.crosswalks, null);
    await ingest(byDefault.ctx);
    await analyze(byDefault.ctx);
    const first = await report(byDefault.ctx);
    assert.equal(first.crosswalkCsvPath, byDefault.ctx.paths.crosswalkCsv);
    assert.equal(first.crosswalkReportPath, byDefault.ctx.paths.crosswalkReport);
    const defaultCsv = await csvOf(byDefault.ctx);
    assert.deepEqual(crosswalkIdsInCsv(defaultCsv), DEFAULT_IDS);
    const defaultMd = await readFile(byDefault.ctx.paths.crosswalkReport, 'utf8');
    assert.ok(defaultMd.includes('- Crosswalks included: 8\n'));
    assert.ok(!/third-party/i.test(defaultMd), 'no third-party mapping, and no mention of one, by default');
    assert.ok(byDefault.messages.some((m) => /crosswalks: 8 mapping\(s\) to other frameworks \(related outcomes, not conformance\)/.test(m)));
    // A reference related only to a whole Category is in the deliverables:
    // one Category row, no coverage value, and its own row in the second table.
    assert.ok(defaultCsv.includes('\r\nsp800-53-r5,NIST SP 800-53 Rev. 5.2.0,sp800-53-r5:IR-09,IR-09,category,RS.MA,RESPOND,Incident Management (RS.MA),,,National Institute of Standards and Technology,'));
    assert.equal(defaultCsv.split(',sp800-53-r5:IR-09,').length - 1, 1);
    assert.match(defaultMd, /\n\| IR-09 \| Category: Incident Management \(RS\.MA\) \| 5 outcomes: [^|]+ \|\n/);
    // The three kinds of row are all present and labeled.
    for (const level of ['subcategory', 'category', 'function']) assert.ok(defaultCsv.includes(`,${level},`), `${level} rows`);
    // Links in the deliverables: NIST-hosted only.
    for (const link of defaultMd.match(/<https?:[^>]+>/g)) assert.equal(isNistHostedUrl(link.slice(1, -1)), true, link);
    // The Current Profile itself carries no crosswalk fields.
    assert.ok(!(await readFile(byDefault.ctx.paths.currentProfile, 'utf8')).includes('crosswalk'));

    // 2) A comma-separated flag selects exactly those crosswalks — in data-file order.
    const listed = await contextFor(flags('--crosswalk', 'cis-v8.1,sp800-171-r3'));
    assert.deepEqual(listed.ctx.config.report.crosswalks, ['cis-v8.1', 'sp800-171-r3']);
    await report(listed.ctx);
    assert.deepEqual(crosswalkIdsInCsv(await csvOf(listed.ctx)), ['sp800-171-r3', 'cis-v8.1']);
    const md = await readFile(listed.ctx.paths.crosswalkReport, 'utf8');
    assert.match(md, /- Crosswalks included: 2\n/);
    assert.match(md, /## NIST SP 800-171 Rev\. 3\n[\s\S]*## CIS Critical Security Controls v8\.1\n/);
    assert.ok(!md.includes('SP 800-53'));
    const data = embeddedData(await readFile(listed.ctx.paths.dashboard, 'utf8'));
    assert.deepEqual(data.crosswalk.crosswalks.map((c) => c.id), ['sp800-171-r3', 'cis-v8.1']);

    // 3) A third-party mapping has to be named — here by the config file, without any flag.
    const configPath = join(workDir, 'csf-tool.config.json');
    await writeFile(configPath, JSON.stringify({ report: { crosswalks: ['pci-dss-4.0.1'] } }));
    const fromFile = await contextFor({ configPath });
    assert.deepEqual(fromFile.ctx.config.report.crosswalks, ['pci-dss-4.0.1']);
    await report(fromFile.ctx);
    assert.deepEqual(crosswalkIdsInCsv(await csvOf(fromFile.ctx)), ['pci-dss-4.0.1']);
    const thirdParty = await readFile(fromFile.ctx.paths.crosswalkReport, 'utf8');
    assert.match(thirdParty, /## PCI DSS v4\.0\.1 \(third-party mapping\)/);
    assert.match(thirdParty, /\*\*Third-party mapping — not produced by the framework's publisher\.\*\* It is reproduced as published/);
    assert.ok(!thirdParty.includes('Mapping document'), 'no link to a page NIST does not host');
    assert.ok((await csvOf(fromFile.ctx)).includes(',Independent,2025-12-23,yes\r\n'));

    // 4) Flags outrank the file. "default" goes back to the default set...
    const reset = await contextFor({ configPath, ...flags('--crosswalk', 'default') });
    assert.equal(reset.ctx.config.report.crosswalks, null);
    await report(reset.ctx);
    assert.deepEqual(crosswalkIdsInCsv(await csvOf(reset.ctx)), DEFAULT_IDS);

    // ...the default set plus one third-party mapping can be asked for by name...
    const plus = await contextFor(flags('--crosswalk', 'default,iso27001-2022'));
    await report(plus.ctx);
    assert.deepEqual(crosswalkIdsInCsv(await csvOf(plus.ctx)), [...DEFAULT_IDS, 'iso27001-2022']);

    // ...and "all" includes every crosswalk in the data file, third-party ones too.
    const all = await contextFor({ configPath, ...flags('--crosswalk', 'all') });
    assert.deepEqual(all.ctx.config.report.crosswalks, ['all']);
    await report(all.ctx);
    assert.deepEqual(crosswalkIdsInCsv(await csvOf(all.ctx)), SHIPPED_IDS);
    assert.ok(all.messages.some((m) => /crosswalks: 10 mapping\(s\)/.test(m)));

    // 5) An unknown id is reported once and ignored...
    const typo = await contextFor(flags('--crosswalk', 'cis-v8.1,iso27001'));
    await report(typo.ctx);
    assert.deepEqual(crosswalkIdsInCsv(await csvOf(typo.ctx)), ['cis-v8.1']);
    const warnings = typo.messages.filter((m) => m.includes('Unknown crosswalk id(s) ignored: iso27001.'));
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('iso27001-2022'), 'the warning lists the known ids');

    // 6) ...and "none" removes the deliverables of the earlier runs.
    const none = await contextFor({ configPath, ...flags('--crosswalk', 'none') });
    assert.deepEqual(none.ctx.config.report.crosswalks, []);
    const removed = await report(none.ctx);
    assert.equal(removed.crosswalkCsvPath, null);
    assert.equal(removed.crosswalkReportPath, null);
    assert.equal(await fileExists(none.ctx.paths.crosswalkCsv), false);
    assert.equal(await fileExists(none.ctx.paths.crosswalkReport), false);
    assert.ok(!('crosswalk' in embeddedData(await readFile(none.ctx.paths.dashboard, 'utf8'))));
    assert.ok(!none.messages.some((m) => m.includes('crosswalks:')));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('report: a missing crosswalk data file skips the deliverables with a warning; a broken one stops', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'csf-tool-crosswalk-'));
  const base = {
    ...NOFILE,
    docsPath: 'examples/sample-docs/data-protection-note.txt',
    workDir,
    embeddings: { provider: 'mock', model: 'mock' },
    llm: { provider: 'mock', model: 'mock' },
    fixedNow: '2026-07-23T12:00:00.000Z',
  };
  try {
    const absent = await buildContext({ ...base, crosswalkPath: join(workDir, 'no-such-file.json') });
    const messages = quietContext(absent);
    await ingest(absent);
    await analyze(absent);
    const result = await report(absent);
    assert.equal(result.crosswalkCsvPath, null);
    assert.equal(await fileExists(absent.paths.crosswalkCsv), false);
    assert.equal(await fileExists(absent.paths.gapReport), true, 'the other deliverables are unaffected');
    assert.equal(messages.filter((m) => m.includes('Crosswalk data file not found')).length, 1);

    const brokenPath = join(workDir, 'broken.json');
    await writeFile(brokenPath, JSON.stringify({ crosswalks: 'nope' }));
    const broken = await buildContext({ ...base, crosswalkPath: brokenPath });
    quietContext(broken);
    await assert.rejects(report(broken), CrosswalkDataError);
    // ...unless the run does not want crosswalks at all.
    const skipped = await buildContext({ ...base, crosswalkPath: brokenPath, report: { crosswalks: [] } });
    quietContext(skipped);
    assert.equal((await report(skipped)).crosswalkCsvPath, null);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('crosswalk command: lists the shipped crosswalks with provenance, default set vs opt-in, and the selection', async () => {
  const ctx = await buildContext({ ...NOFILE, report: { crosswalks: ['iso27001-2022', 'cis-v8.1'] } });
  const messages = quietContext(ctx);
  const listing = await crosswalk(ctx);

  assert.equal(listing.available, true);
  assert.equal(listing.path, 'data/csf-crosswalks.json');
  assert.match(listing.retrievedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(listing.catalogUrl, 'https://csrc.nist.gov/projects/olir/informative-reference-catalog');
  assert.deepEqual(listing.crosswalks.map((c) => c.id), SHIPPED_IDS);
  assert.deepEqual(listing.selectedIds, ['cis-v8.1', 'iso27001-2022']);
  for (const c of listing.crosswalks) {
    assert.equal(c.total, 106, `${c.id}: counted against the 106 Subcategories`);
    assert.ok(c.mapped >= 1 && c.mapped <= 106, `${c.id}: mapped ${c.mapped}`);
    assert.ok(c.categoriesMapped >= 0 && c.categoriesMapped <= 22 && c.functionsMapped >= 0 && c.functionsMapped <= 6);
    assert.ok(c.developer.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(c.releaseDate));
    assert.equal(c.selected, ['cis-v8.1', 'iso27001-2022'].includes(c.id));
    assert.ok(c.sourceUrl === null || isNistHostedUrl(c.sourceUrl));
  }
  // Third-party mappings, and only they, are outside the default set.
  assert.deepEqual(listing.crosswalks.filter((c) => c.thirdParty).map((c) => c.id), THIRD_PARTY_IDS);
  assert.deepEqual(listing.crosswalks.filter((c) => !c.inDefaultSet).map((c) => c.id), THIRD_PARTY_IDS);

  // One block through ui.note, with what a user needs to make a selection.
  assert.equal(messages.length, 1);
  const [text] = messages;
  assert.ok(text.startsWith('Crosswalks (CSF 2.0 → other frameworks)\n'));
  assert.match(text, /Source: NIST National Online Informative References \(OLIR\) Program/);
  assert.ok(text.includes('Catalog where each mapping and its developer are listed: https://csrc.nist.gov/projects/olir/informative-reference-catalog\n'));
  assert.match(text, /✓ cis-v8\.1 +CIS Critical Security Controls v8\.1 · default set\n +mapping by Center for Internet Security \(CIS\) · released \d{4}-\d{2}-\d{2}\n +relates to \d+\/106 Subcategories, \d+ whole Categor(y|ies), \d+ whole Functions?\n/);
  // NIST's own mapping is a NIST-hosted document: its link is shown. No other link is.
  assert.match(text, /— sp800-53-r5 +NIST SP 800-53 Rev\. 5\.2\.0 · default set\n[^\n]+\n[^\n]+\n +mapping document: https:\/\/csrc\.nist\.gov\/\S+\n/);
  assert.match(text, /✓ iso27001-2022 +ISO\/IEC 27001:2022 · opt-in · third-party mapping \(not produced by the framework's publisher\)\n[^\n]+\n[^\n]+\n(✓|—) pci-dss/);
  for (const url of text.match(/https?:\/\/\S+/g)) assert.equal(isNistHostedUrl(url), true, url);
  assert.ok(text.includes('Selected by the current configuration: 2 of 10 (cis-v8.1, iso27001-2022).\n'));
  assert.ok(text.includes('Select with --crosswalk <ids|default|all|none> or "report.crosswalks" in the config file.\n'));
  assert.ok(text.includes('Third-party mappings are opt-in'));
});

test('crosswalk command: without a selection the default set is used — third-party mappings are not', async () => {
  const ctx = await buildContext({ ...NOFILE });
  const messages = quietContext(ctx);
  ctx.ui = null; // no note(): the block goes to the logger instead
  const listing = await crosswalk(ctx);
  assert.deepEqual(listing.selectedIds, DEFAULT_IDS);
  assert.equal(messages.length, 1);
  assert.ok(messages[0].includes('Selected by the current configuration: the default set, 8 of 10 ("report.crosswalks" is not set).\n'));
  assert.match(messages[0], /— iso27001-2022 /);
  assert.match(messages[0], /— pci-dss-4\.0\.1 /);

  const everything = await buildContext({ ...NOFILE, report: { crosswalks: ['all'] } });
  quietContext(everything);
  assert.deepEqual((await crosswalk(everything)).selectedIds, SHIPPED_IDS);
});

test('crosswalk command: a missing data file is explained, not treated as a failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'csf-tool-crosswalk-'));
  try {
    const path = join(dir, 'no-such-file.json');
    const ctx = await buildContext({ ...NOFILE, crosswalkPath: path });
    const messages = quietContext(ctx);
    const result = await crosswalk(ctx);
    assert.deepEqual(result, { available: false, path, crosswalks: [], selectedIds: [] });
    assert.equal(messages.length, 1);
    assert.ok(messages[0].includes(`No crosswalk data file found at: ${path}`));
    assert.match(messages[0], /Crosswalks are optional/);
    assert.match(messages[0], /npm run build-crosswalks/);

    // A file that exists but is malformed is a typed error with a hint.
    await writeFile(path, '{ "crosswalks": [');
    await assert.rejects(crosswalk(ctx), (err) => err instanceof CrosswalkDataError && /not valid JSON/.test(err.message));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
