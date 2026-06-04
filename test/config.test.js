import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/core/config.js';

// Tests pass a non-existent config path so only defaults + flag overrides apply
// (independent of any csf-tool.config.json in the working directory).
const NOFILE = { configPath: 'this-file-does-not-exist.json' };

// Write a temp config file and return its path (for the provider/model tests).
function tmpConfig(obj) {
  const dir = mkdtempSync(join(tmpdir(), 'csf-cfg-'));
  const p = join(dir, 'csf-tool.config.json');
  writeFileSync(p, JSON.stringify(obj));
  return p;
}

test('defaults load and flags override them', async () => {
  const { config } = await loadConfig({ ...NOFILE, retrieval: { topK: 9 } });
  assert.equal(config.retrieval.topK, 9);
  assert.equal(config.embeddings.provider, 'openai'); // cloud-first default
});

test('--local forces fully-offline providers regardless of other settings', async () => {
  const { config } = await loadConfig({ ...NOFILE, local: true, embeddings: { provider: 'openai' }, llm: { provider: 'openai' } });
  assert.equal(config.embeddings.provider, 'local-transformers');
  assert.equal(config.llm.provider, 'ollama');
});

test('invalid values are repaired to defaults rather than crashing', async () => {
  const warnings = [];
  const { config } = await loadConfig(
    { ...NOFILE, retrieval: { topK: 999 } }, // exceeds max 50
    { warn: (m) => warnings.push(m) },
  );
  assert.equal(config.retrieval.topK, 6); // reverted to default
  assert.ok(warnings.some((w) => w.includes('topK') || w.includes('retrieval')));
});

test('unknown config keys are dropped with a warning', async () => {
  const warnings = [];
  const { config } = await loadConfig({ ...NOFILE, bogusKey: true }, { warn: (m) => warnings.push(m) });
  assert.equal(config.bogusKey, undefined);
  assert.ok(warnings.some((w) => w.toLowerCase().includes('unknown')));
});

test('overlap is clamped to less than chunk size', async () => {
  const { config } = await loadConfig({ ...NOFILE, chunk: { size: 500, overlap: 600 } });
  assert.ok(config.chunk.overlap < config.chunk.size);
});

test('switching provider drops a model pinned in the config for the old provider', async () => {
  // A config file pins cloud models. Running with --local must NOT hand those
  // cloud model names to the local providers; each should use its own default.
  const configPath = tmpConfig({
    embeddings: { provider: 'openai', model: 'text-embedding-3-large' },
    llm: { provider: 'openai', model: 'gpt-5.5' },
  });
  const { config } = await loadConfig({ configPath, local: true });
  assert.equal(config.embeddings.provider, 'local-transformers');
  assert.equal(config.embeddings.model, null); // cloud model dropped -> provider default
  assert.equal(config.llm.provider, 'ollama');
  assert.equal(config.llm.model, null);
});

test('switching only the embeddings provider via flag drops the file-pinned model', async () => {
  const configPath = tmpConfig({ embeddings: { provider: 'openai', model: 'text-embedding-3-large' } });
  const { config } = await loadConfig({ configPath, embeddings: { provider: 'local-transformers' } });
  assert.equal(config.embeddings.provider, 'local-transformers');
  assert.equal(config.embeddings.model, null);
});

test('a pinned model is kept when the provider is unchanged', async () => {
  const configPath = tmpConfig({ embeddings: { provider: 'openai', model: 'my-embed-model' } });
  const { config } = await loadConfig({ configPath }); // no flags -> provider unchanged
  assert.equal(config.embeddings.model, 'my-embed-model');
});

test('an explicit --embed-model is honored even when the provider switches', async () => {
  const configPath = tmpConfig({ embeddings: { provider: 'openai', model: 'text-embedding-3-large' } });
  const { config } = await loadConfig({ configPath, embeddings: { provider: 'local-transformers', model: 'Xenova/all-MiniLM-L6-v2' } });
  assert.equal(config.embeddings.model, 'Xenova/all-MiniLM-L6-v2');
});
