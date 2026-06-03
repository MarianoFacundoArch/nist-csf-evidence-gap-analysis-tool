/**
 * Interactive UI port, backed by @clack/prompts (lazily imported).
 *
 * This is the ONLY interactive implementation; it is used both by the
 * interactive menu and by any subcommand run in a terminal (e.g. `review`).
 * Keeping a single implementation behind the `ui` interface is what lets the
 * menu and the commands share one code path — the action calls ctx.ui.select(),
 * not @clack directly.
 */

export async function createInteractiveUi() {
  const p = await import('@clack/prompts');

  const cancelGuard = (value) => {
    if (p.isCancel(value)) {
      p.cancel('Cancelled.');
      process.exit(0);
    }
    return value;
  };

  return {
    isInteractive: true,
    clack: p,
    info: (m) => p.log.info(m),
    warn: (m) => p.log.warn(m),
    success: (m) => p.log.success(m),
    note: (title, body) => p.note(body, title),
    async select(message, options) {
      return cancelGuard(await p.select({ message, options }));
    },
    async confirm(message, initialValue = true) {
      return cancelGuard(await p.confirm({ message, initialValue }));
    },
    async text(message, { placeholder, initial } = {}) {
      const r = cancelGuard(await p.text({ message, placeholder, defaultValue: initial }));
      return r ?? '';
    },
  };
}
