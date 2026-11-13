/**
 * End-to-end checks of the report stage: which files renderReports() writes,
 * which it removes, and that the full offline pipeline produces them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderReports } from '../src/report/index.js';
import { resolvePaths } from '../src/core/paths.js';
import { validateTargetSpec } from '../src/target/targetProfile.js';
import { buildContext } from '../src/core/context.js';
import { ingest } from '../src/actions/ingest.js';
import { analyze } from '../src/actions/analyze.js';
import { review } from '../src/actions/review.js';
import { target } from '../src/actions/target.js';
import { report } from '../src/actions/report.js';
import { status } from '../src/actions/status.js';
import { readJsonSafe, writeJsonAtomic } from '../src/util/fsx.js';

const NOW = '2026-01-01T00:00:00.000Z';

const CSF = {
  frameworkVersion: 'CSF 2.0',
  sample: false,
  functions: [
    { id: 'GV', name: 'GOVERN' },
    { id: 'PR', name: 'PROTECT' },
  ],
  subcategories: [
    sub('GV.OC-01', 'Mission understood', 'GOVERN', 'Organizational Context (GV.OC)', ['Share the mission']),
    sub('GV.OC-02', 'Stakeholders understood', 'GOVERN', 'Organizational Context (GV.OC)', ['Identify stakeholders']),
    sub('PR.AA-01', 'Identities managed', 'PROTECT', 'Identity Management (PR.AA)', ['Maintain identity inventory']),
  ],
};

function sub(id, outcome, fnName, category, examples) {
  return {
    id, outcome, function: fnName, category,
    functionId: id.split('.')[0], functionName: fnName, categoryId: id.split('-')[0],
    implementationExamples: examples,
  };
}

function assessment(id, coverage) {
  return {
    subcategory_id: id,
    coverage,
    confidence: 0.8,
    evidence: coverage === 'none'
      ? []
      : [{ source_file: 'policy.md', page: null, score: 0.5, quote: `evidence quote for ${id}`, verified: true }],
    rationale: `rationale for ${id}`,
    needs_review: false,
    verification: { quotes_checked: 1, quotes_verified: 1, downgraded: false },
    retrieved: [{ chunk_id: 'policy.md#c0', source_file: 'policy.md', page: null, score: 0.4 }],
  };
}

function inputs() {
  return {
    csf: CSF,
    assessments: {
      'GV.OC-01': assessment('GV.OC-01', 'substantial'),
      'GV.OC-02': assessment('GV.OC-02', 'none'),
      'PR.AA-01': assessment('PR.AA-01', 'partial'),
    },
    reviews: {},
    meta: { documents: [{ source_file: 'policy.md', path: 'policy.md', chunks: 2 }] },
  };
}

async function withWorkDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'csf-reports-'));
  try {
    const ctx = {
      config: {
        analysis: { strict: false },
        report: { evidenceQuoteMaxChars: 300 },
        embeddings: { provider: 'mock' },
        llm: { provider: 'mock' },
      },
      paths: resolvePaths(dir),
      now: () => NOW,
    };
    return await fn(ctx);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const listReports = async (ctx) => (await readdir(ctx.paths.reportsDir)).sort();

test('renderReports always writes the evidence-by-document report and the evidence request list', async () => {
  await withWorkDir(async (ctx) => {
    const result = await renderReports(ctx, inputs());

    assert.equal(result.evidenceByDocumentPath, ctx.paths.evidenceByDocument);
    assert.equal(result.evidenceRequestsPath, ctx.paths.evidenceRequests);
    assert.deepEqual(await listReports(ctx), [
      'current-profile.json',
      'dashboard.html',
      'evidence-by-document.md',
      'evidence-map.csv',
      'evidence-requests.md',
      'gap-analysis.md',
    ]);
    const md = await readFile(ctx.paths.evidenceByDocument, 'utf8');
    assert.match(md, /^# NIST CSF 2\.0 — Evidence by Document/);
    assert.match(md, /\| `policy\.md` \| 2 \| 3 \| 2 \| 2 \|/);
    // The dashboard is fed the same view.
    const html = await readFile(ctx.paths.dashboard, 'utf8');
    const data = JSON.parse(/<script id="csf-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1]);
    assert.equal(data.documentView.documents[0].source_file, 'policy.md');
    assert.equal(data.documentView.summary.outcomesWithQuotes, 2);

    // No target profile: the request list covers the gaps, grouped by Function.
    const requests = await readFile(ctx.paths.evidenceRequests, 'utf8');
    assert.match(requests, /^# NIST CSF 2\.0 — Evidence Request List/);
    assert.match(requests, /- Open requests: 2 \(current coverage: none 1, partial 1\)/);
    assert.match(requests, /### GOVERN \(1\)\n\n#### GV\.OC-02 — none/);
    assert.match(requests, / {2}- \[ \] Identify stakeholders/);
  });
});

test('renderReports writes both reports with a target profile too, and the request list follows the plan', async () => {
  await withWorkDir(async (ctx) => {
    const targetSpec = validateTargetSpec({ default: 'substantial', priorities: { PR: 'high' } });
    await renderReports(ctx, { ...inputs(), targetSpec });
    const files = await listReports(ctx);
    assert.ok(files.includes('evidence-by-document.md'));
    assert.ok(files.includes('evidence-requests.md'));

    const headings = (text) => text.split('\n').filter((line) => line.startsWith('#### '));
    const requests = await readFile(ctx.paths.evidenceRequests, 'utf8');
    const plan = await readFile(ctx.paths.remediationPlan, 'utf8');
    assert.deepEqual(headings(requests), headings(plan));
    assert.deepEqual(headings(requests), [
      '#### 1. PR.AA-01 — partial → substantial (1 level to close) _(⚠ UNREVIEWED)_',
      '#### 2. GV.OC-02 — none → substantial (2 levels to close) _(⚠ UNREVIEWED)_',
    ]);
  });
});

test('renderReports writes the POA&M export with a target profile and removes it without one', async () => {
  await withWorkDir(async (ctx) => {
    const targetSpec = validateTargetSpec({
      default: 'substantial',
      plan: { 'GV.OC-02': { owner: 'CISO', due: '2026-06-30' } },
    });
    const withTarget = await renderReports(ctx, { ...inputs(), targetSpec });

    assert.equal(withTarget.poamPath, ctx.paths.poam);
    assert.deepEqual(await listReports(ctx), [
      'current-profile.json',
      'dashboard.html',
      'evidence-by-document.md',
      'evidence-map.csv',
      'evidence-requests.md',
      'gap-analysis.md',
      'poam.csv',
      'remediation-plan.md',
      'target-profile.json',
    ]);
    const csv = await readFile(ctx.paths.poam, 'utf8');
    const lines = csv.slice(1).split('\r\n');
    assert.ok(lines[0].startsWith('poam_id,subcategory_id,'));
    assert.ok(lines[1].startsWith('POAM-GV.OC-02,GV.OC-02,GOVERN,'));
    assert.ok(lines[1].includes(',open,CISO,2026-06-30,'));
    assert.ok(lines[2].startsWith('POAM-PR.AA-01,'));
    assert.equal(lines.length, 4); // header, two unmet targets, trailing CRLF

    // The target profile is deleted: every target-side deliverable must go, so
    // an outdated tracker cannot be mistaken for current. The rest stays.
    const without = await renderReports(ctx, inputs());
    assert.equal(without.poamPath, null);
    assert.equal(without.remediationPlanPath, null);
    assert.deepEqual(await listReports(ctx), [
      'current-profile.json',
      'dashboard.html',
      'evidence-by-document.md',
      'evidence-map.csv',
      'evidence-requests.md',
      'gap-analysis.md',
    ]);
  });
});

test('strict mode still refuses before any deliverable is written', async () => {
  await withWorkDir(async (ctx) => {
    ctx.config.analysis.strict = true;
    await assert.rejects(renderReports(ctx, inputs()), /Strict mode/);
    await assert.rejects(readdir(ctx.paths.reportsDir), { code: 'ENOENT' });
  });
});

test('offline pipeline: ingest → analyze → review → report produces the always-written reports end to end', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'csf-reports-e2e-'));
  try {
    const ctx = await buildContext({
      docsPath: 'examples/sample-docs',
      workDir,
      csfCorePath: 'data/csf-core.json',
      embeddings: { provider: 'mock', model: 'mock' },
      llm: { provider: 'mock', model: 'mock' },
      review: { showAll: true },
      acceptAll: true,
      fixedNow: NOW,
      logLevel: 'quiet',
    });
    ctx.ui = { isInteractive: false, info() {}, warn() {}, success() {}, note() {} };

    await ingest(ctx);
    await analyze(ctx);
    await review(ctx);
    const result = await report(ctx);

    const meta = await readJsonSafe(ctx.paths.meta, {});
    assert.deepEqual(
      meta.documents.map((d) => d.source_file),
      [
        'access-control-standard.md',
        'asset-inventory-procedure.docx',
        'data-protection-note.txt',
        'incident-response-plan.pdf',
        'information-security-policy.md',
      ],
    );
    assert.ok(meta.documents.every((d) => d.path === d.source_file && d.chunks >= 1));

    assert.equal(result.evidenceByDocumentPath, ctx.paths.evidenceByDocument);
    const md = await readFile(ctx.paths.evidenceByDocument, 'utf8');
    assert.match(md, /- Documents ingested: 5\n/);
    // Every ingested document is accounted for: quoted or listed as never quoted.
    for (const d of meta.documents) assert.ok(md.includes(`\`${d.source_file}\``), d.source_file);
    // The quote count agrees with the evidence map (one data row per quote).
    const profile = await readJsonSafe(ctx.paths.currentProfile);
    const quotes = profile.subcategories.reduce((n, e) => n + e.evidence.length, 0);
    assert.ok(quotes > 0);
    assert.match(md, new RegExp(`- Verified quotes: ${quotes}\\n`));

    // One request per gap, each with NIST's examples for that outcome, verbatim.
    assert.equal(result.evidenceRequestsPath, ctx.paths.evidenceRequests);
    const requests = await readFile(ctx.paths.evidenceRequests, 'utf8');
    assert.equal(requests.split('\n').filter((line) => line.startsWith('#### ')).length, profile.summary.gaps);
    const csf = await readJsonSafe('data/csf-core.json');
    const official = new Set(csf.subcategories.flatMap((s) => s.implementationExamples));
    const checklist = requests.split('\n').filter((line) => line.startsWith('  - [ ] '));
    assert.ok(checklist.length > 0);
    for (const line of checklist) assert.ok(official.has(line.slice('  - [ ] '.length)), line);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('offline pipeline with a target profile: plan fields and the Tier selection reach the deliverables, and the report stays current', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'csf-reports-e2e-target-'));
  const logs = [];
  try {
    const ctx = await buildContext({
      docsPath: 'examples/sample-docs',
      workDir,
      csfCorePath: 'data/csf-core.json',
      embeddings: { provider: 'mock', model: 'mock' },
      llm: { provider: 'mock', model: 'mock' },
      review: { showAll: true },
      acceptAll: true,
      targetDefault: 'substantial',
      tierCurrent: 2,
      tierTarget: 3,
      fixedNow: NOW,
    });
    const collect = (...args) => logs.push(args.join(' '));
    ctx.logger = { level: 'info', debug() {}, info: collect, warn: collect, error: collect };
    ctx.ui = { isInteractive: false, info() {}, warn() {}, success() {}, note() {} };

    await ingest(ctx);
    await analyze(ctx);
    await review(ctx);
    await target(ctx); // --target-default substantial --tier-current 2 --tier-target 3

    // Hand-edited JSON is the interface for plan fields.
    const spec = await readJsonSafe(ctx.paths.target);
    assert.deepEqual(spec.plan, {});
    assert.deepEqual(spec.tiers, { current: 2, target: 3, note: null });
    spec.plan = {
      'PR.AA-03': { owner: 'IT Operations Lead', due: '2026-06-30', status: 'in-progress' },
    };
    await writeJsonAtomic(ctx.paths.target, spec);

    const result = await report(ctx);
    assert.equal(result.poamPath, ctx.paths.poam);
    assert.ok(logs.some((line) => line.includes('POA&M-style tracker') && line.includes(ctx.paths.poam)));

    const csv = await readFile(ctx.paths.poam, 'utf8');
    const rows = csv.slice(1).split('\r\n').filter(Boolean);
    assert.equal(rows.length - 1, result.targetSummary.unmet);
    const planned = rows.find((line) => line.startsWith('POAM-PR.AA-03,'));
    assert.ok(planned.includes(',in-progress,IT Operations Lead,2026-06-30,'));
    // Official NIST text for that outcome, verbatim.
    assert.ok(planned.includes('Require multifactor authentication | Enforce policies for the minimum strength of passwords'));
    assert.match(await readFile(ctx.paths.remediationPlan, 'utf8'), /- Plan \(recorded in the target profile\): owner: IT Operations Lead; due: 2026-06-30; status: in-progress/);

    // The organization's Tier selection is carried through, labeled as selected.
    const tierSentence = 'CSF Tier — current: Tier 2 (Risk Informed); target: Tier 3 (Repeatable). Selected by the organization';
    assert.ok((await readFile(ctx.paths.gapReport, 'utf8')).includes(tierSentence));
    assert.ok((await readFile(ctx.paths.remediationPlan, 'utf8')).includes(`- ${tierSentence}`));
    const targetProfile = await readJsonSafe(ctx.paths.targetProfile);
    assert.deepEqual(targetProfile.tiers.current, { tier: 2, name: 'Risk Informed' });
    assert.deepEqual(targetProfile.tiers.target, { tier: 3, name: 'Repeatable' });

    // Loading the plan and the tiers must not make the unchanged target.json look edited.
    const state = await status(ctx);
    assert.equal(state.target.status, 'configured');
    assert.equal(state.report.status, 'current');
    assert.deepEqual(state.report.mismatches, []);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});
