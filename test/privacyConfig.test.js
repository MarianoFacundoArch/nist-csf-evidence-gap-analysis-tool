import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig } from '../src/core/config.js';
import { parseCliArgs, HELP_TEXT } from '../src/cli/flags.js';
import { ConfigError } from '../src/core/errors.js';

const execFileAsync = promisify(execFile);
const BIN = fileURLToPath(new URL('../bin/csf-tool.js', import.meta.url));
const NOFILE = { configPath: 'this-file-does-not-exist.json' };

// Everywhere else an invalid configuration value is repaired to its default
// with a warning. For redaction that would be the wrong way to fail: the
// default is "off", so a typo would send text unredacted while the user
// believes otherwise. A privacy setting is therefore valid or it is an error.

test('privacy settings: valid values are accepted, and --redact switches redaction on', async () => {
  const { config: defaults } = await loadConfig(NOFILE);
  assert.deepEqual(defaults.privacy, { redact: false, terms: [] });

  const { config } = await loadConfig({ ...NOFILE, privacy: { redact: true, terms: ['Northwind', 'Blue Ridge'] } });
  assert.deepEqual(config.privacy, { redact: true, terms: ['Northwind', 'Blue Ridge'] });

  const { config: flagged } = await loadConfig({ ...NOFILE, ...parseCliArgs(['analyze', '--redact']).overrides });
  assert.equal(flagged.privacy.redact, true);
  assert.deepEqual(flagged.privacy.terms, []);
  assert.match(HELP_TEXT, /--redact\s+Pseudonymize identifiers/);
});

test('privacy settings: an invalid, misspelled or misplaced one is an error, never silently "off"', async () => {
  const cases = [
    [{ privacy: { redact: 'true' } }, 'privacy.redact'],
    [{ privacy: { redact: 1 } }, 'privacy.redact'],
    [{ privacy: { redact: 'always' } }, 'privacy.redact'],
    [{ privacy: { redact: true, terms: 'Northwind' } }, 'privacy.terms'],
    [{ privacy: { redact: true, terms: ['Northwind', 7] } }, 'privacy.terms.1'],
    [{ privacy: { redact: true, terms: ['Northwind', ''] } }, 'privacy.terms.1'],
    [{ privacy: { redact: true, term: ['Northwind'] } }, 'privacy.term'],
    [{ privacy: { redaction: true } }, 'privacy.redaction'],
    [{ privacy: true }, 'privacy'],
    [{ redact: true }, 'redact'],
    [{ redaction: { enabled: true } }, 'redaction'],
    [{ terms: ['Northwind'] }, 'terms'],
    [{ privacyTerms: ['Northwind'] }, 'privacyTerms'],
  ];
  for (const [overrides, key] of cases) {
    const warnings = [];
    await assert.rejects(
      () => loadConfig({ ...NOFILE, ...overrides }, { warn: (m) => warnings.push(m) }),
      (err) => {
        assert.ok(err instanceof ConfigError, JSON.stringify(overrides));
        assert.ok(err.message.startsWith(`Invalid privacy setting "${key}":`), `${JSON.stringify(overrides)} -> ${err.message}`);
        assert.match(err.hint, /"privacy": \{ "redact": true, "terms": \[/);
        return true;
      },
    );
  }
});

test('privacy settings: every other invalid value is still repaired with a warning, as before', async () => {
  const warnings = [];
  const { config } = await loadConfig(
    { ...NOFILE, retrieval: { topK: 999 }, bogusKey: true, privacy: { redact: true, terms: ['Northwind'] } },
    { warn: (m) => warnings.push(m) },
  );
  assert.equal(config.retrieval.topK, 6);
  assert.equal(config.bogusKey, undefined);
  assert.deepEqual(config.privacy, { redact: true, terms: ['Northwind'] });
  assert.equal(warnings.length, 2);
});

test('CLI: a bad privacy setting in the config file stops the run with one clear line, even under --quiet', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'csf-privacy-cfg-'));
  try {
    const configPath = join(dir, 'csf-tool.config.json');
    writeFileSync(configPath, JSON.stringify({ privacy: { redact: 'true', terms: ['Northwind'] } }));
    for (const extra of [[], ['--quiet']]) {
      await assert.rejects(
        () => execFileAsync(process.execPath, [BIN, 'status', '--config', configPath, '--work-dir', join(dir, 'work'), ...extra], { cwd: dir }),
        (err) => {
          assert.equal(err.code, 1);
          assert.equal(err.stdout, '');
          assert.match(err.stderr, /^error: Invalid privacy setting "privacy\.redact": must be boolean\.\n {2}→ Redaction settings are never repaired or guessed\./);
          assert.ok(!/\n\s+at /.test(err.stderr), 'no stack trace');
          return true;
        },
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
