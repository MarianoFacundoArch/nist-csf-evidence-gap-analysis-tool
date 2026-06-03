/**
 * CLI flag parsing using Node's built-in `node:util` parseArgs (no dependency).
 *
 * Produces { command, overrides, help, version } where `overrides` is a config
 * slice (nested to match the config shape) containing ONLY the flags the user
 * actually passed — so they cleanly override the file/defaults at the top of
 * the precedence chain.
 */

import { parseArgs } from 'node:util';

const OPTIONS = {
  config: { type: 'string' },
  docs: { type: 'string' },
  'work-dir': { type: 'string' },
  'csf-core': { type: 'string' },
  'top-k': { type: 'string' },
  threshold: { type: 'string' },
  'chunk-size': { type: 'string' },
  'chunk-overlap': { type: 'string' },
  'embed-provider': { type: 'string' },
  'embed-model': { type: 'string' },
  'llm-provider': { type: 'string' },
  'llm-model': { type: 'string' },
  identity: { type: 'string' },
  'fixed-now': { type: 'string' },
  strict: { type: 'boolean' },
  critique: { type: 'boolean' },
  'no-critique': { type: 'boolean' },
  all: { type: 'boolean' },
  'accept-all': { type: 'boolean' },
  local: { type: 'boolean' },
  force: { type: 'boolean' },
  verbose: { type: 'boolean' },
  quiet: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean' },
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function parseCliArgs(argv) {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true }));
  } catch (err) {
    // Unknown flag etc. — surface as help with an error, never a crash.
    return { command: null, overrides: {}, help: true, version: false, error: err.message };
  }

  const overrides = {};
  const set = (path, value) => {
    if (value === undefined) return;
    const keys = path.split('.');
    let cur = overrides;
    for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]] ??= {};
    cur[keys[keys.length - 1]] = value;
  };

  if (values.config !== undefined) overrides.configPath = values.config;
  set('docsPath', values.docs);
  set('workDir', values['work-dir']);
  set('csfCorePath', values['csf-core']);
  set('retrieval.topK', num(values['top-k']));
  set('analysis.confidenceThreshold', num(values.threshold));
  set('chunk.size', num(values['chunk-size']));
  set('chunk.overlap', num(values['chunk-overlap']));
  set('embeddings.provider', values['embed-provider']);
  set('embeddings.model', values['embed-model']);
  set('llm.provider', values['llm-provider']);
  set('llm.model', values['llm-model']);
  set('identity', values.identity);
  set('fixedNow', values['fixed-now']);
  if (values.strict) set('analysis.strict', true);
  if (values.critique) set('analysis.critique', true);
  if (values['no-critique']) set('analysis.critique', false);
  if (values.all) set('review.showAll', true);
  if (values['accept-all']) set('acceptAll', true);
  if (values.local) set('local', true);
  if (values.force) set('force', true);
  if (values.verbose) set('logLevel', 'debug');
  if (values.quiet) set('logLevel', 'quiet');

  return {
    command: positionals[0] ?? null,
    overrides,
    help: !!values.help,
    version: !!values.version,
    error: null,
  };
}

export const HELP_TEXT = `csf-tool — NIST CSF 2.0 AI-assisted evidence & gap analysis
(Free and open source.)

USAGE
  csf-tool [command] [options]
  csf-tool                 # no command => interactive menu

COMMANDS
  init        Scaffold a config file, .env, and working directory
  ingest      Parse documents, chunk, embed, and build the local index
  analyze     Judge coverage of every CSF subcategory against the evidence
  review      Human-in-the-loop review of the AI's judgments
  report      Generate the Current Profile, gap-analysis report, and evidence map
  all | run   Run the whole pipeline (ingest -> analyze -> review -> report)

KEY OPTIONS
  --docs <path>            Folder or file of documents to assess
  --work-dir <path>        Where stage outputs are persisted (default ./output)
  --csf-core <path>        CSF 2.0 core data file (default data/csf-core.json)
  --top-k <n>              Chunks retrieved per subcategory
  --threshold <0..1>       Confidence below this auto-flags for review
  --chunk-size <n> --chunk-overlap <n>
  --embed-provider <id>    mock | openai | local-transformers
  --embed-model <id>       Provider-specific model (verify in provider docs)
  --llm-provider <id>      mock | openai | ollama
  --llm-model <id>         Provider-specific model (verify in provider docs)
  --local                  Force fully-offline providers (on-device + Ollama)
  --critique / --no-critique   Toggle the optional skeptical second pass
  --all                    Review every item (not just flagged ones)
  --accept-all             Non-interactive: accept the whole review queue
  --strict                 Refuse to emit the profile until all items reviewed
  --force                  Recompute assessments even if cached
  --config <path>          Use a specific config file
  --verbose | --quiet      Logging level
  -h, --help               Show this help
  --version                Show version
`;
