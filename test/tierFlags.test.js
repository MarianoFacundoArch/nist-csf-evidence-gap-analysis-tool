import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCliArgs, HELP_TEXT } from '../src/cli/flags.js';
import { loadConfig } from '../src/core/config.js';
import { defaultConfig } from '../src/core/defaults.js';

// A non-existent config path so only defaults + flag overrides apply.
const NOFILE = { configPath: 'this-file-does-not-exist.json' };

async function resolve(argv) {
  const { overrides, error } = parseCliArgs(argv);
  assert.equal(error, null);
  const warnings = [];
  const { config } = await loadConfig({ ...NOFILE, ...overrides }, { warn: (m) => warnings.push(m) });
  return { config, warnings };
}

test('--tier-current / --tier-target reach the configuration as integers', async () => {
  const { config, warnings } = await resolve(['target', '--tier-current', '2', '--tier-target', '3']);
  assert.equal(config.tierCurrent, 2);
  assert.equal(config.tierTarget, 3);
  assert.deepEqual(warnings, []);
});

test('the Tier inputs default to null and are per-run (never in a starter config)', () => {
  const cfg = defaultConfig();
  assert.equal(cfg.tierCurrent, null);
  assert.equal(cfg.tierTarget, null);
  assert.match(HELP_TEXT, /--tier-current <1-4>/);
  assert.match(HELP_TEXT, /--tier-target <1-4>/);
});

test('a Tier that is not a whole number from 1 to 4 is reported, never silently ignored', async () => {
  for (const bad of ['abc', '0', '5', '2.5', '']) {
    const { config, warnings } = await resolve(['target', '--tier-current', bad]);
    assert.equal(config.tierCurrent, null, `--tier-current ${JSON.stringify(bad)} must not be recorded`);
    assert.equal(warnings.length, 1, `--tier-current ${JSON.stringify(bad)} must produce one warning`);
    assert.match(warnings[0], /tierCurrent/);
  }
});

test('one bad Tier does not discard the other', async () => {
  const { config, warnings } = await resolve(['target', '--tier-current', '2', '--tier-target', 'high']);
  assert.equal(config.tierCurrent, 2);
  assert.equal(config.tierTarget, null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /tierTarget/);
});
