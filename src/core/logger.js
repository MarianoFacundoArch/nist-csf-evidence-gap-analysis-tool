/**
 * Minimal leveled logger.
 *
 * WHY a custom logger instead of console.* everywhere: actions must not write
 * to stdout directly (that is reserved for the UI port so the same action can
 * run from the CLI and the interactive menu). Routing all diagnostic output
 * through a logger lets us respect --quiet/--verbose uniformly and keep a
 * single place that decides what the user sees.
 *
 * Levels, from most to least verbose: debug < info < warn < error < quiet.
 * "quiet" suppresses everything except errors.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, quiet: 50 };

export function createLogger({ level = 'info' } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  // Diagnostics go to stderr so they never pollute machine-readable stdout.
  const emit = (lvl, prefix, args) => {
    if (LEVELS[lvl] < threshold) return;
    // error/quiet still print errors; everything else is gated by threshold.
    process.stderr.write(`${prefix}${args.join(' ')}\n`);
  };

  return {
    level,
    debug: (...a) => emit('debug', 'debug: ', a),
    info: (...a) => emit('info', '', a),
    warn: (...a) => emit('warn', 'warning: ', a),
    error: (...a) => emit('error', 'error: ', a),
  };
}
