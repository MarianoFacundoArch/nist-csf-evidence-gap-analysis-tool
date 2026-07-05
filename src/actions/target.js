/**
 * TARGET action: define the Target Profile — the "where do we want to be" half
 * of a CSF 2.0 Organizational Profile (the report stage builds the "where are
 * we" half from reviewed assessments; comparing the two yields the prioritized
 * remediation plan).
 *
 * The spec lives in <work-dir>/target.json and is HUMAN-owned state, exactly
 * like reviews.json: re-running any pipeline stage never touches it. Three ways
 * to drive this stage, sharing one code path:
 *   - interactive editor (menu or `csf-tool target` in a terminal),
 *   - one-shot flags (--target-default, --target-import) for scripted runs,
 *   - editing target.json by hand (validated on every load).
 *
 * No AI is involved anywhere in this stage: targets, priorities, and notes are
 * purely human decisions, applied deterministically.
 */

import { loadCsfCore } from '../csf/loader.js';
import { buildProfile } from '../report/profile.js';
import {
  loadTargetSpec,
  newTargetSpec,
  resolveTarget,
  buildTargetView,
  NOT_APPLICABLE,
  PRIORITY_LEVELS,
  DEFAULT_PRIORITY,
} from '../target/targetProfile.js';
import { COVERAGE_LEVELS } from '../engine/coverage.js';
import { readJsonSafe, fileExists, writeJsonAtomic } from '../util/fsx.js';
import { ConfigError } from '../core/errors.js';

export async function target(ctx) {
  const { logger, config, ui } = ctx;
  const csf = await loadCsfCore(config.csfCorePath, logger);
  const existed = await fileExists(ctx.paths.target);

  let spec;
  let changed = false;

  if (config.targetImport) {
    // Wholesale replacement: deliberately does NOT read the current spec, so an
    // import also recovers from a corrupt target.json. Loading the file through
    // loadTargetSpec gives the import the same validation AND unknown-key
    // warnings as any load, so a typo'd id is flagged at import time.
    const imported = await loadTargetSpec(config.targetImport, { csf, logger });
    if (imported == null) {
      throw new ConfigError(`Target profile to import not found: ${config.targetImport}`);
    }
    spec = imported;
    spec.createdAt ??= ctx.now();
    logger.info(`Imported target profile from ${config.targetImport}.`);
    changed = true;
  } else {
    spec = (await loadTargetSpec(ctx.paths.target, { csf, logger })) ?? newTargetSpec(ctx.now());
  }

  // --target-default sets/overwrites the baseline (on top of an import, if both).
  if (config.targetDefault) {
    spec.default = config.targetDefault;
    changed = true;
  }

  if (changed) {
    return persistAndSummarize(ctx, spec, csf, existed);
  }

  if (!ui?.isInteractive) {
    throw new ConfigError('The target stage needs input, and this session is not interactive.', {
      hint: `Pass --target-default <level> or --target-import <path>, or edit ${ctx.paths.target} by hand.`,
    });
  }

  return editInteractively(ctx, spec, csf, existed);
}

async function persistAndSummarize(ctx, spec, csf, existed) {
  spec.updatedAt = ctx.now();
  await writeJsonAtomic(ctx.paths.target, spec);
  const counts = resolvedCounts(spec, csf);
  ctx.logger.info(`Target profile ${existed ? 'updated' : 'created'}: ${ctx.paths.target}`);
  ctx.logger.info(`  resolved targets: ${formatCounts(counts)}`);
  ctx.logger.info('Run `csf-tool report` to generate the remediation plan against this target.');
  return { path: ctx.paths.target, saved: true, counts };
}

/* ------------------------------- interactive ------------------------------ */

async function editInteractively(ctx, spec, csf, existed) {
  const { ui } = ctx;
  let dirty = false;

  ui.info(
    existed
      ? 'Editing the existing target profile. Changes are kept in memory until you choose "Save".'
      : 'No target profile yet — starting one. The baseline goal applies to every outcome; add sparse overrides where your goal differs.',
  );

  for (;;) {
    const o = overrideCounts(spec);
    const choice = await ui.select(
      `Target profile — baseline: ${spec.default}; overrides: ${o.functions} function, ${o.categories} category, ${o.subcategories} subcategory; priorities: ${o.priorities}${dirty ? '  (unsaved changes)' : ''}`,
      [
        { value: 'baseline', label: `Set the baseline target for every outcome (now: ${spec.default})` },
        { value: 'function', label: 'Override a Function' },
        { value: 'category', label: 'Override a Category' },
        { value: 'subcategory', label: 'Override a Subcategory (target, priority, note)' },
        { value: 'priority', label: 'Set a remediation priority' },
        { value: 'preview', label: 'Preview resolved targets (vs current assessment, if any)' },
        { value: 'save', label: 'Save and exit' },
        { value: 'discard', label: 'Exit without saving' },
      ],
    );

    if (choice === 'save') {
      const res = await persistAndSummarize(ctx, spec, csf, existed);
      ui.success('Target profile saved.');
      return res;
    }
    if (choice === 'discard') {
      if (!dirty || (await ui.confirm('Discard unsaved target changes?', false))) {
        ui.info('Target profile left unchanged.');
        return { path: ctx.paths.target, saved: false, counts: resolvedCounts(spec, csf) };
      }
      continue;
    }

    if (choice === 'baseline') dirty = (await editBaseline(ui, spec)) || dirty;
    else if (choice === 'function') dirty = (await editOverride(ui, spec, csf, 'functions')) || dirty;
    else if (choice === 'category') dirty = (await editOverride(ui, spec, csf, 'categories')) || dirty;
    else if (choice === 'subcategory') dirty = (await editSubcategory(ui, spec, csf)) || dirty;
    else if (choice === 'priority') dirty = (await editPriority(ui, spec, csf)) || dirty;
    else if (choice === 'preview') await preview(ctx, spec, csf);
  }
}

async function editBaseline(ui, spec) {
  const level = await ui.select(
    'Baseline target for every outcome (overrides stay in place)',
    COVERAGE_LEVELS.map((c) => ({ value: c, label: c === spec.default ? `${c} (current)` : c })),
  );
  if (level === spec.default) return false;
  spec.default = level;
  return true;
}

async function editOverride(ui, spec, csf, mapName) {
  const key = mapName === 'functions' ? await pickFunction(ui, spec, csf) : await pickCategory(ui, spec, csf);
  return applyLevelChoice(ui, spec, mapName, key, `Target for ${key}`);
}

async function editSubcategory(ui, spec, csf) {
  const sub = await pickSubcategory(ui, spec, csf);
  let dirty = await applyLevelChoice(ui, spec, 'subcategories', sub.id, `Target for ${sub.id}`);

  const resolvedPrio = resolveTarget(spec, sub).priority;
  const prio = await ui.select(`Remediation priority for ${sub.id}`, [
    { value: 'inherit', label: `inherit (resolves to: ${resolvedPrio})` },
    ...PRIORITY_LEVELS.map((p) => ({ value: p, label: spec.priorities[sub.id] === p ? `${p} (current)` : p })),
  ]);
  if (prio === 'inherit') {
    if (spec.priorities[sub.id]) {
      delete spec.priorities[sub.id];
      dirty = true;
    }
  } else if (spec.priorities[sub.id] !== prio) {
    spec.priorities[sub.id] = prio;
    dirty = true;
  }

  const note = (await ui.text(`Note for ${sub.id} (why this target/priority; empty clears)`, {
    initial: spec.notes[sub.id] ?? '',
  })).trim();
  if (note && note !== spec.notes[sub.id]) {
    spec.notes[sub.id] = note;
    dirty = true;
  } else if (!note && spec.notes[sub.id]) {
    delete spec.notes[sub.id];
    dirty = true;
  }
  return dirty;
}

async function editPriority(ui, spec, csf) {
  const scope = await ui.select('Priority applies to', [
    { value: 'functions', label: 'A whole Function' },
    { value: 'categories', label: 'A whole Category' },
    { value: 'subcategories', label: 'A single Subcategory' },
  ]);
  const key =
    scope === 'functions'
      ? await pickFunction(ui, spec, csf)
      : scope === 'categories'
        ? await pickCategory(ui, spec, csf)
        : (await pickSubcategory(ui, spec, csf)).id;

  const current = spec.priorities[key];
  const prio = await ui.select(`Remediation priority for ${key}`, [
    { value: 'clear', label: `clear (fall back to the cascade, default: ${DEFAULT_PRIORITY})` },
    ...PRIORITY_LEVELS.map((p) => ({ value: p, label: current === p ? `${p} (current)` : p })),
  ]);
  if (prio === 'clear') {
    if (!current) return false;
    delete spec.priorities[key];
    return true;
  }
  if (current === prio) return false;
  spec.priorities[key] = prio;
  return true;
}

/**
 * Shared "pick a level for this key" step: inherit (delete the override) or an
 * explicit level including not-applicable. Returns whether the spec changed.
 */
async function applyLevelChoice(ui, spec, mapName, key, message) {
  const current = spec[mapName][key];
  const options = [
    { value: 'inherit', label: current ? 'inherit (remove this override)' : 'inherit (no override — keep as is)' },
    ...COVERAGE_LEVELS.map((c) => ({ value: c, label: current === c ? `${c} (current)` : c })),
    {
      value: NOT_APPLICABLE,
      label: current === NOT_APPLICABLE ? `${NOT_APPLICABLE} (current)` : `${NOT_APPLICABLE} (out of scope)`,
    },
  ];
  const level = await ui.select(message, options);
  if (level === 'inherit') {
    if (current == null) return false;
    delete spec[mapName][key];
    return true;
  }
  if (current === level) return false;
  spec[mapName][key] = level;
  return true;
}

/* -------------------------------- pickers --------------------------------- */

const mark = (override, prio) =>
  `${override ? `  [target: ${override}]` : ''}${prio ? `  [priority: ${prio}]` : ''}`;

async function pickFunction(ui, spec, csf) {
  return ui.select(
    'Function',
    csf.functions.map((f) => ({
      value: f.id,
      label: `${f.id} — ${f.name}${mark(spec.functions[f.id], spec.priorities[f.id])}`,
    })),
  );
}

async function pickCategory(ui, spec, csf) {
  const seen = new Map();
  for (const s of csf.subcategories) if (!seen.has(s.categoryId)) seen.set(s.categoryId, s.category);
  return ui.select(
    'Category',
    [...seen.entries()].map(([id, name]) => ({
      value: id,
      label: `${name}${mark(spec.categories[id], spec.priorities[id])}`,
    })),
  );
}

async function pickSubcategory(ui, spec, csf) {
  const categoryId = await pickCategory(ui, spec, csf);
  const subs = csf.subcategories.filter((s) => s.categoryId === categoryId);
  const id = await ui.select(
    'Subcategory',
    subs.map((s) => ({
      value: s.id,
      label: `${s.id} — ${truncate(s.outcome, 70)}${mark(spec.subcategories[s.id], spec.priorities[s.id])}`,
    })),
  );
  return subs.find((s) => s.id === id);
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/* -------------------------------- preview --------------------------------- */

async function preview(ctx, spec, csf) {
  const { ui } = ctx;
  const counts = resolvedCounts(spec, csf);
  const lines = [`Resolved targets: ${formatCounts(counts)}`];

  // Live current-vs-target preview when assessments exist (never required).
  if (await fileExists(ctx.paths.assessments)) {
    const assessments = (await readJsonSafe(ctx.paths.assessments, {})) ?? {};
    const reviews = (await readJsonSafe(ctx.paths.reviews, {})) ?? {};
    const meta = (await readJsonSafe(ctx.paths.meta, {})) ?? {};
    const profile = buildProfile(ctx, { csf, assessments, reviews, meta });
    const view = buildTargetView(profile, spec, csf);
    const s = view.summary;
    lines.push(
      '',
      `Against the current assessment: met ${s.met}/${s.applicable} (${s.pctMet}%), unmet ${s.unmet}` +
        `${s.notApplicable ? `, out of scope ${s.notApplicable}` : ''}`,
      `Unmet by priority: high ${s.unmetByPriority.high}, medium ${s.unmetByPriority.medium}, low ${s.unmetByPriority.low}`,
      '',
      ...s.byFunction.map(
        (f) => `  ${f.function}: met ${f.met}/${f.applicable} (${f.pctMet}%)${f.notApplicable ? `, n/a ${f.notApplicable}` : ''}`,
      ),
    );
  } else {
    lines.push('', 'No assessments yet — run `csf-tool analyze` to preview current-vs-target here.');
  }
  ui.note('Target preview', lines.join('\n'));
}

/* -------------------------------- helpers --------------------------------- */

function overrideCounts(spec) {
  return {
    functions: Object.keys(spec.functions).length,
    categories: Object.keys(spec.categories).length,
    subcategories: Object.keys(spec.subcategories).length,
    priorities: Object.keys(spec.priorities).length,
  };
}

function resolvedCounts(spec, csf) {
  const counts = { none: 0, partial: 0, substantial: 0, full: 0, [NOT_APPLICABLE]: 0 };
  for (const sub of csf.subcategories) counts[resolveTarget(spec, sub).target]++;
  return counts;
}

function formatCounts(counts) {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k} ${n}`)
    .join(', ');
}
