/**
 * The read-only listing behind `csf-tool crosswalk`: which crosswalks the data
 * file holds, who developed each, how much of the CSF core each one covers,
 * which are in the default set, and which ones the current configuration
 * selects for reports.
 *
 * Split like the status view (build a plain result, then render it) so the
 * command and the interactive menu print the same text and tests can check
 * the result without parsing terminal output. The listing shows provenance on
 * purpose: a mapping is only as good as its developer, so the developer of
 * record, the catalog that lists it, and the third-party flag sit next to
 * every id a user can select — and a third-party mapping is shown as opt-in,
 * because that is the one thing a user has to do deliberately.
 */

import { selectCrosswalks, isDefaultCrosswalk } from './select.js';
import { referencesFor } from './view.js';

/**
 * @param {object} args
 * @param {object} args.data validated crosswalk data (see loadCrosswalks)
 * @param {string[]|null} args.selection `config.report.crosswalks`
 * @param {string[]} args.subcategoryIds ids of the CSF core in use
 * @param {string} args.path where the data was loaded from
 * @param {{warn?:Function}} [args.logger] receives the unknown-id warning
 * @returns {{available:true, path:string, source:string, retrievedAt:string,
 *   catalogUrl:string, frameworkVersion:string, selection:string[]|null,
 *   selectedIds:string[],
 *   crosswalks:Array<{id:string, framework:string, developer:string,
 *     releaseDate:string, sourceUrl:string|null, thirdParty:boolean,
 *     inDefaultSet:boolean, mapped:number, total:number,
 *     categoriesMapped:number, functionsMapped:number, selected:boolean}>}}
 */
export function buildCrosswalkListing({ data, selection = null, subcategoryIds = [], path, logger }) {
  const selected = selectCrosswalks(data, selection, logger);
  const selectedIds = (selected?.crosswalks ?? []).map((c) => c.id);
  // Counted against the CSF core in use, so the figures match the reports.
  const categoryIds = [...new Set(subcategoryIds.map((id) => id.split('-')[0]))];
  const functionIds = [...new Set(subcategoryIds.map((id) => id.split('.')[0]))];
  const mappedAt = (crosswalk, ids, level) => ids.filter((id) => referencesFor(crosswalk, id, level).length > 0).length;
  return {
    available: true,
    path,
    source: data.source,
    retrievedAt: data.retrievedAt,
    catalogUrl: data.catalogUrl,
    frameworkVersion: data.frameworkVersion,
    selection: Array.isArray(selection) ? selection : null,
    selectedIds,
    crosswalks: data.crosswalks.map((c) => ({
      id: c.id,
      framework: c.framework,
      developer: c.developer,
      releaseDate: c.releaseDate,
      sourceUrl: c.sourceUrl ?? null,
      thirdParty: c.thirdParty,
      inDefaultSet: isDefaultCrosswalk(c),
      mapped: mappedAt(c, subcategoryIds, 'subcategory'),
      total: subcategoryIds.length,
      categoriesMapped: mappedAt(c, categoryIds, 'category'),
      functionsMapped: mappedAt(c, functionIds, 'function'),
      selected: selectedIds.includes(c.id),
    })),
  };
}

/**
 * @param {ReturnType<typeof buildCrosswalkListing>} listing
 * @returns {string} the text block shown to the user
 */
export function renderCrosswalkListing(listing) {
  const lines = [];
  lines.push(`Data file: ${listing.path}`);
  lines.push(`Source: ${listing.source}`);
  lines.push(`Catalog where each mapping and its developer are listed: ${listing.catalogUrl}`);
  lines.push(`Retrieved: ${listing.retrievedAt} · ${listing.frameworkVersion}`);
  lines.push('');

  if (listing.crosswalks.length === 0) {
    lines.push('The data file contains no crosswalks.');
  } else {
    const width = Math.max(...listing.crosswalks.map((c) => c.id.length));
    const indent = ' '.repeat(width + 4);
    for (const c of listing.crosswalks) {
      lines.push(
        `${c.selected ? '✓' : '—'} ${c.id.padEnd(width)}  ${c.framework} · ` +
          (c.inDefaultSet ? 'default set' : 'opt-in') +
          (c.thirdParty ? ' · third-party mapping (not produced by the framework\'s publisher)' : ''),
      );
      lines.push(`${indent}mapping by ${c.developer} · released ${c.releaseDate}`);
      lines.push(
        `${indent}relates to ${c.mapped}/${c.total} Subcategories, ` +
          `${c.categoriesMapped} whole ${c.categoriesMapped === 1 ? 'Category' : 'Categories'}, ` +
          `${c.functionsMapped} whole ${c.functionsMapped === 1 ? 'Function' : 'Functions'}`,
      );
      // Only a document NIST itself hosts is ever linked; otherwise the catalog is the citation.
      if (c.sourceUrl) lines.push(`${indent}mapping document: ${c.sourceUrl}`);
    }
    lines.push('');
    lines.push('✓ included in reports · — not selected');
  }

  const total = listing.crosswalks.length;
  const count = listing.selectedIds.length;
  if (listing.selection === null) {
    lines.push(`Selected by the current configuration: the default set, ${count} of ${total} ("report.crosswalks" is not set).`);
  } else if (count === 0) {
    lines.push('Selected by the current configuration: none — reports omit the crosswalk deliverables.');
  } else if (count === total) {
    lines.push(`Selected by the current configuration: all ${total}.`);
  } else {
    lines.push(`Selected by the current configuration: ${count} of ${total} (${listing.selectedIds.join(', ')}).`);
  }
  lines.push('Select with --crosswalk <ids|default|all|none> or "report.crosswalks" in the config file.');
  lines.push(
    'Third-party mappings are opt-in: name them (for example "default,<id>") or use "all". They are reproduced as published.',
  );
  lines.push(
    'A mapping records that a CSF outcome and a reference are related; it is not a determination of conformance.',
  );
  return lines.join('\n');
}
