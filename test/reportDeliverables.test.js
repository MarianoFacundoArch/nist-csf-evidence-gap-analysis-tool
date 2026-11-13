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
import { report } from '../src/actions/report.js';
import { readJsonSafe } from '../src/util/fsx.js';

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

test('renderReports always writes the evidence-by-document report', async () => {
  await withWorkDir(async (ctx) => {
    const result = await renderReports(ctx, inputs());

    assert.equal(result.evidenceByDocumentPath, ctx.paths.evidenceByDocument);
    assert.deepEqual(await listReports(ctx), [
      'current-profile.json',
      'dashboard.html',
      'evidence-by-document.md',
      'evidence-map.csv',
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
  });
});

test('renderReports writes the evidence-by-document report with a target profile too', async () => {
  await withWorkDir(async (ctx) => {
    const targetSpec = validateTargetSpec({ default: 'substantial' });
    await renderReports(ctx, { ...inputs(), targetSpec });
    assert.ok((await listReports(ctx)).includes('evidence-by-document.md'));
  });
});

test('strict mode still refuses before any deliverable is written', async () => {
  await withWorkDir(async (ctx) => {
    ctx.config.analysis.strict = true;
    await assert.rejects(renderReports(ctx, inputs()), /Strict mode/);
    await assert.rejects(readdir(ctx.paths.reportsDir), { code: 'ENOENT' });
  });
});

test('offline pipeline: ingest → analyze → review → report produces the document view end to end', async () => {
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
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});
