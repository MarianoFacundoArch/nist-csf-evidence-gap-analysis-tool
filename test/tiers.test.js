import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as tiersModule from '../src/target/tiers.js';
import {
  CSF_TIERS,
  TIER_SOURCE,
  TIER_BASIS,
  tierName,
  tierLabel,
  resolveTiers,
  tierSentence,
  tierWarnings,
} from '../src/target/tiers.js';
import { newTargetSpec, validateTargetSpec, buildTargetView } from '../src/target/targetProfile.js';
import { buildProfile } from '../src/report/profile.js';
import { buildTargetProfile } from '../src/report/targetJson.js';
import { renderGapMarkdown } from '../src/report/gapMarkdown.js';
import { renderRemediationMarkdown } from '../src/report/remediationMarkdown.js';
import { renderDashboardHtml } from '../src/report/htmlDashboard.js';
import { renderPoamCsv } from '../src/report/poamCsv.js';
import { target as targetAction } from '../src/actions/target.js';
import { parseCliArgs } from '../src/cli/flags.js';
import { buildContext } from '../src/core/context.js';
import { resolvePaths } from '../src/core/paths.js';
import { readJsonSafe } from '../src/util/fsx.js';
import { TargetDataError, ConfigError } from '../src/core/errors.js';

const NOW = '2026-01-01T00:00:00.000Z';

const CSF = {
  frameworkVersion: 'CSF 2.0',
  sample: false,
  functions: [
    { id: 'GV', name: 'GOVERN' },
    { id: 'PR', name: 'PROTECT' },
  ],
  subcategories: [
    sub('GV.OC-01', 'Mission understood', 'GOVERN', 'Organizational Context (GV.OC)'),
    sub('PR.AA-01', 'Identities managed', 'PROTECT', 'Identity Management (PR.AA)'),
  ],
};

function sub(id, outcome, fnName, category) {
  return {
    id, outcome, function: fnName, category,
    functionId: id.split('.')[0], functionName: fnName, categoryId: id.split('-')[0],
    implementationExamples: ['Example action'],
  };
}

function assessment(id, coverage) {
  return {
    subcategory_id: id,
    coverage,
    confidence: 0.8,
    evidence: coverage === 'none' ? [] : [{ source_file: 'policy.md', page: null, score: 0.5, quote: `quote for ${id}`, verified: true }],
    rationale: `rationale for ${id}`,
    needs_review: false,
    verification: { quotes_checked: 1, quotes_verified: 1, downgraded: false },
  };
}

const CTX = {
  config: { analysis: { strict: false }, embeddings: { provider: 'mock' }, llm: { provider: 'mock' } },
  now: () => NOW,
};

function build(target) {
  const assessments = { 'GV.OC-01': assessment('GV.OC-01', 'substantial'), 'PR.AA-01': assessment('PR.AA-01', 'none') };
  const profile = buildProfile(CTX, { csf: CSF, assessments, reviews: {}, meta: {} });
  const view = buildTargetView(profile, validateTargetSpec(target), CSF);
  return { profile, view };
}

/** Every target-side rendering of a profile, to compare "with" against "without". */
function renderAll({ profile, view }) {
  return {
    targetJson: JSON.stringify(buildTargetProfile(profile, view), null, 2),
    gap: renderGapMarkdown(profile, { targetView: view }),
    plan: renderRemediationMarkdown(profile, view),
    poam: renderPoamCsv(profile, view),
    dashboardData: /<script id="csf-data" type="application\/json">([\s\S]*?)<\/script>/.exec(renderDashboardHtml(profile, view))[1],
  };
}

/* ------------------------------ the constants ----------------------------- */

test('the four CSF 2.0 Tiers ship as numbers and official names only', () => {
  assert.deepEqual(CSF_TIERS, [
    { tier: 1, name: 'Partial' },
    { tier: 2, name: 'Risk Informed' },
    { tier: 3, name: 'Repeatable' },
    { tier: 4, name: 'Adaptive' },
  ]);
  // Names only: no description field anywhere in the module's data. The
  // meaning of a Tier is NIST's text, and the reader is pointed there.
  for (const tier of CSF_TIERS) assert.deepEqual(Object.keys(tier), ['tier', 'name']);
  assert.equal(TIER_SOURCE, 'NIST Cybersecurity Framework (CSF) 2.0, NIST CSWP 29, Appendix B');
  const strings = Object.values(tiersModule).filter((value) => typeof value === 'string');
  assert.deepEqual(strings.sort(), [TIER_BASIS, TIER_SOURCE].sort());

  assert.equal(tierName(2), 'Risk Informed');
  assert.equal(tierName(0), null);
  assert.equal(tierName(5), null);
  assert.equal(tierName('2'), null);
  assert.equal(tierLabel(4), 'Tier 4 (Adaptive)');
  assert.equal(tierLabel(null), 'not recorded');
});

/* ------------------------------- target.json ------------------------------ */

test('tiers: newTargetSpec includes them and a missing or partial selection is completed with nulls', () => {
  assert.deepEqual(newTargetSpec(NOW).tiers, { current: null, target: null, note: null });
  assert.deepEqual(validateTargetSpec({ default: 'full' }).tiers, { current: null, target: null, note: null });
  assert.deepEqual(validateTargetSpec({ default: 'full', tiers: { current: 2 } }).tiers, { current: 2, target: null, note: null });
  assert.deepEqual(
    validateTargetSpec({ default: 'full', tiers: { current: 1, target: 4, note: 'Board decision.' } }).tiers,
    { current: 1, target: 4, note: 'Board decision.' },
  );
});

test('tiers: only the numbers 1 to 4 (or null) are accepted', () => {
  for (const tiers of [
    { current: 0 }, { current: 5 }, { target: 2.5 }, { target: -1 }, { current: '2' }, { current: true },
    { current: 'Risk Informed' },
  ]) {
    assert.throws(() => validateTargetSpec({ default: 'full', tiers }), (err) => {
      assert.ok(err instanceof TargetDataError);
      assert.match(err.message, /\/tiers\/(current|target) must be a CSF Tier number \(1, 2, 3 or 4\) or null/);
      return true;
    }, JSON.stringify(tiers));
  }
  assert.throws(() => validateTargetSpec({ default: 'full', tiers: { goal: 3 } }), /\/tiers has an unknown field "goal"/);
  assert.throws(() => validateTargetSpec({ default: 'full', tiers: { note: 7 } }), TargetDataError);
  assert.throws(() => validateTargetSpec({ default: 'full', tiers: 3 }), /\/tiers must be object/);
  for (const tier of [1, 2, 3, 4, null]) {
    assert.doesNotThrow(() => validateTargetSpec({ default: 'full', tiers: { current: tier, target: tier } }));
  }
});

test('tiers: validation completes the selection without rewriting the object it was given', () => {
  // `status` hashes the raw file after validating a shallow copy of it.
  const raw = { default: 'substantial', tiers: { current: 2 } };
  const before = JSON.stringify(raw);
  const validated = validateTargetSpec({ ...raw });
  assert.equal(JSON.stringify(raw), before);
  assert.notEqual(validated.tiers, raw.tiers);
});

/* --------------------------------- the view -------------------------------- */

test('resolveTiers resolves names, attaches the label and the source, and is null when nothing is recorded', () => {
  assert.deepEqual(resolveTiers({ current: 2, target: 3, note: '  Reviewed yearly.  ' }), {
    current: { tier: 2, name: 'Risk Informed' },
    target: { tier: 3, name: 'Repeatable' },
    note: 'Reviewed yearly.',
    basis: 'Selected by the organization and recorded in the target profile; not derived by this tool.',
    definitions: TIER_SOURCE,
  });
  assert.deepEqual(resolveTiers({ current: 4, target: null, note: null }).target, null);
  // A note without a Tier is not a selection: nothing to label "selected by the organization".
  for (const nothing of [
    undefined, null, {}, { current: null, target: null, note: null }, { note: '   ' },
    { current: null, target: null, note: 'Selection deferred to Q3.' },
  ]) {
    assert.equal(resolveTiers(nothing), null, JSON.stringify(nothing));
  }
});

test('target view carries the selection with names resolved', () => {
  const { view } = build({ default: 'substantial', tiers: { current: 2, target: 3, note: 'Committee decision.' } });
  assert.deepEqual(view.tiers.current, { tier: 2, name: 'Risk Informed' });
  assert.deepEqual(view.tiers.target, { tier: 3, name: 'Repeatable' });
  assert.equal(view.tiers.note, 'Committee decision.');
  assert.equal(view.tiers.basis, TIER_BASIS);
});

test('a Tier is recorded, never derived: coverage does not change it, and it changes no coverage figure', () => {
  const recorded = build({ default: 'substantial', tiers: { current: 4, target: 4 } });
  const none = build({ default: 'substantial' });
  // Tier 4 on a profile with a "none" outcome is carried exactly as recorded...
  assert.equal(recorded.view.tiers.current.tier, 4);
  // ...and the met/unmet figures and every entry are identical with or without it.
  assert.deepEqual(recorded.view.summary, none.view.summary);
  assert.deepEqual(recorded.view.entries, none.view.entries);
});

/* ------------------------------ the deliverables --------------------------- */

test('every target deliverable shows the selection, labeled as selected and not derived', () => {
  const rendered = build({ default: 'substantial', tiers: { current: 2, target: 3, note: 'Committee decision of 2025-12-10.' } });
  const { profile, view } = rendered;
  const sentence =
    'CSF Tier — current: Tier 2 (Risk Informed); target: Tier 3 (Repeatable). Selected by the organization and ' +
    'recorded in the target profile; not derived by this tool. Tier definitions: NIST Cybersecurity Framework ' +
    '(CSF) 2.0, NIST CSWP 29, Appendix B.';
  assert.equal(tierSentence(view.tiers), sentence);

  // target-profile.json
  const json = buildTargetProfile(profile, view);
  assert.deepEqual(json.tiers, {
    current: { tier: 2, name: 'Risk Informed' },
    target: { tier: 3, name: 'Repeatable' },
    note: 'Committee decision of 2025-12-10.',
    basis: TIER_BASIS,
    definitions: TIER_SOURCE,
  });

  // gap-analysis.md: inside the "Current vs Target" section.
  const gap = renderGapMarkdown(profile, { targetView: view });
  const section = gap.slice(gap.indexOf('## Current vs Target'), gap.indexOf('## Gaps and partial coverage'));
  assert.ok(section.includes(`\n${sentence}\n`));
  assert.ok(section.includes('\nTier note: Committee decision of 2025-12-10.\n'));
  assert.ok(!renderGapMarkdown(profile, {}).includes('CSF Tier'));

  // remediation-plan.md: in the overview.
  const plan = renderRemediationMarkdown(profile, view);
  const overview = plan.slice(plan.indexOf('## Overview'), plan.indexOf('## Current vs target by Function'));
  assert.ok(overview.includes(`\n- ${sentence}\n`));
  assert.ok(overview.includes('\n- Tier note: Committee decision of 2025-12-10.\n'));

  // dashboard: the embedded view carries it (the tile itself is exercised in dashboardRuntime.test.js).
  const data = JSON.parse(renderAll(rendered).dashboardData);
  assert.deepEqual(data.target.tiers, json.tiers);
});

test('a one-sided selection says which side is not recorded instead of leaving a blank', () => {
  const { profile, view } = build({ default: 'substantial', tiers: { current: 2 } });
  assert.match(renderRemediationMarkdown(profile, view), /- CSF Tier — current: Tier 2 \(Risk Informed\); target: not recorded\. Selected by the organization/);
  assert.ok(!renderRemediationMarkdown(profile, view).includes('Tier note'));
  assert.equal(buildTargetProfile(profile, view).tiers.target, null);
});

test('a Tier note is kept to one line in the Markdown reports', () => {
  const { profile, view } = build({
    default: 'substantial',
    tiers: { current: 2, target: 3, note: 'Committee decision.\n\n## Gaps and partial coverage (address these first)\n- **PR.AA-01** — _full_' },
  });
  const flat = 'Tier note: Committee decision. ## Gaps and partial coverage (address these first) - **PR.AA-01** — _full_';
  const gap = renderGapMarkdown(profile, { targetView: view });
  assert.ok(gap.includes(`\n${flat}\n`));
  assert.equal(gap.split('\n## Gaps and partial coverage').length - 1, 1, 'no second section heading');
  assert.ok(renderRemediationMarkdown(profile, view).includes(`\n- ${flat}\n`));
});

test('no Tier recorded: every output is byte-identical to a profile that never mentions tiers', () => {
  const never = renderAll(build({ default: 'substantial', priorities: { PR: 'high' } }));
  for (const tiers of [{}, { current: null, target: null, note: null }, { note: '' }, { note: 'Selection deferred to Q3.' }]) {
    const withEmpty = renderAll(build({ default: 'substantial', priorities: { PR: 'high' }, tiers }));
    assert.deepEqual(withEmpty, never, JSON.stringify(tiers));
  }
  for (const text of Object.values(never)) {
    assert.ok(!/tier/i.test(text.replace(/coverage tiers?/gi, '')), 'no Tier line, placeholder or key');
  }
  assert.ok(!Object.hasOwn(build({ default: 'substantial' }).view, 'tiers'));
});

/* -------------------------------- the warning ------------------------------ */

test('a target Tier below the current Tier is allowed, with a warning', () => {
  assert.doesNotThrow(() => validateTargetSpec({ default: 'full', tiers: { current: 3, target: 1 } }));
  const warnings = tierWarnings({ current: 3, target: 1 });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /The target CSF Tier, Tier 1 \(Partial\), is lower than the current one, Tier 3 \(Repeatable\)\./);
  assert.match(warnings[0], /That is allowed/);

  for (const fine of [{ current: 2, target: 2 }, { current: 1, target: 4 }, { current: 3, target: null }, { current: null, target: 1 }, {}, null]) {
    assert.deepEqual(tierWarnings(fine), []);
  }
});

/* ------------------------------ the target stage --------------------------- */

async function withTargetStage(config, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'csf-tiers-'));
  const logs = { info: [], warn: [] };
  try {
    const ctx = {
      config: { csfCorePath: resolve('data/csf-core.json'), targetDefault: null, targetImport: null, tierCurrent: null, tierTarget: null, ...config(dir) },
      paths: resolvePaths(dir),
      logger: { info: (m) => logs.info.push(m), warn: (m) => logs.warn.push(m), debug() {}, error() {} },
      ui: { isInteractive: false },
      now: () => NOW,
    };
    return await fn(ctx, logs, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('target stage: --tier-current / --tier-target record the selection, and combine with --target-default', async () => {
  await withTargetStage(() => ({ tierCurrent: 2, tierTarget: 3, targetDefault: 'full' }), async (ctx, logs) => {
    const result = await targetAction(ctx);
    assert.equal(result.saved, true);
    const spec = await readJsonSafe(ctx.paths.target);
    assert.equal(spec.default, 'full');
    assert.deepEqual(spec.tiers, { current: 2, target: 3, note: null });
    assert.ok(logs.info.some((m) => m.includes('CSF Tier (selected by the organization): current Tier 2 (Risk Informed), target Tier 3 (Repeatable)')));
    assert.deepEqual(logs.warn, []);
  });
});

test('target stage: a tier flag alone is enough input, and sets only its own side', async () => {
  await withTargetStage(() => ({ tierCurrent: 2 }), async (ctx) => {
    await targetAction(ctx);
    assert.deepEqual((await readJsonSafe(ctx.paths.target)).tiers, { current: 2, target: null, note: null });

    // A later run with the other flag keeps what is already recorded — including a hand-written note.
    const spec = await readJsonSafe(ctx.paths.target);
    spec.tiers.note = 'Agreed with the board.';
    spec.priorities = { GV: 'high' };
    await writeFile(ctx.paths.target, JSON.stringify(spec));
    ctx.config.tierCurrent = null;
    ctx.config.tierTarget = 4;
    await targetAction(ctx);
    const updated = await readJsonSafe(ctx.paths.target);
    assert.deepEqual(updated.tiers, { current: 2, target: 4, note: 'Agreed with the board.' });
    assert.deepEqual(updated.priorities, { GV: 'high' });
  });
});

test('target stage: tier flags apply on top of --target-import', async () => {
  await withTargetStage((dir) => ({ targetImport: join(dir, 'import.json'), tierTarget: 3 }), async (ctx, logs, dir) => {
    await writeFile(join(dir, 'import.json'), JSON.stringify({
      default: 'partial',
      tiers: { current: 1, target: 2, note: 'From the sector profile.' },
      plan: { 'PR.AA-05': { owner: 'IT lead' } },
    }));
    await targetAction(ctx);
    const spec = await readJsonSafe(ctx.paths.target);
    assert.equal(spec.default, 'partial');
    assert.deepEqual(spec.tiers, { current: 1, target: 3, note: 'From the sector profile.' });
    assert.deepEqual(spec.plan, { 'PR.AA-05': { owner: 'IT lead' } });
  });
});

test('target stage: a target Tier below the current one is saved, with a warning', async () => {
  await withTargetStage(() => ({ tierCurrent: 3, tierTarget: 1 }), async (ctx, logs) => {
    await targetAction(ctx);
    assert.deepEqual((await readJsonSafe(ctx.paths.target)).tiers, { current: 3, target: 1, note: null });
    assert.equal(logs.warn.length, 1);
    assert.match(logs.warn[0], /is lower than the current one/);
  });
});

test('target stage: an invalid Tier number is refused before anything is written', async () => {
  for (const bad of [0, 5, 2.5, '2']) {
    await withTargetStage(() => ({ tierCurrent: bad, targetDefault: 'full' }), async (ctx) => {
      await assert.rejects(targetAction(ctx), (err) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, /--tier-current must be a CSF Tier number from 1 to 4/);
        assert.match(err.hint, /1 Partial, 2 Risk Informed, 3 Repeatable, 4 Adaptive/);
        return true;
      });
      assert.equal(await readJsonSafe(ctx.paths.target, null), null);
    });
  }
});

test('target stage: without any input it still explains what to pass, tier flags included', async () => {
  await withTargetStage(() => ({}), async (ctx) => {
    await assert.rejects(targetAction(ctx), (err) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.hint, /--tier-current \/ --tier-target <1-4>/);
      return true;
    });
  });
});

test('flags path end to end: csf-tool target --tier-current 2 --tier-target 3', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'csf-tiers-cli-'));
  try {
    const parsed = parseCliArgs(['target', '--work-dir', dir, '--tier-current', '2', '--tier-target', '3', '--quiet']);
    assert.equal(parsed.command, 'target');
    assert.equal(parsed.overrides.tierCurrent, 2);
    assert.equal(parsed.overrides.tierTarget, 3);

    const ctx = await buildContext(parsed.overrides);
    ctx.ui = { isInteractive: false };
    await targetAction(ctx);
    assert.deepEqual((await readJsonSafe(ctx.paths.target)).tiers, { current: 2, target: 3, note: null });

    // An out-of-range value never reaches the target profile: the config layer drops it with a warning.
    const warnings = [];
    const bad = parseCliArgs(['target', '--work-dir', dir, '--tier-current', '7', '--quiet']);
    assert.equal(bad.overrides.tierCurrent, 7);
    const { loadConfig } = await import('../src/core/config.js');
    const { config } = await loadConfig(bad.overrides, { warn: (m) => warnings.push(m) });
    assert.equal(config.tierCurrent, null);
    assert.ok(warnings.some((m) => m.includes('/tierCurrent')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/* ---------------------------- the interactive editor ----------------------- */

/** Answer for a text prompt: press Enter on the pre-filled field, changing nothing. */
const ENTER = Symbol('enter');

/**
 * A scripted stand-in for the interactive UI: answers prompts in order. Like
 * the real text prompt, a field is pre-filled with `initial`: ENTER returns
 * that text unchanged, while '' means the person erased it.
 */
function scriptedUi(answers) {
  const queue = [...answers];
  const seen = { prompts: [], info: [], warn: [], options: [] };
  const next = (kind, message) => {
    assert.ok(queue.length > 0, `unexpected ${kind} prompt: ${message}`);
    seen.prompts.push(message);
    return queue.shift();
  };
  return {
    seen,
    remaining: queue,
    isInteractive: true,
    info: (m) => seen.info.push(m),
    warn: (m) => seen.warn.push(m),
    success() {},
    note() {},
    async select(message, options) {
      seen.options.push(options);
      const answer = next('select', message);
      assert.ok(options.some((o) => o.value === answer), `"${answer}" is not an option of: ${message}`);
      return answer;
    },
    async confirm() {
      return true;
    },
    async text(message, { initial } = {}) {
      const answer = next('text', message);
      return answer === ENTER ? (initial ?? '') : answer;
    },
  };
}

test('interactive editor: one entry records current Tier, target Tier and a note', async () => {
  await withTargetStage(() => ({}), async (ctx) => {
    ctx.ui = scriptedUi(['tiers', '2', '3', '  Agreed by the Security Committee.  ', 'save']);
    const result = await targetAction(ctx);

    assert.equal(result.saved, true);
    assert.deepEqual(ctx.ui.remaining, []);
    assert.deepEqual((await readJsonSafe(ctx.paths.target)).tiers, {
      current: 2,
      target: 3,
      note: 'Agreed by the Security Committee.',
    });
    // The editor offers the four Tiers by number and name, and points to NIST for their meaning.
    const tierOptions = ctx.ui.seen.options[1].map((o) => o.label);
    assert.deepEqual(tierOptions, [
      'not recorded (keep as is)',
      'Tier 1 — Partial',
      'Tier 2 — Risk Informed',
      'Tier 3 — Repeatable',
      'Tier 4 — Adaptive',
    ]);
    assert.equal(ctx.ui.seen.options[1][0].value, 'keep');
    assert.ok(ctx.ui.seen.info.some((m) => m.includes('selected by the organization') && m.includes(TIER_SOURCE)));
    assert.deepEqual(ctx.ui.seen.warn, []);
    // The menu header reflects the selection once made.
    assert.match(ctx.ui.seen.prompts.at(-1), /CSF Tier: current Tier 2 \(Risk Informed\), target Tier 3 \(Repeatable\)/);
  });
});

test('interactive editor: a lower target Tier is accepted with a warning, and a selection can be cleared', async () => {
  await withTargetStage(() => ({}), async (ctx) => {
    ctx.ui = scriptedUi(['tiers', '4', '2', '', 'save']);
    await targetAction(ctx);
    assert.deepEqual((await readJsonSafe(ctx.paths.target)).tiers, { current: 4, target: 2, note: null });
    assert.equal(ctx.ui.seen.warn.length, 1);
    assert.match(ctx.ui.seen.warn[0], /is lower than the current one/);

    ctx.ui = scriptedUi(['tiers', 'none', 'none', '', 'save']);
    await targetAction(ctx);
    assert.deepEqual((await readJsonSafe(ctx.paths.target)).tiers, { current: null, target: null, note: null });
    // The recorded Tier was marked in the list the person chose from, and
    // clearing it was the LAST option — never the one Enter picks.
    assert.deepEqual(ctx.ui.seen.options[1].map((o) => o.label), [
      'keep Tier 4 (Adaptive)',
      'Tier 1 — Partial',
      'Tier 2 — Risk Informed',
      'Tier 3 — Repeatable',
      'Tier 4 — Adaptive (recorded)',
      'not recorded (clear the selection)',
    ]);
  });
});

test('interactive editor: pressing Enter through the Tier entry changes nothing', async () => {
  await withTargetStage(() => ({ tierCurrent: 3, tierTarget: 4 }), async (ctx) => {
    await targetAction(ctx);
    const recorded = await readJsonSafe(ctx.paths.target);
    recorded.tiers.note = 'Agreed with the board.';
    await writeFile(ctx.paths.target, JSON.stringify(recorded));
    ctx.config.tierCurrent = null;
    ctx.config.tierTarget = null;

    // Enter on each prompt = the first option of both selects, and the pre-filled note as it is.
    ctx.ui = scriptedUi(['tiers']);
    const firstOption = ctx.ui.select;
    let selects = 0;
    ctx.ui.select = async (message, options) => {
      selects++;
      if (selects === 1) return firstOption(message, options); // the menu: "tiers"
      if (selects <= 3) return options[0].value; // the two Tier prompts: whatever Enter picks
      return 'save';
    };
    ctx.ui.text = async (message, { initial } = {}) => initial ?? '';
    await targetAction(ctx);

    assert.deepEqual((await readJsonSafe(ctx.paths.target)).tiers, { current: 3, target: 4, note: 'Agreed with the board.' });
  });
});

test('interactive editor: the note can be kept, replaced, or erased', async () => {
  await withTargetStage(() => ({ tierCurrent: 2 }), async (ctx) => {
    await targetAction(ctx);
    ctx.config.tierCurrent = null;
    const note = async () => (await readJsonSafe(ctx.paths.target)).tiers.note;

    ctx.ui = scriptedUi(['tiers', 'keep', 'keep', 'First note.', 'save']);
    await targetAction(ctx);
    assert.equal(await note(), 'First note.');

    ctx.ui = scriptedUi(['tiers', 'keep', 'keep', ENTER, 'save']);
    await targetAction(ctx);
    assert.equal(await note(), 'First note.');

    ctx.ui = scriptedUi(['tiers', 'keep', 'keep', '', 'save']);
    await targetAction(ctx);
    assert.equal(await note(), null);
  });
});

test('interactive editor: re-entering the same selection is not an unsaved change', async () => {
  await withTargetStage(() => ({ tierCurrent: 2, tierTarget: 3 }), async (ctx) => {
    await targetAction(ctx); // record 2 -> 3 through the flags
    ctx.config.tierCurrent = null;
    ctx.config.tierTarget = null;
    // Same answers again, then leave: no "discard unsaved changes?" confirmation is needed.
    ctx.ui = scriptedUi(['tiers', '2', '3', '', 'discard']);
    ctx.ui.confirm = async () => assert.fail('nothing changed, so nothing to confirm');
    const result = await targetAction(ctx);
    assert.equal(result.saved, false);
  });
});
