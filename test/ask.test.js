import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { answerQuestion, NO_EVIDENCE_ANSWER, UNSUPPORTED_REASONS } from '../src/engine/ask.js';
import { validateAnswer } from '../src/engine/ask.schema.js';
import { ASK_SYSTEM_PROMPT, buildAskPrompt } from '../src/prompts/askTemplates.js';
import { ask, renderAnswer } from '../src/actions/ask.js';
import { createEmbedder } from '../src/embeddings/mock.js';
import { createLlm } from '../src/llm/mock.js';
import { buildIndex, saveIndex } from '../src/store/vectorStore.js';
import { resolvePaths } from '../src/core/paths.js';
import { ConfigError, StageError } from '../src/core/errors.js';
import { createNonInteractiveUi } from '../src/cli/ui.cli.js';
import { wrapForBox } from '../src/cli/ui.menu.js';
import { parseCliArgs, HELP_TEXT } from '../src/cli/flags.js';

const execFileAsync = promisify(execFile);
const BIN = fileURLToPath(new URL('../bin/csf-tool.js', import.meta.url));

const CONFIG = { retrieval: { topK: 2 }, question: null };

const MFA_SENTENCE = 'Multi-factor authentication is enforced for all remote access and for all administrative accounts.';
const REVIEW_SENTENCE = 'Access permissions are reviewed every quarter by the system owners.';
const IR_SENTENCE = 'When an incident is declared, the incident response plan is executed by the on-call lead.';

const CHUNKS = [
  {
    id: 'access.md~aaaaaa#na#c0',
    source_file: 'access.md',
    page: null,
    char_start: 0,
    char_end: 166,
    text: `${MFA_SENTENCE} ${REVIEW_SENTENCE}`,
  },
  {
    id: 'plan.pdf~bbbbbb#p3#c1',
    source_file: 'plan.pdf',
    page: 3,
    char_start: 0,
    char_end: 141,
    text: `${IR_SENTENCE} Each incident is tracked to closure in the ticketing system.`,
  },
  {
    id: 'note.txt~cccccc#na#c2',
    source_file: 'note.txt',
    page: null,
    char_start: 0,
    char_end: 73,
    text: 'Sensitive data should be handled carefully by everyone at the company.',
  },
];

async function makeIndex(chunks = CHUNKS) {
  const embedder = createEmbedder();
  const vectors = await embedder.embed(chunks.map((c) => c.text));
  const index = { dim: embedder.dim, embedder_id: embedder.id, chunks, vectors: vectors.map((v) => Float32Array.from(v)) };
  return { embedder, index };
}

/** A scripted LLM that records every call and replies from a list. */
function scriptedLlm(replies) {
  const calls = [];
  let i = 0;
  return {
    id: 'scripted',
    isLocal: true,
    calls,
    async judge(args) {
      calls.push(args);
      const reply = replies[Math.min(i, replies.length - 1)];
      i++;
      return typeof reply === 'string' ? reply : JSON.stringify(reply);
    },
  };
}

function silentLogger(lines = []) {
  const push = (...a) => lines.push(a.join(' '));
  return { level: 'info', debug: push, info: push, warn: push, error: push, lines };
}

/** A work directory holding a saved index (and whatever else `extra` writes). */
async function withWorkDir(fn, { chunks = CHUNKS, embedderId = 'mock' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'csf-ask-'));
  try {
    const embedder = createEmbedder();
    const vectors = await embedder.embed(chunks.map((c) => c.text));
    const paths = resolvePaths(dir);
    await saveIndex(
      paths.index,
      buildIndex({ chunks, vectors, embedderId, dim: embedder.dim, chunkParams: { size: 1200, overlap: 200 }, createdAt: '2026-01-01T00:00:00.000Z' }),
    );
    return await fn({ dir, paths });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function makeCtx({ paths, question = null, llm = createLlm(), embedder = createEmbedder(), ui, topK = 2, logLines = [] }) {
  const counts = { embedder: 0, llm: 0 };
  return {
    config: { ...CONFIG, question, retrieval: { topK } },
    paths,
    logger: silentLogger(logLines),
    getEmbedder: async () => {
      counts.embedder++;
      return embedder;
    },
    getLlm: async () => {
      counts.llm++;
      return llm;
    },
    now: () => '2026-01-01T00:00:00.000Z',
    ui,
    counts,
  };
}

/** A UI port that records what it is given and never touches the terminal. */
function recordingUi({ isInteractive = false, typed = [] } = {}) {
  const ui = {
    isInteractive,
    results: [],
    prompts: [],
    result: (title, body) => ui.results.push({ title, body }),
    info() {},
    warn() {},
    success() {},
    note() {},
    async text(message, opts) {
      ui.prompts.push({ message, opts });
      return typed.shift() ?? '';
    },
  };
  return ui;
}

/* ------------------------------- the engine ------------------------------- */

test('a supported question returns a verified verbatim quote and the mock answer', async () => {
  const { embedder, index } = await makeIndex();
  const r = await answerQuestion({
    question: 'Is multi-factor authentication enforced for remote access?',
    index, embedder, llm: createLlm(), config: CONFIG,
  });

  assert.equal(r.supported, true);
  assert.equal(r.unsupported_reason, null);
  assert.equal(r.verifier_action, null);
  assert.equal(r.evidence.length, 1);
  assert.equal(r.evidence[0].quote, MFA_SENTENCE);
  assert.equal(r.evidence[0].verified, true);
  // Provenance comes from the chunk that really contains the quote.
  assert.equal(r.evidence[0].source_file, 'access.md');
  assert.equal(r.evidence[0].chunk_id, 'access.md~aaaaaa#na#c0');
  assert.equal(r.evidence[0].page, null);
  assert.ok(index.chunks.some((c) => c.text.includes(r.evidence[0].quote)));
  assert.match(r.answer, /"access\.md"/);
  assert.match(r.answer, /mock engine/);
  assert.deepEqual(r.verification, { quotes_checked: 1, quotes_verified: 1, quotes_dropped: 0 });
  // What was searched is reported by id, without the passage text.
  assert.equal(r.retrieved.length, 2);
  assert.deepEqual(Object.keys(r.retrieved[0]), ['chunk_id', 'source_file', 'page', 'score']);
});

test('a quote from a PDF chunk keeps its page number', async () => {
  const { embedder, index } = await makeIndex();
  const r = await answerQuestion({
    question: 'Is the incident response plan executed when an incident is declared?',
    index, embedder, llm: createLlm(), config: CONFIG,
  });
  assert.equal(r.supported, true);
  assert.equal(r.evidence[0].source_file, 'plan.pdf');
  assert.equal(r.evidence[0].page, 3);
});

test('a question the documents do not cover is unsupported, with the fixed sentence and no evidence', async () => {
  const { embedder, index } = await makeIndex();
  const r = await answerQuestion({
    question: 'What is the vacation allowance for contractors?',
    index, embedder, llm: createLlm(), config: CONFIG,
  });
  assert.equal(r.supported, false);
  assert.equal(r.answer, NO_EVIDENCE_ANSWER);
  assert.deepEqual(r.evidence, []);
  assert.equal(r.unsupported_reason, UNSUPPORTED_REASONS.MODEL_FOUND_NONE);
  assert.equal(r.verifier_action, null);
});

test('FORCING RULE: a fabricated quote means the answer is withheld and supported is false', async () => {
  const { embedder, index } = await makeIndex();
  const fabricated = 'Privileged access is reviewed monthly and revoked automatically after 30 days.';
  const llm = scriptedLlm([
    {
      answer: 'Yes. Privileged access is reviewed monthly and revoked automatically.',
      supported: true,
      evidence: [{ source_file: 'access.md', quote: fabricated }],
    },
  ]);
  const r = await answerQuestion({ question: 'Is privileged access reviewed?', index, embedder, llm, config: CONFIG });

  assert.equal(r.supported, false);
  assert.equal(r.answer, NO_EVIDENCE_ANSWER);
  assert.deepEqual(r.evidence, []);
  assert.equal(r.unsupported_reason, UNSUPPORTED_REASONS.NO_VALID_QUOTE);
  assert.equal(r.verifier_action, 'answer_withheld_no_valid_quote');
  assert.deepEqual(r.verification, { quotes_checked: 1, quotes_verified: 0, quotes_dropped: 1 });
  // The model's text is not returned anywhere in the result.
  const serialized = JSON.stringify(r);
  assert.ok(!serialized.includes('reviewed monthly'));
  assert.ok(!serialized.includes('Yes.'));
  assert.equal(llm.calls.length, 1, 'a well-formed but wrong answer is not retried');
});

test('FORCING RULE: "supported" with no quote at all, or only a trivial one, is withheld too', async () => {
  const { embedder, index } = await makeIndex();
  for (const evidence of [[], [{ source_file: 'access.md', quote: 'the' }]]) {
    const llm = scriptedLlm([{ answer: 'Yes, definitely.', supported: true, evidence }]);
    const r = await answerQuestion({ question: 'Is access reviewed?', index, embedder, llm, config: CONFIG });
    assert.equal(r.supported, false);
    assert.equal(r.answer, NO_EVIDENCE_ANSWER);
    assert.equal(r.verifier_action, 'answer_withheld_no_valid_quote');
    assert.ok(!JSON.stringify(r).includes('definitely'));
  }
});

test('one real and one fabricated quote: the answer is kept and one quote is dropped', async () => {
  const { embedder, index } = await makeIndex();
  const llm = scriptedLlm([
    {
      answer: 'The standard states that access permissions are reviewed every quarter.',
      supported: true,
      evidence: [
        { source_file: 'access.md', quote: REVIEW_SENTENCE },
        { source_file: 'access.md', quote: 'The most recent review removed 14 stale accounts in March.' },
      ],
    },
  ]);
  const r = await answerQuestion({ question: 'How often is access reviewed?', index, embedder, llm, config: CONFIG });

  assert.equal(r.supported, true);
  assert.equal(r.answer, 'The standard states that access permissions are reviewed every quarter.');
  assert.deepEqual(r.evidence.map((e) => e.quote), [REVIEW_SENTENCE]);
  assert.equal(r.verifier_action, 'dropped_1_unverifiable_quote');
  assert.deepEqual(r.verification, { quotes_checked: 2, quotes_verified: 1, quotes_dropped: 1 });
});

test('a real quote attributed to the wrong file is kept and re-attributed, as in assessments', async () => {
  const { embedder, index } = await makeIndex();
  const llm = scriptedLlm([
    { answer: 'MFA is enforced for remote access.', supported: true, evidence: [{ source_file: 'plan.pdf', quote: MFA_SENTENCE }] },
  ]);
  const r = await answerQuestion({ question: 'Is multi-factor authentication enforced for remote access?', index, embedder, llm, config: CONFIG });
  assert.equal(r.supported, true);
  assert.equal(r.evidence[0].source_file, 'access.md');
  assert.equal(r.evidence[0].attribution_corrected, true);
});

test('when the model says "not supported", its prose and any attached quote are dropped', async () => {
  const { embedder, index } = await makeIndex();
  const llm = scriptedLlm([
    {
      answer: 'The documents probably imply that passwords rotate every 90 days.',
      supported: false,
      evidence: [{ source_file: 'access.md', quote: MFA_SENTENCE }],
    },
  ]);
  const r = await answerQuestion({ question: 'How often do passwords rotate?', index, embedder, llm, config: CONFIG });
  assert.equal(r.supported, false);
  assert.equal(r.answer, NO_EVIDENCE_ANSWER);
  assert.deepEqual(r.evidence, []);
  assert.equal(r.unsupported_reason, UNSUPPORTED_REASONS.MODEL_FOUND_NONE);
  assert.ok(!JSON.stringify(r).includes('90 days'));
});

test('malformed output twice degrades to unsupported with a reason (never throws)', async () => {
  const { embedder, index } = await makeIndex();
  const llm = scriptedLlm(['not json, just prose', '{"answer": 42}']);
  const r = await answerQuestion({ question: 'Is access reviewed?', index, embedder, llm, config: CONFIG });
  assert.equal(r.supported, false);
  assert.equal(r.answer, NO_EVIDENCE_ANSWER);
  assert.equal(r.unsupported_reason, UNSUPPORTED_REASONS.INVALID_OUTPUT);
  assert.deepEqual(r.evidence, []);
  assert.equal(llm.calls.length, 2, 'exactly one retry');
  assert.ok(!JSON.stringify(r).includes('just prose'));
});

test('malformed output is retried once with the rejection reasons, and a valid second reply is used', async () => {
  const { embedder, index } = await makeIndex();
  const llm = scriptedLlm([
    '```json\n{"answer": "x", "supported": "perhaps", "evidence": []}\n```',
    { answer: 'MFA is enforced for remote access.', supported: true, evidence: [{ source_file: 'access.md', quote: MFA_SENTENCE }] },
  ]);
  const r = await answerQuestion({ question: 'Is multi-factor authentication enforced for remote access?', index, embedder, llm, config: CONFIG });
  assert.equal(r.supported, true);
  assert.equal(llm.calls.length, 2);
  assert.ok(!llm.calls[0].user.includes('REJECTED'));
  assert.match(llm.calls[1].user, /YOUR PREVIOUS RESPONSE WAS REJECTED/);
  assert.match(llm.calls[1].user, /\/supported must be boolean/);
  // The retry still carries the full task, not just the complaint.
  assert.ok(llm.calls[1].user.startsWith(llm.calls[0].user));
});

test('no passages retrieved: unsupported without calling the model', async () => {
  const embedder = createEmbedder();
  const index = { dim: embedder.dim, embedder_id: embedder.id, chunks: [], vectors: [] };
  const llm = scriptedLlm([{ answer: 'should never be asked', supported: true, evidence: [] }]);
  const r = await answerQuestion({ question: 'Is access reviewed?', index, embedder, llm, config: CONFIG });
  assert.equal(llm.calls.length, 0);
  assert.equal(r.supported, false);
  assert.equal(r.unsupported_reason, UNSUPPORTED_REASONS.NO_PASSAGES);
  assert.deepEqual(r.retrieved, []);
});

test('the engine sends the ask prompts, the retrieved chunks, and the mock meta', async () => {
  const { embedder, index } = await makeIndex();
  const llm = scriptedLlm([{ answer: '', supported: false, evidence: [] }]);
  const question = 'Is multi-factor authentication enforced for remote access?';
  await answerQuestion({ question, index, embedder, llm, config: CONFIG });

  const call = llm.calls[0];
  assert.equal(call.system, ASK_SYSTEM_PROMPT);
  assert.equal(call.meta.pass, 'ask');
  assert.equal(call.meta.question, question);
  assert.equal(call.meta.hits.length, 2);
  assert.equal(call.user, buildAskPrompt(question, call.meta.hits));
  assert.ok(call.user.includes(question));
  assert.ok(call.user.includes(MFA_SENTENCE), 'chunk text is inserted unmodified');
  assert.ok(call.user.includes('source_file: "access.md"'));
});

test('provider failures propagate instead of being reported as "no evidence"', async () => {
  const { embedder, index } = await makeIndex();
  const llm = { id: 'down', isLocal: true, async judge() { throw new Error('daemon unreachable'); } };
  await assert.rejects(
    () => answerQuestion({ question: 'Is access reviewed?', index, embedder, llm, config: CONFIG }),
    /daemon unreachable/,
  );
});

/* ------------------------------- the schema ------------------------------- */

test('answer schema: harmless deviations are coerced, unusable output is rejected', () => {
  // Stray keys, string booleans and untrimmed text are tolerated.
  assert.deepEqual(
    validateAnswer({ answer: ' Yes. ', supported: 'TRUE', evidence: [{ source_file: 'a.md', quote: 'q', page: 4 }], note: 'x' }),
    { ok: true, value: { answer: 'Yes.', supported: true, evidence: [{ source_file: 'a.md', quote: 'q' }] } },
  );
  // An unsupported response may omit the answer and the evidence.
  assert.deepEqual(validateAnswer({ supported: false }), { ok: true, value: { answer: '', supported: false, evidence: [] } });
  // Malformed evidence items are dropped rather than failing the whole reply.
  assert.deepEqual(
    validateAnswer({ answer: 'ok', supported: true, evidence: [{ quote: 'no source' }, null, 'junk', { source_file: 'a', quote: '  ' }] }).value.evidence,
    [],
  );
  // Unusable: wrong types, a missing verdict, an unclear verdict, an empty supported answer.
  for (const bad of [null, 'text', [1], { answer: 'x', evidence: [] }, { answer: 'x', supported: 'maybe', evidence: [] }, { answer: 5, supported: true }, { answer: '  ', supported: true }]) {
    const result = validateAnswer(bad);
    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.ok(result.errors.length > 0);
  }
});

/* ------------------------------- the action ------------------------------- */

test('ask action: hands the rendered answer to ui.result and returns a structured result', async () => {
  await withWorkDir(async ({ paths }) => {
    const ui = recordingUi();
    const logLines = [];
    const ctx = makeCtx({ paths, question: '  Is multi-factor   authentication enforced for remote access? ', ui, logLines });
    const result = await ask(ctx);

    assert.equal(result.question, 'Is multi-factor authentication enforced for remote access?');
    assert.equal(result.supported, true);
    assert.equal(result.evidence[0].quote, MFA_SENTENCE);
    assert.equal(result.evidence[0].source_file, 'access.md');
    assert.equal(result.evidence[0].chunk_id, 'access.md~aaaaaa#na#c0');
    assert.deepEqual(result.providers, { embeddings: 'mock', llm: 'mock' });
    assert.equal(result.top_k, 2);
    assert.equal(result.passages_searched, 2);
    assert.equal(result.passages_indexed, 3);
    assert.deepEqual(result.verification, { quotes_checked: 1, quotes_verified: 1, quotes_dropped: 0 });

    // The answer goes through the UI port — once — and not through the logger.
    assert.equal(ui.results.length, 1);
    assert.equal(ui.results[0].title, 'Answer');
    assert.equal(ui.results[0].body, renderAnswer(result));
    assert.ok(!logLines.some((l) => l.includes(MFA_SENTENCE)));
    assert.equal(ui.prompts.length, 0, 'a given question is not asked for again');
  });
});

test('ask action: the rendered block states what is verified and what was searched', async () => {
  await withWorkDir(async ({ paths }) => {
    const ui = recordingUi();
    const result = await ask(makeCtx({ paths, question: 'Is multi-factor authentication enforced for remote access?', ui }));
    assert.equal(
      ui.results[0].body,
      [
        'Question: Is multi-factor authentication enforced for remote access?',
        '',
        'Answer (AI-generated summary — check it against the quotes below):',
        result.answer,
        '',
        'Verified quotes (1):',
        `  1. access.md: "${MFA_SENTENCE}"`,
        '',
        'The quote returned by the model was verified verbatim against the ingested documents.',
        'Only the quotes are verified. The summary is the model\'s wording and is not itself verified.',
        'Searched the 2 most relevant of 3 passages of the index (retrieval.topK = 2).',
      ].join('\n'),
    );
  });
});

test('ask action: dropped quotes are counted, pages are shown, multi-line quotes are shown on one line', async () => {
  const chunks = [
    { ...CHUNKS[1], text: 'When an incident is declared,\nthe incident response plan is executed\n  by the on-call lead. Each incident is tracked to closure.' },
    CHUNKS[0],
  ];
  await withWorkDir(async ({ paths }) => {
    const llm = scriptedLlm([
      {
        answer: 'The plan says incidents trigger the response plan.',
        supported: true,
        evidence: [
          { source_file: 'plan.pdf', quote: 'When an incident is declared,\nthe incident response plan is executed\n  by the on-call lead.' },
          { source_file: 'plan.pdf', quote: 'Each incident is tracked to closure.' },
          { source_file: 'plan.pdf', quote: 'Incidents are reported to the regulator within 72 hours.' },
        ],
      },
    ]);
    const ui = recordingUi();
    const result = await ask(makeCtx({ paths, question: 'What happens when an incident is declared?', ui, llm }));
    const body = ui.results[0].body;

    assert.match(body, /Verified quotes \(2\):/);
    assert.ok(body.includes('  1. plan.pdf, p.3: "When an incident is declared, the incident response plan is executed by the on-call lead."'));
    assert.ok(body.includes('  2. plan.pdf, p.3: "Each incident is tracked to closure."'));
    assert.ok(body.includes('2 of 3 quotes returned by the model were verified verbatim against the ingested documents; the rest were removed.'));
    assert.ok(!body.includes('72 hours'));
    // The structured result keeps the quote exactly as the model returned it.
    assert.ok(result.evidence[0].quote.includes('\n'));
  }, { chunks });
});

test('ask action: an unsupported question prints the fixed message and the search limit', async () => {
  await withWorkDir(async ({ paths }) => {
    const ui = recordingUi();
    const result = await ask(makeCtx({ paths, question: 'What is the vacation allowance for contractors?', ui }));
    assert.equal(result.supported, false);
    assert.equal(
      ui.results[0].body,
      [
        'Question: What is the vacation allowance for contractors?',
        '',
        'No verifiable evidence in the ingested documents answers this question.',
        'Searched the 2 most relevant of 3 passages of the index (retrieval.topK = 2).',
        'Only those passages were read, so this means "not found there", not "the documents contain nothing on this".',
      ].join('\n'),
    );
  });
});

test('ask action: a withheld answer is explained in one extra line and its text never reaches the output', async () => {
  await withWorkDir(async ({ paths }) => {
    const llm = scriptedLlm([
      {
        answer: 'Yes, backups are encrypted with AES-256 and tested weekly.',
        supported: true,
        evidence: [
          { source_file: 'access.md', quote: 'All backups are encrypted with AES-256 and restored weekly as a test.' },
          { source_file: 'plan.pdf', quote: 'Backup restoration is tested every week by the infrastructure team.' },
        ],
      },
    ]);
    const ui = recordingUi();
    const logLines = [];
    const result = await ask(makeCtx({ paths, question: 'Are backups encrypted?', ui, llm, topK: 3, logLines }));
    const body = ui.results[0].body;

    assert.equal(result.supported, false);
    assert.equal(result.answer, NO_EVIDENCE_ANSWER);
    assert.equal(
      body,
      [
        'Question: Are backups encrypted?',
        '',
        'No verifiable evidence in the ingested documents answers this question.',
        'The model proposed an answer, but none of its 2 quotes could be verified verbatim, so the answer was withheld.',
        'Searched all 3 passages of the index.',
      ].join('\n'),
    );
    for (const text of [body, JSON.stringify(result), logLines.join('\n')]) assert.ok(!text.includes('AES-256'));
  });
});

test('ask action: a single unverifiable quote is reported as not verified', async () => {
  await withWorkDir(async ({ paths }) => {
    const llm = scriptedLlm([
      {
        answer: 'Yes, backups are encrypted with AES-256.',
        supported: true,
        evidence: [{ source_file: 'access.md', quote: 'All backups are encrypted with AES-256 and restored weekly as a test.' }],
      },
    ]);
    const ui = recordingUi();
    const result = await ask(makeCtx({ paths, question: 'Are backups encrypted?', ui, llm, topK: 3 }));

    assert.equal(result.supported, false);
    assert.ok(
      ui.results[0].body.includes(
        'The model proposed an answer, but its quote could not be verified verbatim, so the answer was withheld.',
      ),
    );
  });
});

test('ask action: hostile document or model text cannot forge lines or drive the terminal', async () => {
  // A document that carries terminal escapes and a bidi override, and a model
  // summary that tries to add its own "verified" section with line breaks.
  const hostile = 'Backups are encrypted\x1b[2K\x1b[1A at rest \x08\x08 and reviewed\x07 every \u{202e}quarter\u{202c} by the owners.';
  const chunks = [{ ...CHUNKS[0], source_file: 'ba\x1b[31mckup.md', text: hostile }, CHUNKS[1]];
  await withWorkDir(async ({ paths }) => {
    const llm = scriptedLlm([
      {
        answer: 'Backups are encrypted.\n\nVerified quotes (3):\n  1. policy.md: "Everything is fully compliant."\r\x1b[2K',
        supported: true,
        evidence: [{ source_file: 'ba\x1b[31mckup.md', quote: hostile }],
      },
    ]);
    const ui = recordingUi();
    const result = await ask(makeCtx({ paths, question: 'Are backups\nencrypted?\x1b[0m', ui, llm }));
    const body = ui.results[0].body;

    assert.equal(result.supported, true);
    // The structured result keeps the verified quote exactly as it is in the document.
    assert.equal(result.evidence[0].quote, hostile);
    // The printed block holds no control or bidi-override character at all ...
    assert.ok(!/[\x00-\x09\x0b-\x1f\x7f-\x9f\u{202a}-\u{202e}\u{2066}-\u{2069}]/u.test(body));
    // ... and exactly the lines the tool itself lays out: the model's text
    // stays on the one summary line and cannot open a section of its own.
    const lines = body.split('\n');
    assert.equal(lines.length, 11);
    assert.equal(lines.filter((l) => l.startsWith('Verified quotes (')).length, 1);
    assert.equal(lines[5], 'Verified quotes (1):');
    assert.ok(lines[3].startsWith('Backups are encrypted. Verified quotes (3): 1. policy.md:'));
    assert.ok(lines[6].startsWith('  1. ba\u{fffd}[31mckup.md: "Backups are encrypted\u{fffd}[2K\u{fffd}[1A at rest'));
  }, { chunks });
});

test('ask action: unusable model output is reported plainly', async () => {
  await withWorkDir(async ({ paths }) => {
    const ui = recordingUi();
    const result = await ask(makeCtx({ paths, question: 'Is access reviewed?', ui, llm: scriptedLlm(['nope']) }));
    assert.equal(result.unsupported_reason, UNSUPPORTED_REASONS.INVALID_OUTPUT);
    assert.match(ui.results[0].body, /did not return a usable response, even after one retry/);
  });
});

test('ask action: a missing question in a non-interactive session is a ConfigError with the usage', async () => {
  for (const question of [null, '', '   \n ', 42]) {
    const ctx = makeCtx({ paths: resolvePaths(join(tmpdir(), 'csf-ask-does-not-exist')), question, ui: recordingUi() });
    await assert.rejects(
      () => ask(ctx),
      (err) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /No question/);
        assert.match(err.hint, /csf-tool ask "/);
        return true;
      },
    );
    // The usage error comes first: nothing was loaded or contacted for it.
    assert.deepEqual(ctx.counts, { embedder: 0, llm: 0 });
  }
});

test('ask action: without a question, an interactive session is asked for one', async () => {
  await withWorkDir(async ({ paths }) => {
    const ui = recordingUi({ isInteractive: true, typed: ['Is multi-factor authentication enforced for remote access?'] });
    const result = await ask(makeCtx({ paths, ui }));
    assert.equal(ui.prompts.length, 1);
    assert.equal(result.question, 'Is multi-factor authentication enforced for remote access?');
    assert.equal(result.supported, true);
  });
});

test('ask action: an empty typed question is rejected, and a missing index is reported before prompting', async () => {
  await withWorkDir(async ({ paths }) => {
    const ui = recordingUi({ isInteractive: true, typed: ['   '] });
    await assert.rejects(() => ask(makeCtx({ paths, ui })), (err) => err instanceof ConfigError && /empty/.test(err.message));
  });

  const ui = recordingUi({ isInteractive: true, typed: ['never asked'] });
  await assert.rejects(
    () => ask(makeCtx({ paths: resolvePaths(join(tmpdir(), 'csf-ask-does-not-exist')), ui })),
    (err) => err instanceof StageError && /No document index/.test(err.message) && /ingest/.test(err.hint),
  );
  assert.equal(ui.prompts.length, 0);
});

test('ask action: an index built with another embedder is refused before the model is called', async () => {
  await withWorkDir(async ({ paths }) => {
    const llm = scriptedLlm([{ answer: 'x', supported: false, evidence: [] }]);
    const ctx = makeCtx({ paths, question: 'Is access reviewed?', ui: recordingUi(), llm });
    await assert.rejects(
      () => ask(ctx),
      (err) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /built with embedder "openai:text-embedding-3-small" but the current embedder is "mock"/);
        assert.match(err.hint, /csf-tool ingest/);
        return true;
      },
    );
    assert.equal(llm.calls.length, 0);
    assert.equal(ctx.ui.results.length, 0);
  }, { embedderId: 'openai:text-embedding-3-small' });
});

test('ask action: read-only — no file in the work directory is created or changed', async () => {
  await withWorkDir(async ({ dir, paths }) => {
    // A work directory mid-assessment: every stage has left its file.
    mkdirSync(paths.reportsDir);
    writeFileSync(paths.meta, '{"engine_sig":"abc"}\n');
    writeFileSync(paths.assessments, '{"GV.OC-01":{"coverage":"partial"}}\n');
    writeFileSync(paths.reviews, '{"GV.OC-01":{"decision":"accept"}}\n');
    writeFileSync(paths.target, '{"default":"substantial"}\n');
    writeFileSync(paths.currentProfile, '{"generatedAt":"2026-01-01T00:00:00.000Z"}\n');

    const snapshot = () =>
      readdirSync(dir, { recursive: true })
        .map(String)
        .sort()
        .map((name) => {
          const full = join(dir, name);
          return [name, name === 'reports' ? null : readFileSync(full, 'utf8')];
        });
    const before = snapshot();

    await ask(makeCtx({ paths, question: 'Is multi-factor authentication enforced for remote access?', ui: recordingUi() }));
    await ask(makeCtx({ paths, question: 'What is the vacation allowance for contractors?', ui: recordingUi() }));

    assert.deepEqual(snapshot(), before);
  });
});

test('ask action: without a result-capable UI the answer falls back to the logger and is still returned', async () => {
  await withWorkDir(async ({ paths }) => {
    const logLines = [];
    const result = await ask(makeCtx({ paths, question: 'Is multi-factor authentication enforced for remote access?', ui: { isInteractive: false }, logLines }));
    assert.equal(result.supported, true);
    assert.ok(logLines.some((l) => l.includes(MFA_SENTENCE)));
  });
});

/* ------------------------------ the UI ports ------------------------------ */

test('non-interactive ui.result writes the body to stdout and nothing to the logger', () => {
  const logLines = [];
  const ui = createNonInteractiveUi(silentLogger(logLines));
  const written = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => {
    written.push(String(chunk));
    return true;
  };
  try {
    ui.result('Answer', 'line one\nline two');
  } finally {
    process.stdout.write = original;
  }
  assert.deepEqual(written, ['line one\nline two\n']);
  assert.deepEqual(logLines, []);
});

test('wrapForBox fits every line to the width, keeps list items aligned, and only adds line breaks', () => {
  const text = [
    'Verified quotes (1):',
    `  1. access.md: "${MFA_SENTENCE} ${REVIEW_SENTENCE}"`,
    '',
    'https://intranet.example.org/a-very-long-path-without-any-spaces-that-cannot-be-broken-at-a-word-boundary/index',
  ].join('\n');
  const wrapped = wrapForBox(text, 40);
  const lines = wrapped.split('\n');

  assert.ok(lines.every((l) => l.length <= 40), 'no line exceeds the width');
  assert.equal(lines[0], 'Verified quotes (1):');
  assert.ok(lines[1].startsWith('  1. access.md: '));
  assert.ok(lines[2].startsWith('     ') && !lines[2].startsWith('      '), 'continuation is indented past the marker');
  assert.ok(lines.includes(''), 'blank lines are kept');
  // Nothing but whitespace was added or removed.
  assert.equal(wrapped.replace(/\s+/g, ''), text.replace(/\s+/g, ''));
  // Short text is returned untouched; a tiny or invalid width cannot loop.
  assert.equal(wrapForBox('short line', 80), 'short line');
  assert.ok(wrapForBox(`${' '.repeat(60)}${'word '.repeat(30)}`, 5).split('\n').every((l) => l.length <= 20));
  assert.equal(wrapForBox('abc', Number.NaN), 'abc');
});

/* --------------------------------- the CLI -------------------------------- */

test('CLI: the answer goes to stdout, diagnostics to stderr, and --quiet silences only the diagnostics', async () => {
  await withWorkDir(async ({ dir }) => {
    const args = [
      BIN, 'ask', 'Is multi-factor authentication enforced for remote access?',
      '--work-dir', dir, '--embed-provider', 'mock', '--llm-provider', 'mock', '--top-k', '2',
    ];
    // Run from the temp directory so no local .env or config file is picked up
    // (it holds no csf-tool.config.json, so the built-in defaults apply).
    const normal = await execFileAsync(process.execPath, args, { cwd: dir });
    const quiet = await execFileAsync(process.execPath, [...args, '--quiet'], { cwd: dir });

    assert.ok(normal.stdout.startsWith('Question: Is multi-factor authentication enforced for remote access?\n\nAnswer (AI-generated summary'));
    assert.ok(normal.stdout.includes(`  1. access.md: "${MFA_SENTENCE}"`));
    assert.ok(normal.stdout.endsWith('(retrieval.topK = 2).\n'));
    assert.match(normal.stderr, /Searching 3 indexed passage\(s\)/);
    assert.ok(!normal.stderr.includes(MFA_SENTENCE), 'the answer is not duplicated on stderr');

    assert.equal(quiet.stdout, normal.stdout);
    assert.equal(quiet.stderr, '');
  });
});

test('CLI: a missing question exits non-zero with the usage on stderr and nothing on stdout', async () => {
  await withWorkDir(async ({ dir }) => {
    const args = [BIN, 'ask', '--work-dir', dir, '--embed-provider', 'mock', '--llm-provider', 'mock'];
    await assert.rejects(
      () => execFileAsync(process.execPath, args, { cwd: dir }),
      (err) => {
        assert.equal(err.code, 1);
        assert.equal(err.stdout, '');
        assert.match(err.stderr, /error: No question was given\./);
        assert.match(err.stderr, /csf-tool ask "/);
        return true;
      },
    );
  });
});

test('ask is a documented CLI command and takes its question from the positionals', () => {
  assert.equal(parseCliArgs(['ask', 'is MFA required?']).command, 'ask');
  assert.equal(parseCliArgs(['ask', 'is MFA required?']).overrides.question, 'is MFA required?');
  assert.equal(parseCliArgs(['ask', 'is', 'MFA', 'required?', '--top-k', '3']).overrides.question, 'is MFA required?');
  assert.equal(parseCliArgs(['ask']).overrides.question, undefined);
  assert.match(HELP_TEXT, /^\s+ask\s+Ask a question about the ingested documents/m);
});
