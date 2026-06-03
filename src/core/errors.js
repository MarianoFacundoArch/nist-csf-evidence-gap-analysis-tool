/**
 * Typed error classes.
 *
 * WHY: the brief requires the tool to "never crash on a bad config file, an
 * unparseable document, or malformed model output; degrade gracefully and
 * explain what happened." To do that cleanly we distinguish *expected*,
 * user-actionable failures (which we catch at the CLI boundary and print as a
 * single friendly line) from genuinely unexpected bugs (which we let surface
 * with a stack trace under --verbose).
 *
 * Every error here carries a `userMessage` — a one-line, no-stack explanation
 * suitable for a terminal — so the CLI top-level handler can show that instead
 * of a raw exception.
 */

/** Base class: an error we expected might happen and can explain to the user. */
export class AppError extends Error {
  constructor(message, { cause, hint } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = this.constructor.name;
    // The hint is optional remediation guidance appended to the user message.
    this.hint = hint;
  }

  /** One-line message for the terminal (no stack). */
  get userMessage() {
    return this.hint ? `${this.message}\n  → ${this.hint}` : this.message;
  }
}

/** Configuration file / flag / env problems. */
export class ConfigError extends AppError {}

/** A document could not be parsed (corrupt, unsupported, locked, etc.). */
export class ParseError extends AppError {}

/**
 * A selected provider could not be loaded or initialized — typically a missing
 * optional dependency, a missing API key, or an unreachable local daemon.
 */
export class ProviderError extends AppError {}

/** The CSF core data file is missing or malformed. */
export class CsfDataError extends AppError {}

/**
 * Strict mode refused to emit the final profile because not every subcategory
 * has been resolved by a human reviewer. This is a deliberate stop, not a bug.
 */
export class StrictModeError extends AppError {}

/**
 * A pipeline stage was run before its prerequisite stage completed (e.g.
 * `analyze` before `ingest`). Carries guidance on what to run first.
 */
export class StageError extends AppError {}
