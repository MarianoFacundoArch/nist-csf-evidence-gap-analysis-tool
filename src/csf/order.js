/**
 * Canonical CSF 2.0 Function ordering (the order NIST presents the Framework
 * in), shared by every renderer so all deliverables group Functions the same
 * way. Unknown names sort last, alphabetically — a custom/partial CSF export
 * must never crash a report.
 */

export const FUNCTION_ORDER = ['GOVERN', 'IDENTIFY', 'PROTECT', 'DETECT', 'RESPOND', 'RECOVER'];

/** Order the distinct Function names present in `entries` canonically. */
export function orderFunctions(entries) {
  const names = [...new Set(entries.map((e) => e.function))];
  names.sort((a, b) => {
    const ia = FUNCTION_ORDER.indexOf(a);
    const ib = FUNCTION_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  return names;
}
