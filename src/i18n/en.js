/**
 * English message catalog — the wording of every human-readable deliverable
 * (the Markdown reports, the dashboard, the `ask` result block).
 *
 * English is the reference language. Every other catalog (es.js) must carry
 * exactly these keys with exactly these `{placeholders}`; a key another
 * language lacks falls back to the text here. Tests enforce the parity.
 *
 * What is NOT in a catalog, on purpose:
 *  - framework text. Function names, Category names and Subcategory outcomes
 *    are NIST's; a translated report reads them from the published translation
 *    (src/csf/localized.js), never from a sentence written here.
 *  - the wording of the machine-readable files (profile JSON, CSV headers and
 *    values). Those are interfaces and stay English in every language.
 *
 * Conventions:
 *  - one flat object; keys are dotted names grouped by deliverable.
 *  - `{name}` marks a value filled in at render time. A literal brace cannot
 *    be written, and no value needs one.
 *  - a count noun that must agree in number has two keys, `.one` and `.other`.
 *    Wording that avoids agreement is preferred; these are the exceptions.
 *  - `fixed.*` are sentences that OTHER modules write into the assessment data
 *    in English (the profile disclaimer, a staleness reason, ...). They are
 *    listed here, character for character, so a translated report can show
 *    its own wording for them; the data itself is never changed.
 *    `fixedPrefix.*` are the same for a sentence the tool puts IN FRONT of
 *    other text (the verifier's note before a model's rationale).
 *  - Markdown structure (list markers, heading marks, block quotes) stays in
 *    the renderers; inline emphasis is part of a sentence and stays with it.
 *
 * Changing a value here changes English output. The frozen files under
 * test/fixtures/i18n/en/ will say so.
 */

export default {
  /* ----------------------------- tool vocabulary ---------------------------- */
  // Display forms of the values the data files carry. In English they are the
  // values themselves.
  'coverage.none': 'none',
  'coverage.partial': 'partial',
  'coverage.substantial': 'substantial',
  'coverage.full': 'full',
  'coverage.title.none': 'None',
  'coverage.title.partial': 'Partial',
  'coverage.title.substantial': 'Substantial',
  'coverage.title.full': 'Full',
  'review.reviewed': 'reviewed',
  'review.unreviewed': 'unreviewed',
  'review.stale': 'stale',
  'review.title.reviewed': 'Reviewed',
  'review.title.unreviewed': 'Unreviewed',
  'review.title.stale': 'Stale',
  'priority.high': 'high',
  'priority.medium': 'medium',
  'priority.low': 'low',
  'planStatus.open': 'open',
  'planStatus.inProgress': 'in-progress',
  'planStatus.done': 'done',
  'planStatus.riskAccepted': 'risk-accepted',

  // CSF Tiers: official names (the same as src/target/tiers.js).
  'tier.name.1': 'Partial',
  'tier.name.2': 'Risk Informed',
  'tier.name.3': 'Repeatable',
  'tier.name.4': 'Adaptive',
  'tier.label': 'Tier {tier} ({name})',
  'tier.notRecorded': 'not recorded',
  'tier.sentence': 'CSF Tier — current: {current}; target: {target}. {basis} Tier definitions: {definitions}.',
  'tier.note': 'Tier note: {note}',

  /* ------------------------- shared by several reports ---------------------- */
  'badge.unreviewed': '⚠ UNREVIEWED',
  'badge.stale': '⚠ STALE REVIEW',
  'badge.override': 'reviewer override: {from} → {to}',
  'badge.downgraded': 'verifier downgraded (unverifiable quote removed)',

  'common.page': 'p.{page}',
  'common.note': '**Note.** {note}',
  'common.heading.overview': 'Overview',
  'common.overview.framework': 'Framework: {framework} ({version})',
  'common.overview.generated': 'Generated: {date}',
  'common.overview.csfSource': 'CSF source: {source}',
  'common.table.target.header': '| Function | Applicable | Met | Unmet | Out of scope | % met |',
  'common.priorityHeading.high': 'High priority ({count})',
  'common.priorityHeading.medium': 'Medium priority ({count})',
  'common.priorityHeading.low': 'Low priority ({count})',
  'common.levelsToClose.one': '{count} level to close',
  'common.levelsToClose.other': '{count} levels to close',
  'common.item.functionCategory': 'Function / Category: {function} / {category}',
  'common.item.outcome': 'Outcome: {outcome}',
  'common.item.assessmentRationale': 'Assessment rationale: {rationale}',
  'common.item.reviewerNote': 'Reviewer note: {note}',
  'common.count.outcome.one': '{count} outcome',
  'common.count.outcome.other': '{count} outcomes',
  'common.count.quote.one': '{count} quote',
  'common.count.quote.other': '{count} quotes',

  // Printed only by reports in another language: English reports show the
  // framework's own text and need neither note. No Markdown in these: the
  // dashboard shows them as plain text.
  'note.frameworkText.label': 'Framework text',
  'note.frameworkText':
    'The names of the Functions and Categories and the outcomes of the Subcategories are those of the official ' +
    'translation published by NIST (NIST CSWP 29 spa, https://doi.org/10.6028/NIST.CSWP.29.spa), republished ' +
    'courtesy of the National Institute of Standards and Technology. The assessment was made against the ' +
    'original English text, which is the authoritative one.',
  'note.frameworkText.partial':
    'Outcomes of this assessment that translation does not cover (absent from it, or worded differently from the ' +
    'official text): {missing} of {total}; they are shown with their original text.',
  'note.frameworkText.unavailable':
    'No published translation of the CSF Core is available to this report, so the names of the Functions and ' +
    'Categories and the outcomes of the Subcategories are shown with their original text.',
  'note.examplesEnglish':
    'The Implementation Examples are shown in English: NIST publishes them in that language only.',

  /* ---------------- sentences other modules write into the data ------------- */
  'fixed.profile.disclaimer':
    'AI-assisted draft. Guiding principle: AI proposes, a human validates. Coverage judgments above "none" ' +
    'are anchored to quotes verified verbatim against the source evidence. CSF 2.0 Subcategory text is in the ' +
    'public domain (source: NIST CPRT).',
  'fixed.csfSource.full': 'NIST CPRT — CSF 2.0 Core (public domain).',
  'fixed.csfSource.partial': 'PARTIAL CSF subset in use — replace with the full NIST CPRT export.',
  'fixed.tier.basis': 'Selected by the organization and recorded in the target profile; not derived by this tool.',
  'fixed.tier.definitions': 'NIST Cybersecurity Framework (CSF) 2.0, NIST CSWP 29, Appendix B',
  'fixed.analysis.mixedSignatures': 'mixed engine signatures',
  'fixed.analysis.signatureDiffers': 'assessment signature differs from completed run',
  'fixed.analysis.indexChanged': 'evidence index changed since analysis',
  'fixed.analysis.ingestNewer': 'ingest is newer than completed analysis',
  'fixed.rationale.notAssessed': 'No assessment was produced for this subcategory.',
  'fixed.rationale.noEvidence': 'Automated fallback: no evidence retrieved from the corpus.',
  'fixed.rationale.invalidOutput': 'Automated fallback: model output failed schema validation after one retry.',
  'fixed.ask.noEvidence': 'No verifiable evidence in the ingested documents answers this question.',
  // What the verifier puts in front of the rationale of a claim it downgraded,
  // and what the engine puts in front of the reason for a fallback assessment.
  'fixedPrefix.rationale.downgraded':
    '[Auto-downgraded: the claimed coverage had no verifiable verbatim quote in the retrieved evidence.]',
  'fixedPrefix.rationale.fallback': 'Automated fallback:',

  /* ----------------------------- gap-analysis.md ---------------------------- */
  'gap.title': 'NIST CSF 2.0 — Current Profile & Gap Analysis',
  'gap.draft':
    '**DRAFT — not fully reviewed.** {unreviewed} unreviewed and {stale} stale item(s) remain. ' +
    'A human must validate every item before this profile is authoritative.',
  'gap.overview.providers': 'Providers: embeddings = `{embeddings}`, reasoning = `{llm}`',
  'gap.overview.subcategories': 'Subcategories: {total} — gaps (none/partial): **{gaps}**',
  'gap.overview.coverage': 'Coverage: none {none}, partial {partial}, substantial {substantial}, full {full}',
  'gap.overview.review': 'Review: reviewed {reviewed}, unreviewed {unreviewed}, stale {stale}, overrides {overridden}',
  'gap.overview.downgraded': 'Quotes downgraded by the verifier: {count}',
  'gap.heading.byFunction': 'Coverage by Function',
  'gap.table.byFunction.header': '| Function | Total | None | Partial | Substantial | Full | % addressed |',
  'gap.heading.currentVsTarget': 'Current vs Target',
  'gap.target.summary':
    'Target baseline: **{baseline}**. Met **{met}/{applicable}** applicable outcomes ({pct}%); unmet {unmet} ' +
    '(high {high}, medium {medium}, low {low})',
  'gap.target.outOfScope': 'out of scope {count}',
  'gap.target.seePlan': 'See **remediation-plan.md** for the prioritized action plan that closes these gaps.',
  'gap.heading.gaps': 'Gaps and partial coverage (address these first)',
  'gap.item.rationale': 'Rationale: {rationale}',
  'gap.item.evidence': 'Evidence ({where}): "{quote}"',
  'gap.item.evidenceSource': 'Evidence ({where})',
  'gap.noGaps': '_No gaps — every subcategory is at least substantially covered._',
  'gap.heading.covered': 'Substantially or fully covered',
  'gap.noneCovered': '_No subcategories are substantially or fully covered yet._',
  'gap.footer':
    'Every coverage level above "none" is supported by at least one quote that was checked verbatim ' +
    'against the retrieved source text; unverifiable quotes are removed and the item is downgraded. ' +
    'Items marked UNREVIEWED or STALE still require human validation.',

  /* --------------------------- remediation-plan.md -------------------------- */
  'plan.title': 'NIST CSF 2.0 — Remediation Plan (Current → Target)',
  'plan.note':
    'Targets, priorities, and out-of-scope decisions are human choices recorded in the target profile — no AI ' +
    'makes them. Suggested actions are the official NIST CSF 2.0 Implementation Examples (public domain, source: ' +
    'NIST CPRT): illustrative starting points, not an exhaustive or mandatory list.',
  'plan.draft':
    '**DRAFT — not fully reviewed.** The current-coverage side of this plan contains ' +
    '{unreviewed} unreviewed and {stale} stale item(s). ' +
    'A human must validate every item before this plan is authoritative.',
  'plan.overview.baseline':
    'Target baseline: **{baseline}** for every outcome, plus any overrides recorded in the target profile',
  'plan.overview.description': 'Target description: {description}',
  'plan.overview.applicable': 'Applicable outcomes: {applicable} of {total}',
  'plan.overview.scopedOut': '{count} scoped out as not-applicable',
  'plan.overview.met':
    'Target met: **{met}/{applicable} ({pct}%)** — unmet: **{unmet}** (high {high}, medium {medium}, low {low})',
  'plan.heading.byFunction': 'Current vs target by Function',
  'plan.heading.actionPlan': 'Prioritized action plan',
  'plan.noUnmet': '_No unmet targets — the current posture meets or exceeds the target everywhere it applies._',
  'plan.intro':
    'Ranked by remediation priority, then by distance from the target. Work the list top-down; ' +
    "each item lists what the outcome requires, where the assessment stands, and NIST's example actions.",
  'plan.item.targetNote': 'Target note: {note}',
  'plan.item.plan': 'Plan (recorded in the target profile): {plan}',
  'plan.item.plan.owner': 'owner: {value}',
  'plan.item.plan.due': 'due: {value}',
  'plan.item.plan.status': 'status: {value}',
  'plan.item.plan.milestones': 'milestones: {value}',
  'plan.item.actions': 'Suggested actions (NIST CSF 2.0 Implementation Examples):',
  'plan.item.noActions': 'Suggested actions: (none provided by this CSF core export)',
  'plan.heading.met': 'At or above target ({count})',
  'plan.noneMet': '_No outcome meets its target yet._',
  'plan.met.entry': '{current} (target: {target})',
  'plan.heading.outOfScope': 'Out of scope — not-applicable ({count})',
  'plan.outOfScope.intro': 'Marked not-applicable in the target profile; excluded from the met/unmet figures above.',
  'plan.outOfScope.reason': 'reason: {reason}',
  'plan.footer':
    'The current-coverage side of this plan comes from the reviewed assessment (see gap-analysis.md and ' +
    'current-profile.json); every coverage level above "none" is anchored to quotes verified verbatim ' +
    'against the source documents. Items marked UNREVIEWED or STALE still require human validation.',

  /* ------------------------- evidence-by-document.md ------------------------ */
  'docs.title': 'NIST CSF 2.0 — Evidence by Document',
  'docs.note':
    "The reverse view of the assessment: for each of the organization's documents, the CSF 2.0 outcomes it is " +
    'quoted for. Every quote counted here was verified verbatim against the document text. Coverage levels are ' +
    'those of the Current Profile (see gap-analysis.md): AI proposes, a human validates.',
  'docs.draft':
    '**DRAFT — not fully reviewed.** {unreviewed} unreviewed and {stale} ' +
    'stale item(s) remain. A human must validate every item before the coverage levels shown here are ' +
    'authoritative.',
  'docs.heading.summary': 'Summary',
  'docs.summary.ingested': 'Documents ingested: {value}',
  'docs.summary.ingested.notRecorded': 'not recorded — {count} seen in the assessment (see the note below)',
  'docs.summary.ingested.sharedNames': '{files} files under {names} distinct file names (see the note below)',
  'docs.summary.notIngested':
    'Not ingested: {skipped} skipped (no extractable text), {failed} failed to ' +
    'parse — these files are not part of the assessment and are not listed here',
  'docs.summary.quoted': 'Quoted at least once: {count}',
  'docs.summary.neverQuoted.ingested': 'Ingested but never quoted: {count}',
  'docs.summary.neverQuoted.retrieved': 'Retrieved but never quoted: {count}',
  'docs.summary.unlisted': 'In the assessment but not in the latest ingest record: {count} (see the note below)',
  'docs.summary.outcomesWithQuotes': 'Outcomes with at least one verified quote: {count} of {total}',
  'docs.summary.quotes': 'Verified quotes: {count}',
  'docs.summary.concentration': 'Evidence concentration: {value}',
  'docs.concentration.none': 'not applicable (no outcome has a verified quote)',
  'docs.concentration.single':
    'the first document in the table below is quoted for {outcomes} of the {total} outcomes that have a quote ' +
    '— at least half',
  'docs.concentration.several':
    'the first {documents} documents in the table below are together quoted for {outcomes} of the {total} ' +
    'outcomes that have a quote — the point in the table at which half is first reached',
  'docs.heading.documents': 'Documents',
  'docs.noDocuments': '_No document is recorded for this assessment._',
  'docs.documents.intro':
    'Ordered by the number of outcomes a document is quoted for, then by name. "Retrieved for" counts the ' +
    'outcomes for which at least one passage of the document was among those retrieved for the assessment; ' +
    '"Quoted for" counts the outcomes with at least one verified quote from it. The last four numeric ' +
    'columns break those outcomes down by their current coverage.',
  'docs.table.documents.header':
    '| Document | Chunks | Retrieved for | Quoted for | Verified quotes | None | Partial | Substantial | Full | Functions |',
  'docs.heading.quotedFor': 'What each document is quoted for',
  'docs.noneQuoted': '_No document is quoted: no outcome has a verified quote in this assessment._',
  'docs.quotedFor.noneOverride':
    'An outcome listed below with coverage "none" was set to that level by a reviewer: the quotes the ' +
    'assessment selected stay listed so the decision remains traceable.',
  'docs.doc.sharedName': '{files} ingested files share this name; their figures are combined (see the note above)',
  'docs.doc.unlisted': 'Not in the latest ingest record (see the note above)',
  'docs.doc.chunks': 'Chunks indexed: {chunks}',
  'docs.notRecorded': 'not recorded',
  'docs.doc.retrievedFor': 'Retrieved for: {count} of {total} outcomes',
  'docs.doc.quotedFor': 'Quoted for: {outcomes} ({quotes}) in {functions}',
  'docs.count.verifiedQuote.one': '{count} verified quote',
  'docs.count.verifiedQuote.other': '{count} verified quotes',
  'docs.doc.coverage': 'Current coverage of those outcomes: {distribution}',
  'docs.heading.neverQuoted.ingested': 'Ingested but never quoted',
  'docs.heading.neverQuoted.retrieved': 'Retrieved but never quoted',
  'docs.neverQuoted.none.ingested': '_Every ingested document is quoted for at least one outcome._',
  'docs.neverQuoted.none.retrieved': '_Every document seen in the assessment is quoted for at least one outcome._',
  'docs.neverQuoted.note':
    'No passage from these documents was selected as verbatim evidence for a CSF 2.0 outcome in this assessment. ' +
    'That alone does not make a document irrelevant or without value: its content may be outside the scope of ' +
    'the framework, may duplicate what another document was quoted for, or may simply not have been among the ' +
    'passages retrieved for an outcome.',
  'docs.table.neverQuoted.header': '| Document | Chunks | Retrieved for |',
  'docs.neverQuoted.reconstructed':
    'The document list was reconstructed, so a document that was never retrieved for any outcome is missing ' +
    'from this section.',
  'docs.footer':
    'Derived from the same Current Profile as gap-analysis.md and evidence-map.csv, which lists every quote with ' +
    'its text. Documents are identified by file name. Items marked UNREVIEWED or STALE still require human ' +
    'validation.',
  // The caveats of the document view (also shown on the dashboard card).
  'docs.caveat.andMore': '{shown}, and {count} more',
  'docs.caveat.reconstructed':
    'Document list reconstructed from the assessment: this work directory has no ingest record of its ' +
    'documents (it was ingested by an earlier version of the tool). Only documents that were retrieved or ' +
    'quoted for at least one outcome are listed, chunk counts are unavailable, and files that share a name ' +
    'cannot be detected. Re-run the ingest stage to record the full list.',
  'docs.caveat.sharedName':
    '{count} ingested files share the name {name}: {paths}. ' +
    'Evidence is recorded by file name, so their quotes and retrievals cannot be attributed to one file or ' +
    'another and are counted together in a single row.',
  'docs.caveat.unlisted.one':
    '{count} document appears in the assessment but not in the latest ingest record: ' +
    '{names}. The assessment was made against an earlier set of documents; re-run the analyze ' +
    'stage to bring it up to date.',
  'docs.caveat.unlisted.other':
    '{count} documents appear in the assessment but not in the latest ingest record: ' +
    '{names}. The assessment was made against an earlier set of documents; re-run the analyze ' +
    'stage to bring it up to date.',
  'docs.caveat.noRetrieval':
    'The assessment does not record which passages were retrieved for each outcome, so the "retrieved for" ' +
    'figures are unavailable.',
  'docs.caveat.stale':
    'The assessment is out of date with its inputs ({reasons}). A document ingested or ' +
    'changed after the analysis has not been assessed and appears here as never quoted; re-run the analyze ' +
    'stage.',
  'docs.caveat.incomplete':
    'The analysis is incomplete: {assessed} of {total} outcomes have been assessed. The ' +
    'figures here cover only those outcomes; run the analyze stage to complete it.',

  /* --------------------------- evidence-requests.md ------------------------- */
  'requests.title': 'NIST CSF 2.0 — Evidence Request List',
  'requests.purpose':
    'An interview and collection guide for the outcomes this assessment could not demonstrate at the required ' +
    'level. An outcome is listed because the documents provided did not show it — not because the organization ' +
    'necessarily lacks the practice: absence of evidence is not absence of a control. To close an item, collect ' +
    'the documents or records, add them to the documents folder, and re-run the pipeline (ingest, analyze, ' +
    'review, report). The assessment gives a coverage level above "none" only when a quote verified verbatim ' +
    'against the documents supports it; a reviewer then validates each level and may override it.',
  'requests.sources':
    "The three questions are the same for every outcome and mirror the assessment's rubric. The checklists are the " +
    'official NIST CSF 2.0 Implementation Examples (public domain, source: NIST CPRT), quoted verbatim: ' +
    "illustrative, not an exhaustive list and not a baseline of required actions. Rationales are the assessment's " +
    'AI-generated reasoning.',
  'requests.draft':
    '**DRAFT — not fully reviewed.** {unreviewed} unreviewed and {stale} ' +
    'stale item(s) remain. A human must validate every item before the coverage levels this list is based ' +
    'on are authoritative.',
  'requests.caveat.stale':
    'The assessment is out of date with its inputs ({reasons}). Re-run the ' +
    'analyze stage before collecting evidence against this list: it may ask for something the current ' +
    'documents already show.',
  'requests.caveat.incomplete':
    'The analysis is incomplete: {assessed} of {total} outcomes have been assessed. An ' +
    'outcome that has not been assessed is listed with coverage "none" although no document was examined ' +
    'for it; run the analyze stage to complete it.',
  'requests.scope.target.one':
    'Scope: the {count} applicable outcome that does not meet its target, in the same order and numbering as ' +
    'remediation-plan.md',
  'requests.scope.target.other':
    'Scope: the {count} applicable outcomes that do not meet their target, in the same order and numbering as ' +
    'remediation-plan.md',
  'requests.notListed.target': 'Not listed: {met} at or above target',
  'requests.notListed.scopedOut': '{count} scoped out as not-applicable',
  'requests.scope.gaps.one':
    'Scope: the {count} outcome whose current coverage is none or partial (no target profile is set), ' +
    'grouped by Function',
  'requests.scope.gaps.other':
    'Scope: the {count} outcomes whose current coverage is none or partial (no target profile is set), ' +
    'grouped by Function',
  'requests.notListed.gaps': 'Not listed: {count} substantially or fully covered',
  'requests.open': 'Open requests: {count}',
  'requests.open.byCoverage': 'current coverage: {distribution}',
  'requests.heading.requests': 'Evidence requests',
  'requests.none.target': '_No open evidence requests — every applicable outcome meets its target._',
  'requests.none.gaps': '_No open evidence requests — every outcome is at least substantially covered._',
  'requests.item.coverage': 'Current coverage: {coverage}',
  'requests.item.coverage.withTarget': '{coverage}; target: {target}; priority: {priority}',
  'requests.item.reviewStatus': 'Review status: {status}',
  'requests.item.quotedDocuments': 'Documents already quoted: {documents}',
  'requests.item.questions': 'Questions to ask:',
  // The same three questions for every outcome (EVIDENCE_QUESTIONS).
  'requests.question.1': 'Is this outcome achieved today, and who is accountable for it?',
  'requests.question.2': 'Where is it documented, and when was that documentation last reviewed?',
  'requests.question.3': 'Which records show it operating in practice (not only that it is required)?',
  'requests.item.examples':
    'Evidence that could demonstrate it — documents or records showing practices such as these in operation ' +
    '(NIST CSF 2.0 Implementation Examples, verbatim; illustrative, not exhaustive, not a required baseline):',
  'requests.item.noExamples':
    'Evidence that could demonstrate it: (no Implementation Examples provided by this CSF core export)',
  'requests.footer.target':
    'An item leaves this list when a later assessment demonstrates the outcome at the required level with ' +
    'verified quotes, or when the target profile lowers its target or scopes it out. ' +
    'Items marked UNREVIEWED or STALE still require human validation.',
  'requests.footer.gaps':
    'An item leaves this list when a later assessment demonstrates the outcome at the required level with ' +
    'verified quotes. Items marked UNREVIEWED or STALE still require human validation.',

  /* -------------------------------- crosswalk.md ---------------------------- */
  'crosswalk.title': 'NIST CSF 2.0 — Crosswalks to Other Frameworks (Informative References)',
  'crosswalk.howToRead.title': '**How to read this report**',
  'crosswalk.howToRead.related':
    '**Related, not equivalent.** A mapping records that a CSF 2.0 outcome and a reference in another ' +
    'framework are related. It does not say that achieving one satisfies the other.',
  'crosswalk.howToRead.coverage':
    '**Coverage is about the CSF outcome only.** The coverage shown beside an outcome is what this assessment ' +
    'found for that outcome. It is not a determination of conformance with the referenced control or ' +
    'requirement, and this report does not measure conformance with any other framework.',
  'crosswalk.howToRead.levels':
    '**Three levels of relationship.** A mapping relates a reference to one CSF outcome (a Subcategory), to a ' +
    'whole Category, or to a whole Function. Each crosswalk below lists the first kind in one table and the ' +
    'other two in a second table. For a whole Category or Function the report shows how the outcomes under ' +
    'it are distributed across coverage levels; it does not pick one, because the mapping does not.',
  'crosswalk.howToRead.identifiers':
    '**Identifiers only.** No control or requirement text from the referenced frameworks is reproduced here. ' +
    "Consult each framework's own publication for what an identifier means.",
  'crosswalk.howToRead.who':
    '**Who made each mapping.** The mappings come from: {source}. Each was developed by the party ' +
    'named as its developer there — not by this project, which adds no mappings of its own. Inclusion here ' +
    'is not an endorsement by NIST or by this project.',
  'crosswalk.draft':
    '**DRAFT — not fully reviewed.** {unreviewed} unreviewed and {stale} stale item(s) remain in the ' +
    'assessment; any of them that appear below are marked. A human must validate every item before these ' +
    'coverage values are relied on.',
  'crosswalk.overview.mappingSource': 'Mapping source: {source} — retrieved {date}',
  'crosswalk.overview.catalog': 'Catalog where each mapping and its developer are listed: {url}',
  'crosswalk.overview.coverage':
    'Coverage: from the Current Profile (current-profile.json) — reviewed {reviewed}, ' +
    'unreviewed {unreviewed}, stale {stale}',
  'crosswalk.overview.included': 'Crosswalks included: {count}',
  'crosswalk.table.overview.header':
    '| Crosswalk | Framework | Mapping developer | Released | References | Subcategories mapped |',
  'crosswalk.ofTotal': '{count} of {total}',
  'crosswalk.thirdParty.label': 'third-party mapping',
  'crosswalk.thirdParty.line':
    "**Third-party mapping — not produced by the framework's publisher.** It is reproduced as published, " +
    'including any entries that are non-specific or appear to be errors.',
  'crosswalk.item.id': 'Crosswalk id: {id}',
  'crosswalk.item.mapping': 'Mapping: {name}, version {version}, released {date}',
  'crosswalk.item.developer': 'Mapping developer (as listed in the mapping source): {developer}',
  'crosswalk.item.catalog': 'Catalog where this mapping and its developer are listed: {url}',
  'crosswalk.item.document': 'Mapping document (hosted by NIST): {url}',
  'crosswalk.item.relationships':
    'Relationships recorded for: {subcategories} of {totalSubcategories} Subcategories, ' +
    '{categories} of {totalCategories} Categories, {functions} of {totalFunctions} Functions',
  'crosswalk.item.notShown':
    'Not shown: this mapping also covers {subcategories} Subcategory(ies) and ' +
    '{groups} Category(ies) or Function(s) that are not part of this assessment.',
  'crosswalk.noReferences': '_This mapping has no reference related to an outcome in this assessment._',
  'crosswalk.counts.intro':
    'The counts below describe the CSF outcomes related to each reference; a reference related to a whole ' +
    'Category or Function is related to every outcome under it. They describe those outcomes: they do not ' +
    'say whether a reference is satisfied, and they are not a measure of conformance with {framework}.',
  'crosswalk.counts.listed': 'References listed: {count}',
  'crosswalk.counts.withGap': 'References with at least one related outcome at none or partial: {count}',
  'crosswalk.counts.pending': 'References with at least one related outcome still unreviewed or stale: {count}',
  'crosswalk.table.outcomes.title': '**References related to individual outcomes (Subcategories)**',
  'crosswalk.table.outcomes.header': '| Reference | Related CSF 2.0 outcomes (coverage) |',
  'crosswalk.related.alsoGroup': '{outcomes} — also related to a whole Category or Function (next table)',
  'crosswalk.table.groups.title': '**References related to a whole Category or Function**',
  'crosswalk.table.groups.intro':
    'The mapping relates each of these references to the Category or Function as a whole, not to one ' +
    'outcome in it. The last column counts the outcomes under it by coverage.',
  'crosswalk.table.groups.header': '| Reference | Related Category or Function | Outcomes under it, by coverage |',
  'crosswalk.group.category': 'Category: {name}',
  'crosswalk.group.function': 'Function: {name}',
  'crosswalk.distribution.one': '{count} outcome: {distribution}',
  'crosswalk.distribution.other': '{count} outcomes: {distribution}',
  'crosswalk.pending.unreviewed': '{count} unreviewed',
  'crosswalk.pending.stale': '{count} stale',
  'crosswalk.footer':
    'Coverage values come from the assessment; gap-analysis.md and current-profile.json hold the evidence, the ' +
    'rationale and the review record behind each one. Items marked UNREVIEWED or STALE still require human ' +
    'validation. Reference identifiers come from the mappings as retrieved on the date above; this tool adds ' +
    'no mappings of its own.',

  /* ------------------------------ `ask` result ------------------------------ */
  'ask.title': 'Answer',
  'ask.question': 'Question: {question}',
  'ask.answerLabel': 'Answer (AI-generated summary — check it against the quotes below):',
  'ask.quotesLabel': 'Verified quotes ({count}):',
  'ask.verified.some':
    '{verified} of {checked} quotes returned by the model were verified verbatim against the ingested documents; ' +
    'the rest were removed.',
  'ask.verified.single': 'The quote returned by the model was verified verbatim against the ingested documents.',
  'ask.verified.all': 'All {count} quotes returned by the model were verified verbatim against the ingested documents.',
  'ask.onlyQuotesVerified':
    "Only the quotes are verified. The summary is the model's wording and is not itself verified.",
  'ask.search.none': 'The index returned no passages to search.',
  'ask.search.all.one': 'Searched all {count} passage of the index.',
  'ask.search.all.other': 'Searched all {count} passages of the index.',
  'ask.search.top':
    'Searched the {count} most relevant of {indexed} passages of the index (retrieval.topK = {topK}).',
  'ask.partialSearch':
    'Only those passages were read, so this means "not found there", not "the documents contain nothing on this".',
  'ask.withheld.noQuote': 'The model proposed an answer without any quote, so the answer was withheld.',
  'ask.withheld.oneQuote':
    'The model proposed an answer, but its quote could not be verified verbatim, so the answer was withheld.',
  'ask.withheld.quotes':
    'The model proposed an answer, but none of its {count} quotes could be verified verbatim, so the answer ' +
    'was withheld.',
  'ask.invalidOutput':
    'The model did not return a usable response, even after one retry, so there was no answer to verify.',

  /* ------------------------------ dashboard.html ---------------------------- */
  // English dashboards do not read these: their script carries its English
  // text inline (see htmlDashboard.js). They are the reference for the other
  // languages, and a test renders both forms and compares them.
  'dashboard.title': 'NIST CSF 2.0 — Assessment Dashboard',
  'dashboard.noscript':
    'This dashboard needs JavaScript. The same data is in {profile}, {gap}, and {evidence} next to this file.',
  'dashboard.notRecorded': 'Not recorded',
  'dashboard.dateUnavailable': 'Date unavailable',
  'dashboard.dateUnavailable.lower': 'date unavailable',
  'dashboard.time.aria': '{label}; ISO timestamp {iso}',
  'dashboard.generated': 'Generated',
  'dashboard.providers.embeddings': 'embeddings: {id}',
  'dashboard.providers.reasoning': 'reasoning: {id}',
  'dashboard.theme.auto': 'Theme: auto',
  'dashboard.theme.light': 'Theme: light',
  'dashboard.theme.dark': 'Theme: dark',
  'dashboard.draft.title': 'Draft — not fully reviewed.',
  'dashboard.draft.text':
    '{unreviewed} unreviewed and {stale} stale item(s) remain. AI output is a proposal; a human must validate ' +
    'every item before this profile is authoritative.',
  'dashboard.outOfScope': 'Out of scope',

  'dashboard.activity.title': 'Assessment activity',
  'dashboard.activity.desc':
    'Milestones captured in this self-contained snapshot. Regenerate the report to reflect later work.',
  'dashboard.activity.ingested': 'Documents ingested',
  'dashboard.activity.documents.detail': '{parsed} parsed · {skipped} skipped · {failed} failed',
  'dashboard.activity.documents.unavailable': 'Document counts unavailable',
  'dashboard.activity.analyzed': 'Coverage analyzed',
  'dashboard.activity.analysis.detail': '{assessed} of {total} outcomes assessed',
  'dashboard.activity.review': 'Human review',
  'dashboard.activity.review.detail': '{current} current · {pending} pending',
  'dashboard.activity.review.none': 'No review recorded',
  'dashboard.activity.target': 'Target updated',
  'dashboard.activity.target.baseline': 'Baseline: {baseline}',
  'dashboard.activity.target.optional': 'Optional stage',
  'dashboard.activity.target.notConfigured': 'Not configured',
  'dashboard.activity.snapshot': 'Snapshot generated',
  'dashboard.activity.snapshot.detail': 'Offline, self-contained report',

  'dashboard.tile.addressed': 'Outcomes addressed',
  'dashboard.tile.addressed.ctx': '{count} of {total} substantial or full',
  'dashboard.tile.gaps': 'Gaps',
  'dashboard.tile.gaps.ctx': 'none {none} · partial {partial}',
  'dashboard.tile.review': 'Review progress',
  'dashboard.tile.review.ctx': '{reviewed} reviewed · {unreviewed} unreviewed · {stale} stale',
  'dashboard.tile.overrides': 'Human overrides',
  'dashboard.tile.overrides.ctx': 'AI judgments changed by a current human review',
  'dashboard.tile.downgrades': 'Verifier downgrades',
  'dashboard.tile.downgrades.ctx': 'claims dropped for unverifiable quotes',
  'dashboard.tile.target': 'Target met',
  'dashboard.tile.target.ctx': '{met} of {applicable} applicable at target',
  'dashboard.tile.target.outOfScope': '{count} out of scope',
  'dashboard.tile.tier': 'CSF Tier',
  'dashboard.tile.tier.both': 'Current {current} → target {target}',
  'dashboard.tile.tier.currentOnly': 'Current {current} · target not recorded',
  'dashboard.tile.tier.targetOnly': 'Target {target} · current not recorded',
  'dashboard.tile.tier.basis': 'selected by the organization, not derived by this tool',

  'dashboard.chart.viewTable': 'View as table',
  'dashboard.chart.viewChart': 'View as chart',
  'dashboard.col.function': 'Function',
  'dashboard.col.total': 'Total',
  'dashboard.col.pctAddressed': '% addressed',
  'dashboard.col.applicable': 'Applicable',
  'dashboard.col.met': 'Met',
  'dashboard.col.unmet': 'Unmet',
  'dashboard.col.pctMet': '% met',
  'dashboard.col.id': 'ID',
  'dashboard.col.coverage': 'Coverage',
  'dashboard.col.confidence': 'Conf.',
  'dashboard.col.review': 'Review',
  'dashboard.col.target': 'Target',
  'dashboard.col.priority': 'Priority',
  'dashboard.col.evidence': 'Evidence',

  'dashboard.coverage.title': 'Coverage by Function',
  'dashboard.coverage.desc': 'How the {count} assessed outcomes distribute across the four coverage tiers.',
  'dashboard.coverage.aria': 'Stacked bars: coverage tier counts per CSF Function',
  'dashboard.coverage.rowTotal': 'total {total}',

  'dashboard.target.title': 'Current vs Target',
  'dashboard.target.desc':
    'Percent of applicable outcomes already at or above their target (baseline: {baseline}).',
  'dashboard.target.aria': 'Bars: percent of applicable outcomes at target, per CSF Function',
  'dashboard.target.rowAria': '{function}: {pct}% at target ({met} of {applicable} applicable)',
  'dashboard.target.rowAria.outOfScope':
    '{function}: {pct}% at target ({met} of {applicable} applicable, {outOfScope} out of scope)',
  'dashboard.target.atTarget': 'At target',
  'dashboard.target.unmet': 'Unmet',
  'dashboard.target.na': 'n/a',

  'dashboard.plan.title': 'Top remediation priorities',
  'dashboard.plan.desc':
    'First {shown} of {total} unmet targets, in plan order — the full plan with NIST suggested actions is in ' +
    'remediation-plan.md.',
  'dashboard.plan.priority.high': 'high priority',
  'dashboard.plan.priority.medium': 'medium priority',
  'dashboard.plan.priority.low': 'low priority',
  'dashboard.plan.priorityOf': '{priority} priority',

  'dashboard.docs.title': 'Evidence by document',
  'dashboard.docs.summary.reconstructed.one': '{count} document seen in the assessment (list reconstructed)',
  'dashboard.docs.summary.reconstructed.other': '{count} documents seen in the assessment (list reconstructed)',
  'dashboard.docs.summary.ingested.one': '{count} document ingested',
  'dashboard.docs.summary.ingested.other': '{count} documents ingested',
  'dashboard.docs.summary.shared.one': '{files} files ingested under {count} distinct name',
  'dashboard.docs.summary.shared.other': '{files} files ingested under {count} distinct names',
  'dashboard.docs.summary.quoted': '{count} quoted at least once',
  'dashboard.docs.summary.neverQuoted': '{count} never quoted',
  'dashboard.docs.summary.unlisted': '{count} not in the ingest record',
  'dashboard.docs.summary.outcomes': '{count} of {total} outcomes have a verified quote.',
  'dashboard.docs.summary.detail': 'Per-document detail is in evidence-by-document.md.',
  'dashboard.docs.note': 'Note: {note}',
  'dashboard.docs.footer':
    'A document that is never quoted is not thereby irrelevant: no passage from it was selected as verbatim ' +
    'evidence for a CSF outcome in this assessment.',
  'dashboard.docs.col.document': 'Document',
  'dashboard.docs.col.chunks': 'Chunks',
  'dashboard.docs.col.retrievedFor': 'Retrieved for',
  'dashboard.docs.col.quotedFor': 'Quoted for',
  'dashboard.docs.col.quotes': 'Quotes',
  'dashboard.docs.col.coverage': 'Coverage of quoted outcomes',
  'dashboard.docs.col.functions': 'Functions',
  'dashboard.docs.sharedName': '{files} files share this name',
  'dashboard.docs.unlisted': 'not in the ingest record',
  'dashboard.docs.showFirst': 'Show the first {count}',
  'dashboard.docs.showAll': 'Show all {count} documents',

  'dashboard.explorer.title': 'All subcategories',
  'dashboard.explorer.desc':
    'Every assessed outcome with its verified evidence. Click a row for the rationale, quotes.',
  'dashboard.explorer.desc.target':
    'Every assessed outcome with its verified evidence. Click a row for the rationale, quotes, and NIST ' +
    'suggested actions.',
  'dashboard.explorer.count': '{shown} of {total}',
  'dashboard.quick.label': 'Quick filters',
  'dashboard.quick.aria': '{label}, {count} outcomes',
  'dashboard.quick.attention': 'Needs attention',
  'dashboard.quick.gaps': 'Gaps',
  'dashboard.quick.review': 'Review pending',
  'dashboard.quick.unmet': 'Unmet target',
  'dashboard.search.placeholder': 'Search outcomes, rationale, notes, sources, quotes…',
  'dashboard.search.aria': 'Search subcategories and evidence',
  'dashboard.filter.function': 'Function',
  'dashboard.filter.function.all': 'All Functions',
  'dashboard.filter.coverage': 'Coverage',
  'dashboard.filter.coverage.all': 'All coverage',
  'dashboard.filter.coverage.gaps': 'Gaps (none + partial)',
  'dashboard.filter.review': 'Review status',
  'dashboard.filter.review.all': 'All review states',
  'dashboard.filter.target': 'Target status',
  'dashboard.filter.target.all': 'All vs target',
  'dashboard.filter.target.unmet': 'Unmet target',
  'dashboard.filter.target.met': 'At/above target',

  'dashboard.override.tag': 'human',
  'dashboard.override.title': 'Human override: {from} → {to}',
  'dashboard.override.aria': 'Human override from {from} to {to}',
  'dashboard.detail.override': 'Human override: AI proposed {ai}; reviewer set {human}.',
  'dashboard.detail.override.by': 'Human override: AI proposed {ai}; reviewer set {human} ({reviewer}).',
  'dashboard.detail.reviewerNote': 'Reviewer note: {note}',
  'dashboard.detail.targetNote': 'Target note: {note}',
  'dashboard.detail.evidence': 'Verified evidence ({count})',
  'dashboard.detail.none': '(none)',
  'dashboard.detail.examples': 'NIST implementation examples (suggested actions)',
  'dashboard.detail.references': 'Related references (informative)',
  'dashboard.detail.references.desc':
    'Identifiers that the selected mappings relate to this outcome. Related is not equivalent: ' +
    'coverage of this outcome is not a determination of conformance with any of them.',
  'dashboard.detail.references.none': '(none recorded for this outcome itself in the selected mappings)',
  'dashboard.detail.references.whole': 'Related to its whole Category or Function, not to this outcome alone:',
  'dashboard.xref.category': 'Category {id}',
  'dashboard.xref.function': 'Function {id}',

  'dashboard.footer.target':
    'Target profile: baseline "{baseline}". Targets, priorities, and scoping are human decisions; suggested ' +
    'actions are official NIST CSF 2.0 Implementation Examples (public domain).',
  'dashboard.footer.target.described':
    'Target profile: baseline "{baseline}" — {description}. Targets, priorities, and scoping are human ' +
    'decisions; suggested actions are official NIST CSF 2.0 Implementation Examples (public domain).',
  'dashboard.footer.crosswalk':
    'Related references: identifiers only, as each selected mapping records them for a Subcategory, a whole ' +
    'Category or a whole Function. Mapping source: {source} (retrieved {retrievedAt}). A mapping records a ' +
    'relationship, not equivalence or conformance. Search also matches these identifiers, as plain text; see ' +
    'crosswalk.md for details.',
  'dashboard.footer.generated':
    'Self-contained report generated by {tool} — no network access is required or used by this page.',
};
