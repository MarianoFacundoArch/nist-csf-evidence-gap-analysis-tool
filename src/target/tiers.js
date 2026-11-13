/**
 * CSF Tiers — the third component of CSF 2.0, alongside the Core and
 * Organizational Profiles.
 *
 * NIST describes Tiers as characterizing the rigor of an organization's
 * cybersecurity risk governance and management practices, and as something an
 * organization can choose to use to inform its Current and Target Profiles. A
 * Tier is therefore SELECTED by the organization. It is not a function of
 * Subcategory coverage, so this tool never computes or suggests one: it
 * records the organization's selection in the target profile and carries it
 * through the deliverables, labeled as exactly that.
 *
 * Only the Tier numbers and NAMES ship here. What each Tier means is NIST's
 * own notional description; it is deliberately not reproduced or paraphrased
 * in this code base — readers are pointed to the publication instead.
 */

/** The four CSF 2.0 Tiers: number and official name, nothing else. */
export const CSF_TIERS = [
  { tier: 1, name: 'Partial' },
  { tier: 2, name: 'Risk Informed' },
  { tier: 3, name: 'Repeatable' },
  { tier: 4, name: 'Adaptive' },
];

/** Where the Tier definitions are published. */
export const TIER_SOURCE = 'NIST Cybersecurity Framework (CSF) 2.0, NIST CSWP 29, Appendix B';

/** How every deliverable labels a recorded Tier. */
export const TIER_BASIS =
  'Selected by the organization and recorded in the target profile; not derived by this tool.';

/** Official name of a Tier number, or null when it is not one of the four. */
export function tierName(tier) {
  return CSF_TIERS.find((t) => t.tier === tier)?.name ?? null;
}

/** "Tier 2 (Risk Informed)", or "not recorded" for a missing selection. */
export function tierLabel(tier) {
  const name = tierName(tier);
  return name ? `Tier ${tier} (${name})` : 'not recorded';
}

/**
 * The recorded selection as the deliverables carry it — names resolved, and
 * the label and the source of the definitions attached so no renderer words
 * them differently. Returns null when the target profile records no Tier,
 * which is how renderers know to print nothing at all. A note without a Tier
 * is not a selection: it stays in target.json and appears once a Tier does.
 *
 * @param {{current?: number|null, target?: number|null, note?: string|null}|null|undefined} tiers
 * @returns {{current: {tier:number,name:string}|null, target: {tier:number,name:string}|null,
 *   note: string|null, basis: string, definitions: string} | null}
 */
export function resolveTiers(tiers) {
  const resolve = (tier) => (tierName(tier) ? { tier, name: tierName(tier) } : null);
  const current = resolve(tiers?.current);
  const target = resolve(tiers?.target);
  if (!current && !target) return null;
  const note = typeof tiers?.note === 'string' && tiers.note.trim() !== '' ? tiers.note.trim() : null;
  return { current, target, note, basis: TIER_BASIS, definitions: TIER_SOURCE };
}

/**
 * One sentence for prose deliverables, from a resolveTiers() result:
 * "CSF Tier — current: Tier 2 (Risk Informed); target: Tier 3 (Repeatable).
 * Selected by the organization …; Tier definitions: NIST …".
 */
export function tierSentence(resolved) {
  return (
    `CSF Tier — current: ${tierLabel(resolved.current?.tier)}; target: ${tierLabel(resolved.target?.tier)}. ` +
    `${resolved.basis} Tier definitions: ${resolved.definitions}.`
  );
}

/**
 * Things worth a second look in a recorded selection. A target Tier below the
 * current one is allowed — an organization may decide that — so it is a
 * warning, never an error.
 * @returns {string[]}
 */
export function tierWarnings(tiers) {
  const { current, target } = tiers ?? {};
  if (tierName(current) && tierName(target) && target < current) {
    return [
      `The target CSF Tier, ${tierLabel(target)}, is lower than the current one, ${tierLabel(current)}. ` +
        'That is allowed — an organization may decide it — but check that it is what was meant.',
    ];
  }
  return [];
}
