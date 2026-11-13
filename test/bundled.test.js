import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { bundledPath, resolveDataPath } from '../src/core/bundled.js';
import { DEFAULT_CSF_CORE_PATH, DEFAULT_CROSSWALK_PATH, defaultConfig } from '../src/core/defaults.js';
import { loadCsfCore } from '../src/csf/loader.js';
import { loadCrosswalks } from '../src/crosswalk/loader.js';
import { init } from '../src/actions/init.js';
import { CsfDataError } from '../src/core/errors.js';

const REPO_ROOT = process.cwd();

/** Run `fn` with the working directory set to a fresh empty temp directory. */
async function inEmptyDir(fn) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'csf-cwd-')));
  process.chdir(dir);
  try {
    return await fn(dir);
  } finally {
    process.chdir(REPO_ROOT);
    await rm(dir, { recursive: true, force: true });
  }
}

test('bundledPath points inside the installed package, independent of the working directory', async () => {
  const fromRoot = bundledPath('data/csf-core.json');
  assert.equal(fromRoot, resolve(REPO_ROOT, 'data/csf-core.json'));
  await inEmptyDir(async () => {
    assert.equal(bundledPath('data/csf-core.json'), fromRoot);
  });
});

test('the built-in default resolves to the shipped file when run from another directory', async () => {
  await inEmptyDir(async () => {
    const resolved = await resolveDataPath(DEFAULT_CSF_CORE_PATH, DEFAULT_CSF_CORE_PATH);
    assert.equal(resolved, bundledPath(DEFAULT_CSF_CORE_PATH));
    // The loader therefore works with the default configuration from anywhere.
    const csf = await loadCsfCore(defaultConfig().csfCorePath, null);
    assert.equal(csf.subcategories.length, 106);
  });
});

test('the default crosswalk data resolves the same way, and a custom path is not redirected', async () => {
  await inEmptyDir(async () => {
    assert.equal(defaultConfig().crosswalkPath, DEFAULT_CROSSWALK_PATH);
    const data = await loadCrosswalks(defaultConfig().crosswalkPath, null);
    assert.ok(data.crosswalks.length > 0);
    // Crosswalks are optional: a custom path that does not exist is simply absent.
    assert.equal(await loadCrosswalks('data/csf-crosswalk.json', null), null);
  });
});

test("a file in the working directory always wins over the bundled copy", async () => {
  await inEmptyDir(async (dir) => {
    await mkdir(join(dir, 'data'));
    const own = { frameworkVersion: 'CSF 2.0', sample: true, functions: [{ id: 'GV', name: 'GOVERN' }],
      subcategories: [{ function: 'GOVERN', category: 'Organizational Context (GV.OC)', id: 'GV.OC-01', outcome: 'Own text' }] };
    await writeFile(join(dir, 'data', 'csf-core.json'), JSON.stringify(own));
    assert.equal(await resolveDataPath(DEFAULT_CSF_CORE_PATH, DEFAULT_CSF_CORE_PATH), DEFAULT_CSF_CORE_PATH);
    const csf = await loadCsfCore(DEFAULT_CSF_CORE_PATH, null);
    assert.equal(csf.subcategories.length, 1);
    assert.equal(csf.subcategories[0].outcome, 'Own text');
  });
});

test('a custom path that does not exist is NOT redirected to the bundled file', async () => {
  await inEmptyDir(async () => {
    // A typo in a user-supplied path must surface as "not found".
    assert.equal(await resolveDataPath('data/csf-cor.json', DEFAULT_CSF_CORE_PATH), 'data/csf-cor.json');
    assert.equal(await resolveDataPath('my/csf-core.json', DEFAULT_CSF_CORE_PATH), 'my/csf-core.json');
    await assert.rejects(
      loadCsfCore('data/csf-cor.json', null),
      (err) => err instanceof CsfDataError && /not found: data\/csf-cor\.json/.test(err.message),
    );
    // Same for an absolute path, even one that ends like the default.
    const absolute = resolve('data/csf-core.json');
    assert.equal(await resolveDataPath(absolute, DEFAULT_CSF_CORE_PATH), absolute);
    await assert.rejects(loadCsfCore(absolute, null), CsfDataError);
  });
});

test('equivalent spellings of the default are recognized; empty values pass through', async () => {
  await inEmptyDir(async () => {
    assert.equal(await resolveDataPath('./data/csf-core.json', DEFAULT_CSF_CORE_PATH), bundledPath(DEFAULT_CSF_CORE_PATH));
    assert.equal(await resolveDataPath('', DEFAULT_CSF_CORE_PATH), '');
    assert.equal(await resolveDataPath(undefined, DEFAULT_CSF_CORE_PATH), undefined);
  });
});

test('init outside the repository still scaffolds .env from the shipped template', async () => {
  await inEmptyDir(async (dir) => {
    const lines = [];
    const ctx = {
      configPath: null,
      logger: { info: (m) => lines.push(m), warn: () => {}, error: () => {}, debug: () => {} },
      paths: { root: join(dir, 'output') },
    };
    const result = await init(ctx);
    assert.ok(result.created.includes('.env'));
    const env = await readFile(join(dir, '.env'), 'utf8');
    assert.equal(env, await readFile(bundledPath('.env.example'), 'utf8'));
    // A second run never overwrites what the user may have filled in.
    await writeFile(join(dir, '.env'), 'OPENAI_API_KEY=keep-me\n');
    await init(ctx);
    assert.equal(await readFile(join(dir, '.env'), 'utf8'), 'OPENAI_API_KEY=keep-me\n');
  });
});
