import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

import { buildContext } from '../src/core/context.js';
import { ingest } from '../src/actions/ingest.js';
import { analyze } from '../src/actions/analyze.js';
import { review } from '../src/actions/review.js';
import { report } from '../src/actions/report.js';
import { readJsonSafe } from '../src/util/fsx.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('pipeline activity metadata and progress are emitted end-to-end', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'csf-tool-activity-'));
  const messages = [];

  try {
    const ctx = await buildContext({
      docsPath: 'examples/sample-docs/data-protection-note.txt',
      workDir,
      csfCorePath: 'data/csf-core.json',
      embeddings: { provider: 'mock', model: 'mock' },
      llm: { provider: 'mock', model: 'mock' },
      review: { showAll: true },
      acceptAll: true,
      fixedNow: '2026-07-23T12:00:00.000Z',
    });

    ctx.logger = captureLogger(messages);
    ctx.ui = {
      isInteractive: false,
      info: (message) => messages.push(message),
      warn: (message) => messages.push(message),
      success: (message) => messages.push(message),
      note: (title, body) => messages.push(`${title}\n${body}`),
    };

    await ingest(ctx);
    const meta = await readJsonSafe(ctx.paths.meta, {});
    assert.equal(meta.tool_version, pkg.version);
    assert.equal(meta.index_created_at, '2026-07-23T12:00:00.000Z');
    assert.ok(meta.index_id);
    assert.ok(messages.some((message) => message.includes('Parsing 1/1 (100%)')));

    await analyze(ctx);
    assert.ok(messages.some((message) => message.includes('106/106 (100%)')));
    const analyzedMeta = await readJsonSafe(ctx.paths.meta, {});
    assert.equal(analyzedMeta.analyzed_index_id, analyzedMeta.index_id);

    await review(ctx);
    assert.ok(messages.some((message) => message.includes('Review progress: 106/106 (100%)')));

    await report(ctx);
    const reportedMeta = await readJsonSafe(ctx.paths.meta, {});
    assert.equal(reportedMeta.reported_at, '2026-07-23T12:00:00.000Z');
    assert.match(reportedMeta.report_snapshot.assessments_hash, /^[a-f0-9]{12}$/);
    assert.match(reportedMeta.report_snapshot.reviews_hash, /^[a-f0-9]{12}$/);
    assert.match(reportedMeta.report_snapshot.target_hash, /^[a-f0-9]{12}$/);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

function captureLogger(messages) {
  return {
    level: 'info',
    debug: (...args) => messages.push(args.join(' ')),
    info: (...args) => messages.push(args.join(' ')),
    warn: (...args) => messages.push(args.join(' ')),
    error: (...args) => messages.push(args.join(' ')),
  };
}
