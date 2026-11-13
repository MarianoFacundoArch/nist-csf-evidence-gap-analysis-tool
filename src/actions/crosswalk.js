/**
 * CROSSWALK action: list the informative-reference crosswalks available to the
 * report stage — id, framework, mapping developer, release date, how much of
 * the CSF core each relates to, which are in the default set and which are
 * opt-in third-party mappings — and which ones the current configuration
 * selects.
 *
 * Read-only, like `status`: it initializes no provider and writes nothing.
 * Crosswalks are optional, so a missing data file is explained rather than
 * treated as a failure (a malformed one still stops with a typed error).
 */

import { loadCsfCore } from '../csf/loader.js';
import { loadCrosswalks } from '../crosswalk/loader.js';
import { buildCrosswalkListing, renderCrosswalkListing } from '../crosswalk/listing.js';

const TITLE = 'Crosswalks (CSF 2.0 → other frameworks)';

export async function crosswalk(ctx) {
  const { logger, config } = ctx;
  const path = config.crosswalkPath;

  const data = await loadCrosswalks(path, logger);
  if (!data) {
    show(
      ctx,
      [
        `No crosswalk data file found at: ${path}`,
        'Crosswalks are optional — reports are generated without the crosswalk deliverables.',
        'To add them, restore data/csf-crosswalks.json from the repository, regenerate it with',
        '`npm run build-crosswalks`, or point "crosswalkPath" in the config at your copy.',
      ].join('\n'),
    );
    return { available: false, path, crosswalks: [], selectedIds: [] };
  }

  const csf = await loadCsfCore(config.csfCorePath, logger);
  const listing = buildCrosswalkListing({
    data,
    selection: config.report?.crosswalks ?? null,
    subcategoryIds: csf.subcategories.map((sub) => sub.id),
    path,
    logger,
  });
  show(ctx, renderCrosswalkListing(listing));
  return listing;
}

function show(ctx, body) {
  if (ctx.ui?.note) ctx.ui.note(TITLE, body);
  else ctx.logger.info(`${TITLE}\n${body}`);
}
