import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/core/config.js';
import { ConfigError } from '../src/core/errors.js';

const execFileAsync = promisify(execFile);
const BIN = fileURLToPath(new URL('../bin/csf-tool.js', import.meta.url));

async function withDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'csf-cfgfile-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const exists = (path) => access(path).then(() => true, () => false);

test('a config file that is not valid JSON stops the run instead of falling back to the defaults', async () => {
  await withDir(async (dir) => {
    // The likeliest hand-editing mistake: a trailing comma. The file asks for
    // an offline, redacted run; ignoring it would run cloud-first, unredacted.
    const configPath = join(dir, 'csf-tool.config.json');
    await writeFile(configPath, '{ "local": true, "privacy": { "redact": true, "terms": ["Blue Ridge Clinic"], } }');
    const warnings = [];
    await assert.rejects(
      loadConfig({ configPath }, { warn: (m) => warnings.push(m) }),
      (err) =>
        err instanceof ConfigError &&
        /could not be read as JSON/.test(err.message) &&
        /Nothing was sent anywhere/.test(err.hint),
    );
    assert.deepEqual(warnings, []); // an error, not a warning that --quiet would hide
  });
});

test('an empty config file and a directory in its place are refused the same way', async () => {
  await withDir(async (dir) => {
    const empty = join(dir, 'empty.json');
    await writeFile(empty, '');
    await assert.rejects(loadConfig({ configPath: empty }), ConfigError);

    const directory = join(dir, 'a-directory.json');
    await mkdir(directory);
    await assert.rejects(loadConfig({ configPath: directory }), ConfigError);
  });
});

test('a config file that is valid JSON but not an object is refused, not skipped', async () => {
  await withDir(async (dir) => {
    for (const [name, content] of [
      ['list.json', '[{ "privacy": { "redact": true } }]'],
      ['null.json', 'null'],
      ['string.json', '"local"'],
      ['number.json', '42'],
    ]) {
      const configPath = join(dir, name);
      await writeFile(configPath, content);
      await assert.rejects(
        loadConfig({ configPath }),
        (err) => err instanceof ConfigError && /must contain a JSON object/.test(err.message),
        `${name} must be refused`,
      );
    }
    // An empty object is a valid config file: nothing set, defaults apply.
    const emptyObject = join(dir, 'empty-object.json');
    await writeFile(emptyObject, '{}');
    const { config } = await loadConfig({ configPath: emptyObject });
    assert.equal(config.privacy.redact, false);
  });
});

test('no config file at the default location is still fine: the defaults apply', async () => {
  const { config } = await loadConfig({ configPath: 'this-file-does-not-exist.json' });
  assert.equal(config.privacy.redact, false);
  assert.equal(config.embeddings.provider, 'openai');
});

test('CLI: a broken config file is one clear error, also under --quiet, and nothing is written', async () => {
  await withDir(async (dir) => {
    const configPath = join(dir, 'csf-tool.config.json');
    await writeFile(configPath, '{ "privacy": { "redact": true, } }');
    for (const extra of [[], ['--quiet']]) {
      await assert.rejects(
        execFileAsync(process.execPath, [BIN, 'status', '--config', configPath, '--work-dir', join(dir, 'work'), ...extra], { cwd: dir }),
        (err) => {
          assert.equal(err.code, 1);
          assert.match(err.stderr, /^error: Config file ".*" could not be read as JSON/);
          assert.doesNotMatch(err.stderr, /\n\s+at /); // an explanation, not a stack trace
          return true;
        },
      );
    }
    assert.equal(await exists(join(dir, 'work')), false);
  });
});

test('CLI: --config naming a file that does not exist is an error, not a silent run on the defaults', async () => {
  await withDir(async (dir) => {
    const missing = join(dir, 'typo.config.json');
    await assert.rejects(
      execFileAsync(process.execPath, [BIN, 'status', '--config', missing, '--work-dir', join(dir, 'work'), '--quiet'], { cwd: dir }),
      (err) => {
        assert.equal(err.code, 1);
        assert.match(err.stderr, /^error: Config file not found: /);
        assert.match(err.stderr, /init --config/);
        return true;
      },
    );
  });
});

test('CLI: init is the one command that may be pointed at a config file that does not exist yet', async () => {
  await withDir(async (dir) => {
    const configPath = join(dir, 'new.config.json');
    await execFileAsync(process.execPath, [BIN, 'init', '--config', configPath, '--work-dir', join(dir, 'work')], { cwd: dir });
    assert.equal(await exists(configPath), true);
    // ...and from then on the same path is accepted by every other command.
    const { stderr } = await execFileAsync(process.execPath, [BIN, 'status', '--config', configPath, '--work-dir', join(dir, 'work')], { cwd: dir });
    assert.match(stderr, /Assessment status/);
  });
});
