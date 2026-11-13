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
  'target-default': { type: 'string' },
  'target-import': { type: 'string' },
  'tier-current': { type: 'string' },
  'tier-target': { type: 'string' },
  crosswalk: { type: 'string' },
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
  set('targetDefault', values['target-default']);
  set('targetImport', values['target-import']);
  // A Tier that is not a number is passed on as given (NaN) instead of being
  // dropped like the tuning flags above: config validation then reports the
  // bad value, so a mistyped Tier is never silently ignored.
  if (values['tier-current'] !== undefined) set('tierCurrent', Number(values['tier-current']));
  if (values['tier-target'] !== undefined) set('tierTarget', Number(values['tier-target']));
  if (values.crosswalk !== undefined) set('report.crosswalks', parseCrosswalkSelection(values.crosswalk));
  if (values.strict) set('analysis.strict', true);
  if (values.critique) set('analysis.critique', true);
  if (values['no-critique']) set('analysis.critique', false);
  if (values.all) set('review.showAll', true);
  if (values['accept-all']) set('acceptAll', true);
  if (values.local) set('local', true);
  if (values.force) set('force', true);
  if (values.verbose) set('logLevel', 'debug');
  if (values.quiet) set('logLevel', 'quiet');

  // `ask` takes its question as the remaining positionals, so both
  // `csf-tool ask "do we have an incident response plan?"` and the unquoted
  // form work.
  if (positionals[0] === 'ask' && positionals.length > 1) {
    set('question', positionals.slice(1).join(' '));
  }

  return {
    command: positionals[0] ?? null,
    overrides,
    help: !!values.help,
    version: !!values.version,
    error: null,
  };
}

/**
 * --crosswalk value -> config.report.crosswalks: "default" => null (every
 * crosswalk that is not a third-party mapping), "all" => ['all'] (every
 * crosswalk in the data file, third-party ones included), "none" => [] (no
 * crosswalk deliverables), otherwise a comma-separated list of crosswalk ids.
 */
function parseCrosswalkSelection(raw) {
  const value = String(raw).trim();
  const keyword = value.toLowerCase();
  if (keyword === 'default') return null;
  if (keyword === 'all') return ['all'];
  if (value === '' || keyword === 'none') return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export const HELP_TEXT = `csf-tool — NIST CSF 2.0 AI-assisted evidence & gap analysis
(Free and open source.)

USAGE
  csf-tool [command] [options]
  csf-tool                 # no command => interactive menu

COMMANDS
  init        Scaffold a config file, .env, and working directory
  status      Show pipeline progress, report freshness, and the next action
  ingest      Parse documents, chunk, embed, and build the local index
  analyze     Judge coverage of every CSF subcategory against the evidence
  review      Human-in-the-loop review of the AI's judgments
  target      Define the Target Profile (goal coverage + priorities per outcome)
  report      Generate the Current Profile, gap analysis, evidence map, dashboard,
              and — when a target profile exists — the prioritized remediation plan
  ask         Ask a question about the ingested documents; the answer is backed
              by quotes verified verbatim (e.g. csf-tool ask "is MFA required?")
  crosswalk   List the informative-reference crosswalks available to reports
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
  --target-default <lvl>   Set the target baseline for every subcategory
                           (none | partial | substantial | full)
  --target-import <path>   Replace the target profile with the given JSON file
  --tier-current <1-4>     Record the organization's current CSF Tier
  --tier-target <1-4>      Record the organization's target CSF Tier
  --crosswalk <ids>        Crosswalks to include in reports: comma-separated ids,
                           "default" (all except third-party mappings), "all"
                           (third-party mappings included), or "none"
  --strict                 Refuse to emit the profile until all items reviewed
  --force                  Recompute assessments even if cached
  --config <path>          Use a specific config file
  --verbose | --quiet      Logging level
  -h, --help               Show this help
  --version                Show version
`;
