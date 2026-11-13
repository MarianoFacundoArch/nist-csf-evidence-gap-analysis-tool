/**
 * Builds the canonical crosswalk view: the Current Profile joined with the
 * selected informative-reference mappings. EVERY crosswalk deliverable
 * (crosswalk.csv, crosswalk.md, the dashboard's "related references" block)
 * is rendered from this one object, so they can never drift from one another
 * — the same principle as buildProfile() and buildTargetView().
 *
 * What a mapping means decides what this module may compute. A mapping records
 * that a CSF element and an identifier in another framework are RELATED. It
 * does not say the two are equivalent, and coverage of a CSF outcome is
 * evidence about that outcome only. So the view pivots the relationships
 * (which assessed outcomes relate to each reference) and counts the references
 * that have a gap among their related outcomes — and stops there. It never
 * derives a status, score or percentage for a reference, and it does not
 * count references whose related outcomes are all covered: nothing in the
 * data supports reading that as anything about the reference.
 *
 * A mapping records each relationship at one of three levels: a Subcategory,
 * a whole Category, or a whole Function. The view keeps them apart, because a
 * relationship to a Category is not a relationship to each of its
 * Subcategories and must not be displayed as one. For the gap count, though,
 * a reference related to a whole Category or Function is related to every
 * outcome under it: its related outcomes are the EXPANDED set — the
 * Subcategories it is related to directly plus every Subcategory under each
 * related Category or Function.
 *
 * Everything here is deterministic, offline code: no AI is involved, and
 * nothing is added to the mappings as published.
 */

import { isGap, summarizeCoverage } from '../engine/coverage.js';
import { naturalCompare } from '../util/naturalSort.js';

// Data-file field for each level of relationship.
const MAP_FIELD = { subcategory: 'mappings', category: 'categoryMappings', function: 'functionMappings' };

/**
 * The reference identifiers a crosswalk relates to one CSF element at one
 * level ([] when none). An own-property check, so an unusual id can never
 * pick up something inherited from Object.prototype.
 * @param {object} crosswalk a crosswalk entry of the data file
 * @param {string} elementId Subcategory, Category or Function id
 * @param {'subcategory'|'category'|'function'} [level]
 * @returns {string[]}
 */
export function referencesFor(crosswalk, elementId, level = 'subcategory') {
  const map = crosswalk[MAP_FIELD[level]];
  return map && Object.hasOwn(map, elementId) ? map[elementId] : [];
}

/**
 * The Categories and Functions of the assessment, each with the outcomes under
 * it and their coverage distribution. Derived from the profile (not from the
 * CSF core) so the view describes exactly what was assessed. Order: all
 * Categories in CSF order, then all Functions in CSF order — the same "most
 * specific first" order every deliverable uses.
 */
function groupsOf(entries) {
  const groups = { category: new Map(), function: new Map() };
  for (const e of entries) {
    const functionId = e.function_id ?? e.subcategory_id.split('.')[0];
    const categoryId = e.subcategory_id.split('-')[0];
    // The shipped Core's category labels end with the id ("Policy (GV.PO)");
    // a custom core's may not, and a name without its id cannot be looked up.
    const categoryName = String(e.category).includes(categoryId) ? e.category : `${e.category} (${categoryId})`;
    const keys = [
      ['category', categoryId, categoryName, e.category],
      ['function', functionId, `${e.function} (${functionId})`, ''],
    ];
    for (const [level, id, name, category] of keys) {
      if (!groups[level].has(id)) {
        groups[level].set(id, { level, id, name, function: e.function, category, entries: [] });
      }
      groups[level].get(id).entries.push(e);
    }
  }
  return [...groups.category.values(), ...groups.function.values()].map((g) => ({
    ...g,
    outcomes: g.entries.length,
    coverage: summarizeCoverage(g.entries.map((e) => e.coverage)),
    review: {
      reviewed: g.entries.filter((e) => e.review_status === 'reviewed').length,
      unreviewed: g.entries.filter((e) => e.review_status === 'unreviewed').length,
      stale: g.entries.filter((e) => e.review_status === 'stale').length,
    },
  }));
}

/**
 * @param {{subcategories:Array<object>}} profile the Current Profile
 * @param {{frameworkVersion:string, source:string, retrievedAt:string,
 *   catalogUrl:string, crosswalks:Array<object>}} crosswalks the selected
 *   crosswalk data (see selectCrosswalks)
 * @returns {{frameworkVersion:string, source:string, retrievedAt:string,
 *   catalogUrl:string,
 *   crosswalks:Array<{id:string, framework:string, olirName:string,
 *     olirVersion:string, developer:string, releaseDate:string,
 *     sourceUrl:string|null, thirdParty:boolean, summary:object,
 *     references:Array<{reference_id:string, has_gap:boolean,
 *       pending_review:boolean, related:Array<object>, groups:Array<object>}>,
 *     bySubcategory:Record<string,string[]>,
 *     byCategory:Record<string,string[]>,
 *     byFunction:Record<string,string[]>}>}}
 */
export function buildCrosswalkView(profile, crosswalks) {
  const entries = profile.subcategories;
  const groups = groupsOf(entries);
  return {
    frameworkVersion: crosswalks.frameworkVersion,
    source: crosswalks.source,
    retrievedAt: crosswalks.retrievedAt,
    catalogUrl: crosswalks.catalogUrl,
    crosswalks: crosswalks.crosswalks.map((crosswalk) => viewOf(crosswalk, entries, groups)),
  };
}

function viewOf(crosswalk, entries, groups) {
  const sorted = (ids) => [...new Set(ids)].sort(naturalCompare);

  // --- Subcategory level --------------------------------------------------
  // Walk the profile, not the mapping's keys: the profile is in CSF order, so
  // related outcomes come out in CSF order, and only outcomes this assessment
  // actually covers are joined (a custom or partial CSF core has fewer).
  const bySubcategory = {};
  const directByReference = new Map();
  for (const e of entries) {
    const ids = sorted(referencesFor(crosswalk, e.subcategory_id));
    if (ids.length === 0) continue;
    bySubcategory[e.subcategory_id] = ids;
    for (const id of ids) {
      if (!directByReference.has(id)) directByReference.set(id, []);
      directByReference.get(id).push(e);
    }
  }

  // --- Category and Function level ----------------------------------------
  const byGroup = { category: {}, function: {} };
  const groupsByReference = new Map();
  for (const group of groups) {
    const ids = sorted(referencesFor(crosswalk, group.id, group.level));
    if (ids.length === 0) continue;
    byGroup[group.level][group.id] = ids;
    for (const id of ids) {
      if (!groupsByReference.has(id)) groupsByReference.set(id, []);
      groupsByReference.get(id).push(group);
    }
  }

  const referenceIds = sorted([...directByReference.keys(), ...groupsByReference.keys()]);
  const references = referenceIds.map((id) => {
    const direct = directByReference.get(id) ?? [];
    const related = groupsByReference.get(id) ?? [];
    // The EXPANDED set: outcomes related directly, plus every outcome under a
    // related Category or Function. Each outcome counts once.
    const expanded = new Set([...direct, ...related.flatMap((g) => g.entries)]);
    return {
      reference_id: id,
      // At least one related outcome is a gap (none/partial).
      has_gap: [...expanded].some((e) => isGap(e.coverage)),
      // At least one related outcome still awaits human validation.
      pending_review: [...expanded].some((e) => e.review_status !== 'reviewed'),
      // Relationships recorded for one Subcategory.
      related: direct.map((e) => ({
        subcategory_id: e.subcategory_id,
        function: e.function,
        category: e.category,
        coverage: e.coverage,
        review_status: e.review_status,
      })),
      // Relationships recorded for a whole Category or Function: the element,
      // and how the outcomes under it are distributed — never one coverage.
      groups: related.map((g) => ({
        level: g.level,
        id: g.id,
        name: g.name,
        function: g.function,
        category: g.category,
        outcomes: g.outcomes,
        coverage: g.coverage,
        review: g.review,
      })),
    };
  });

  const assessed = {
    subcategory: new Set(entries.map((e) => e.subcategory_id)),
    category: new Set(groups.filter((g) => g.level === 'category').map((g) => g.id)),
    function: new Set(groups.filter((g) => g.level === 'function').map((g) => g.id)),
  };
  const notAssessed = (level) =>
    Object.keys(crosswalk[MAP_FIELD[level]] ?? {}).filter((id) => !assessed[level].has(id)).length;

  return {
    id: crosswalk.id,
    framework: crosswalk.framework,
    olirName: crosswalk.olirName,
    olirVersion: crosswalk.olirVersion,
    developer: crosswalk.developer,
    releaseDate: crosswalk.releaseDate,
    sourceUrl: crosswalk.sourceUrl ?? null,
    thirdParty: crosswalk.thirdParty,
    summary: {
      // Distinct reference identifiers related to at least one assessed
      // outcome, at any level.
      references: references.length,
      // Relationships as published — one crosswalk.csv row each.
      relationships: references.reduce((n, r) => n + r.related.length + r.groups.length, 0),
      subcategoriesMapped: Object.keys(bySubcategory).length,
      totalSubcategories: entries.length,
      categoriesMapped: Object.keys(byGroup.category).length,
      totalCategories: assessed.category.size,
      functionsMapped: Object.keys(byGroup.function).length,
      totalFunctions: assessed.function.size,
      // Over the expanded set of related outcomes (see the module comment).
      referencesWithGap: references.filter((r) => r.has_gap).length,
      referencesPendingReview: references.filter((r) => r.pending_review).length,
      // Elements the mapping covers that this assessment does not include;
      // their relationships are left out rather than shown without coverage.
      subcategoriesNotAssessed: notAssessed('subcategory'),
      groupsNotAssessed: notAssessed('category') + notAssessed('function'),
    },
    references,
    bySubcategory,
    byCategory: byGroup.category,
    byFunction: byGroup.function,
  };
}

/**
 * The compact form embedded in the dashboard: reference identifiers per
 * Subcategory, Category and Function for each selected crosswalk (coverage is
 * already in the profile the dashboard embeds, so it is not repeated).
 * @param {ReturnType<typeof buildCrosswalkView>} view
 */
export function crosswalkDashboardData(view) {
  return {
    source: view.source,
    retrievedAt: view.retrievedAt,
    crosswalks: view.crosswalks.map((c) => ({
      id: c.id,
      framework: c.framework,
      thirdParty: c.thirdParty,
      map: c.bySubcategory,
      categories: c.byCategory,
      functions: c.byFunction,
    })),
  };
}
