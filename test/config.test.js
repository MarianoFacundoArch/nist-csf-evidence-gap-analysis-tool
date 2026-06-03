import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/core/config.js';

// Tests pass a non-existent config path so only defaults + flag overrides apply
// (independent of any csf-tool.config.json in the working directory).
const NOFILE = { configPath: 'this-file-does-not-exist.json' };

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
