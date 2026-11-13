/**
 * Spanish message catalog — the same keys and `{placeholders}` as en.js.
 *
 * Wording rules (kept on purpose; reviewers should hold new text to them):
 *  - Framework concepts use the terms of NIST's own Spanish edition of CSF 2.0
 *    (NIST CSWP 29 spa): "seguridad cibernética", "resultado" (outcome),
 *    "Función / Categoría / Subcategoría", "Perfil Actual / Perfil Objetivo",
 *    "brecha", "plan de acción", "Ejemplos de implementación", "Referencias
 *    informativas", "mapeo" (mapping), "Nivel" (Tier). The names of the
 *    Functions and Categories and the outcome statements are NOT here: they
 *    are read from NIST's translation (src/csf/localized.js).
 *  - The tool's own vocabulary is plain and the same everywhere: cobertura
 *    (ninguna / parcial / sustancial / completa), revisado / sin revisar /
 *    desactualizado, corrección del revisor, cita verificada, fundamento,
 *    objetivo cumplido / no cumplido, fuera de alcance, incorporar (ingest),
 *    relaciones con otros marcos (crosswalk), panel (dashboard).
 *  - "Nivel" with a capital is a CSF Tier; a coverage level is always "nivel
 *    de cobertura", and the lowest one is written as a value — cobertura
 *    "ninguna" — wherever it could be read as "no coverage was set".
 *  - Impersonal phrasing ("hay que", "conviene", "véase"), no exclamation
 *    marks, no regional words, nothing promotional.
 *  - A number is never placed where a Spanish adjective or participle would
 *    have to agree with it ("1 excluidos"): such figures are written as
 *    "label: number" or in parentheses. Where a count noun cannot be avoided
 *    the key has `.one` / `.other` forms.
 *  - File names, command names, configuration keys and provider identifiers
 *    stay as they are: they are what the reader will type or look for.
 */

export default {
  /* ----------------------------- tool vocabulary ---------------------------- */
  'coverage.none': 'ninguna',
  'coverage.partial': 'parcial',
  'coverage.substantial': 'sustancial',
  'coverage.full': 'completa',
  'coverage.title.none': 'Ninguna',
  'coverage.title.partial': 'Parcial',
  'coverage.title.substantial': 'Sustancial',
  'coverage.title.full': 'Completa',
  'review.reviewed': 'revisado',
  'review.unreviewed': 'sin revisar',
  'review.stale': 'desactualizado',
  'review.title.reviewed': 'Revisado',
  'review.title.unreviewed': 'Sin revisar',
  'review.title.stale': 'Desactualizado',
  'priority.high': 'alta',
  'priority.medium': 'media',
  'priority.low': 'baja',
  'planStatus.open': 'abierto',
  'planStatus.inProgress': 'en curso',
  'planStatus.done': 'finalizado',
  'planStatus.riskAccepted': 'riesgo aceptado',

  // CSF Tiers: the names of Sec. 3 of NIST CSWP 29 spa, each with the official
  // English name beside it (the publication itself is not uniform about them).
  'tier.name.1': 'Parcial (Partial)',
  'tier.name.2': 'Informado sobre el Riesgo (Risk Informed)',
  'tier.name.3': 'Repetible (Repeatable)',
  'tier.name.4': 'Adaptativo (Adaptive)',
  'tier.label': 'Nivel {tier} — {name}',
  'tier.notRecorded': 'no registrado',
  'tier.sentence': 'Nivel del CSF. Actual: {current}; objetivo: {target}. {basis} Definiciones de los Niveles: {definitions}.',
  'tier.note': 'Nota sobre el Nivel: {note}',

  /* ------------------------- shared by several reports ---------------------- */
  'badge.unreviewed': '⚠ SIN REVISAR',
  'badge.stale': '⚠ REVISIÓN DESACTUALIZADA',
  'badge.override': 'corrección del revisor: {from} → {to}',
  'badge.downgraded': 'cobertura rebajada por el verificador: cita no verificable eliminada',

  'common.page': 'p. {page}',
  'common.note': '**Nota.** {note}',
  'common.heading.overview': 'Visión general',
  'common.overview.framework': 'Marco: {framework} ({version})',
  'common.overview.generated': 'Generado: {date}',
  'common.overview.csfSource': 'Fuente del CSF: {source}',
  'common.table.target.header': '| Función | Aplicables | Cumplidos | No cumplidos | Fuera de alcance | % cumplido |',
  'common.priorityHeading.high': 'Prioridad alta ({count})',
  'common.priorityHeading.medium': 'Prioridad media ({count})',
  'common.priorityHeading.low': 'Prioridad baja ({count})',
  'common.levelsToClose.one': 'falta {count} nivel de cobertura',
  'common.levelsToClose.other': 'faltan {count} niveles de cobertura',
  'common.item.functionCategory': 'Función / Categoría: {function} / {category}',
  'common.item.outcome': 'Resultado: {outcome}',
  'common.item.assessmentRationale': 'Fundamento de la evaluación: {rationale}',
  'common.item.reviewerNote': 'Nota del revisor: {note}',
  'common.count.outcome.one': '{count} resultado',
  'common.count.outcome.other': '{count} resultados',
  'common.count.quote.one': '{count} cita',
  'common.count.quote.other': '{count} citas',

  // Shown once per report. No Markdown in these: the dashboard shows them as
  // plain text. The publication and its DOI are those of data/csf-core.es.json.
  'note.frameworkText.label': 'Texto del marco',
  'note.frameworkText':
    'Los nombres de las Funciones y de las Categorías y los resultados de las Subcategorías son los de la ' +
    'traducción oficial al español publicada por el NIST (NIST CSWP 29 spa, ' +
    'https://doi.org/10.6028/NIST.CSWP.29.spa), reproducida por cortesía del Instituto Nacional de Estándares y ' +
    'Tecnología (NIST). La evaluación se realizó con el texto original en inglés, que es el texto de referencia.',
  'note.frameworkText.partial':
    'Resultados incluidos en esta evaluación que esa traducción no cubre (no figuran en ella o su texto no es el ' +
    'oficial): {missing} de {total}; se muestran con su texto original.',
  'note.frameworkText.unavailable':
    'Este informe no dispone de una traducción publicada del CSF Core, por lo que los nombres de las Funciones y ' +
    'de las Categorías y los resultados de las Subcategorías se muestran con su texto original.',
  'note.examplesEnglish':
    'Los Ejemplos de implementación se muestran en inglés: el NIST solo los publica en ese idioma.',

  /* ---------------- sentences other modules write into the data ------------- */
  'fixed.profile.disclaimer':
    'Borrador asistido por IA. Principio rector: la IA propone, una persona valida. Todo nivel de cobertura ' +
    'superior a "ninguna" se apoya en citas verificadas palabra por palabra en la evidencia de origen. El texto ' +
    'original en inglés de las Subcategorías del CSF 2.0 es de dominio público (fuente: NIST CPRT).',
  'fixed.csfSource.full': 'NIST CPRT — CSF 2.0 Core (dominio público).',
  'fixed.csfSource.partial':
    'Se está usando un subconjunto PARCIAL del CSF; debe reemplazarse por la exportación completa del NIST CPRT.',
  'fixed.tier.basis':
    'Seleccionado por la organización y registrado en el Perfil Objetivo; esta herramienta no lo calcula.',
  'fixed.tier.definitions': 'Marco de Seguridad Cibernética (CSF) 2.0 del NIST, NIST CSWP 29 spa, Apéndice B',
  'fixed.analysis.mixedSignatures': 'las evaluaciones proceden de configuraciones de análisis distintas',
  'fixed.analysis.signatureDiffers': 'la configuración de las evaluaciones difiere de la del último análisis completado',
  'fixed.analysis.indexChanged': 'el índice de evidencia cambió después del análisis',
  'fixed.analysis.ingestNewer': 'la incorporación de documentos es posterior al último análisis completado',
  'fixed.rationale.notAssessed': 'No se generó ninguna evaluación para esta Subcategoría.',
  'fixed.rationale.noEvidence':
    'Valor asignado automáticamente: no se recuperó ninguna evidencia del conjunto de documentos.',
  'fixed.rationale.invalidOutput':
    'Valor asignado automáticamente: la respuesta del modelo no superó la validación de formato tras un reintento.',
  'fixed.ask.noEvidence': 'Ninguna evidencia verificable de los documentos incorporados responde a esta pregunta.',
  'fixedPrefix.rationale.downgraded':
    '[Rebajado automáticamente: la cobertura declarada no tenía ninguna cita textual verificable en la evidencia ' +
    'recuperada.]',
  'fixedPrefix.rationale.fallback': 'Valor asignado automáticamente:',

  /* ----------------------------- gap-analysis.md ---------------------------- */
  'gap.title': 'CSF 2.0 del NIST — Perfil Actual y análisis de brechas',
  'gap.draft':
    '**BORRADOR — revisión incompleta.** Elementos sin revisar: {unreviewed}; con revisión desactualizada: {stale}. ' +
    'Una persona debe validar cada elemento antes de que este perfil pueda considerarse definitivo.',
  'gap.overview.providers': 'Proveedores de IA: embeddings = `{embeddings}`, razonamiento = `{llm}`',
  'gap.overview.subcategories': 'Subcategorías: {total}; brechas de cobertura (ninguna o parcial): **{gaps}**',
  'gap.overview.coverage': 'Cobertura: ninguna {none}, parcial {partial}, sustancial {substantial}, completa {full}',
  'gap.overview.review':
    'Revisión: revisados {reviewed}, sin revisar {unreviewed}, con revisión desactualizada {stale}, correcciones ' +
    '{overridden}',
  'gap.overview.downgraded': 'Elementos rebajados por el verificador: {count}',
  'gap.heading.byFunction': 'Cobertura por Función',
  'gap.table.byFunction.header': '| Función | Total | Ninguna | Parcial | Sustancial | Completa | % cubierto |',
  'gap.heading.currentVsTarget': 'Cobertura actual frente al objetivo',
  'gap.target.summary':
    'Objetivo predeterminado: **{baseline}**. Resultados aplicables que cumplen su objetivo: ' +
    '**{met}/{applicable}** ({pct}%); que no lo cumplen: {unmet} (prioridad alta {high}, media {medium}, baja ' +
    '{low})',
  'gap.target.outOfScope': 'fuera de alcance: {count}',
  'gap.target.seePlan': 'El plan de acción priorizado para cerrar estas brechas está en **remediation-plan.md**.',
  'gap.heading.gaps': 'Brechas y cobertura parcial (atender primero)',
  'gap.item.rationale': 'Fundamento: {rationale}',
  'gap.item.evidence': 'Evidencia ({where}): "{quote}"',
  'gap.item.evidenceSource': 'Evidencia ({where})',
  'gap.noGaps': '_Sin brechas: todas las Subcategorías tienen cobertura sustancial o completa._',
  'gap.heading.covered': 'Cobertura sustancial o completa',
  'gap.noneCovered': '_Ninguna Subcategoría tiene todavía cobertura sustancial o completa._',
  'gap.footer':
    'Todo nivel de cobertura superior a "ninguna" se apoya en al menos una cita que se comprobó palabra por ' +
    'palabra en el texto de origen recuperado; las citas no verificables se eliminan y se rebaja la cobertura ' +
    'del elemento. Los elementos marcados como SIN REVISAR o REVISIÓN DESACTUALIZADA aún requieren validación ' +
    'humana.',

  /* --------------------------- remediation-plan.md -------------------------- */
  'plan.title': 'CSF 2.0 del NIST — Plan de acción (Actual → Objetivo)',
  'plan.note':
    'Los objetivos, las prioridades y las exclusiones del alcance son decisiones humanas registradas en el ' +
    'Perfil Objetivo; ninguna IA las toma. Las acciones sugeridas son los Ejemplos de implementación oficiales ' +
    'del CSF 2.0 del NIST (dominio público, fuente: NIST CPRT): puntos de partida ilustrativos, no una lista ' +
    'exhaustiva ni obligatoria.',
  'plan.draft':
    '**BORRADOR — revisión incompleta.** Elementos sin revisar en la parte de cobertura actual de este plan: ' +
    '{unreviewed}; con revisión desactualizada: {stale}. Una persona debe validar cada elemento antes de que ' +
    'este plan pueda considerarse definitivo.',
  'plan.overview.baseline':
    'Objetivo predeterminado: **{baseline}** para todos los resultados, salvo las excepciones que figuren en el ' +
    'Perfil Objetivo',
  'plan.overview.description': 'Descripción del objetivo: {description}',
  'plan.overview.applicable': 'Resultados aplicables: {applicable} de {total}',
  'plan.overview.scopedOut': 'excluidos por no aplicables: {count}',
  'plan.overview.met':
    'Objetivo cumplido: **{met}/{applicable} ({pct}%)**; no cumplido: **{unmet}** (prioridad alta {high}, media ' +
    '{medium}, baja {low})',
  'plan.heading.byFunction': 'Cobertura actual frente al objetivo, por Función',
  'plan.heading.actionPlan': 'Plan de acción priorizado',
  'plan.noUnmet':
    '_No hay objetivos sin cumplir: la cobertura actual alcanza o supera el objetivo en todos los resultados ' +
    'aplicables._',
  'plan.intro':
    'Ordenado por prioridad y, después, por distancia al objetivo. Conviene recorrer la lista de arriba abajo; ' +
    'cada elemento indica qué exige el resultado, en qué punto está la evaluación y las acciones de ejemplo del NIST.',
  'plan.item.targetNote': 'Nota sobre el objetivo: {note}',
  'plan.item.plan': 'Plan (registrado en el Perfil Objetivo): {plan}',
  'plan.item.plan.owner': 'responsable: {value}',
  'plan.item.plan.due': 'fecha límite: {value}',
  'plan.item.plan.status': 'estado: {value}',
  'plan.item.plan.milestones': 'hitos: {value}',
  'plan.item.actions': 'Acciones sugeridas (Ejemplos de implementación del CSF 2.0 del NIST, en inglés):',
  'plan.item.noActions': 'Acciones sugeridas: (esta exportación del CSF Core no incluye ninguna)',
  'plan.heading.met': 'Objetivo alcanzado o superado ({count})',
  'plan.noneMet': '_Ningún resultado cumple todavía su objetivo._',
  'plan.met.entry': '{current} (objetivo: {target})',
  'plan.heading.outOfScope': 'Fuera de alcance: no aplicables ({count})',
  'plan.outOfScope.intro':
    'Marcados como no aplicables en el Perfil Objetivo; no se cuentan en las cifras anteriores de objetivos ' +
    'cumplidos y no cumplidos.',
  'plan.outOfScope.reason': 'motivo: {reason}',
  'plan.footer':
    'La parte de cobertura actual de este plan procede de la evaluación revisada (véanse gap-analysis.md y ' +
    'current-profile.json); todo nivel de cobertura superior a "ninguna" se apoya en citas verificadas palabra ' +
    'por palabra en los documentos de origen. Los elementos marcados como SIN REVISAR o REVISIÓN DESACTUALIZADA ' +
    'aún requieren validación humana.',

  /* ------------------------- evidence-by-document.md ------------------------ */
  'docs.title': 'CSF 2.0 del NIST — Evidencia por documento',
  'docs.note':
    'La vista inversa de la evaluación: para cada documento de la organización, los resultados del CSF 2.0 para ' +
    'los que se cita. Cada cita contada aquí se verificó palabra por palabra en el texto del documento. Los ' +
    'niveles de cobertura son los del Perfil Actual (véase gap-analysis.md): la IA propone, una persona valida.',
  'docs.draft':
    '**BORRADOR — revisión incompleta.** Elementos sin revisar: {unreviewed}; con revisión desactualizada: ' +
    '{stale}. Una persona debe validar cada elemento antes de que los niveles de cobertura que aquí se muestran ' +
    'puedan considerarse definitivos.',
  'docs.heading.summary': 'Resumen',
  'docs.summary.ingested': 'Documentos incorporados: {value}',
  'docs.summary.ingested.notRecorded': 'sin registro; vistos en la evaluación: {count} (véase la nota más abajo)',
  'docs.summary.ingested.sharedNames':
    '{files} archivos (nombres de archivo distintos: {names}; véase la nota más abajo)',
  'docs.summary.notIngested':
    'No incorporados: omitidos por no tener texto extraíble ({skipped}), con error de lectura ({failed}); ' +
    'estos archivos no forman parte de la evaluación y no se enumeran aquí',
  'docs.summary.quoted': 'Citados al menos una vez: {count}',
  'docs.summary.neverQuoted.ingested': 'Incorporados pero nunca citados: {count}',
  'docs.summary.neverQuoted.retrieved': 'Recuperados pero nunca citados: {count}',
  'docs.summary.unlisted':
    'Presentes en la evaluación pero no en el último registro de incorporación: {count} (véase la nota más abajo)',
  'docs.summary.outcomesWithQuotes': 'Resultados con al menos una cita verificada: {count} de {total}',
  'docs.summary.quotes': 'Citas verificadas: {count}',
  'docs.summary.concentration': 'Concentración de la evidencia: {value}',
  'docs.concentration.none': 'no aplicable (ningún resultado tiene una cita verificada)',
  'docs.concentration.single':
    'el primer documento de la tabla siguiente se cita para {outcomes} de los resultados que tienen alguna cita ' +
    '({total} en total): al menos la mitad',
  'docs.concentration.several':
    'los {documents} primeros documentos de la tabla siguiente se citan, en conjunto, para {outcomes} de los ' +
    '{total} resultados que tienen alguna cita: el punto de la tabla en el que se alcanza por primera vez la ' +
    'mitad',
  'docs.heading.documents': 'Documentos',
  'docs.noDocuments': '_No hay ningún documento registrado para esta evaluación._',
  'docs.documents.intro':
    'Ordenados por el número de resultados para los que se cita cada documento y, después, por nombre. ' +
    '"Recuperado para" cuenta los resultados para los que al menos un pasaje del documento estuvo entre los ' +
    'recuperados para la evaluación; "Citado para" cuenta los resultados con al menos una cita verificada del ' +
    'documento. Las cuatro últimas columnas numéricas desglosan esos resultados según su cobertura actual.',
  'docs.table.documents.header':
    '| Documento | Fragmentos | Recuperado para | Citado para | Citas verificadas | Ninguna | Parcial | Sustancial | Completa | Funciones |',
  'docs.heading.quotedFor': 'Para qué se cita cada documento',
  'docs.noneQuoted': '_No se cita ningún documento: ningún resultado tiene una cita verificada en esta evaluación._',
  'docs.quotedFor.noneOverride':
    'Un resultado que aparece más abajo con cobertura "ninguna" recibió ese nivel de cobertura de un revisor: ' +
    'las citas que seleccionó la evaluación se mantienen en la lista para que la decisión siga siendo trazable.',
  'docs.doc.sharedName':
    '{files} archivos incorporados comparten este nombre; sus cifras se muestran combinadas (véase la nota más arriba)',
  'docs.doc.unlisted': 'No figura en el último registro de incorporación (véase la nota más arriba)',
  'docs.doc.chunks': 'Fragmentos indexados: {chunks}',
  'docs.notRecorded': 'sin registro',
  'docs.doc.retrievedFor': 'Recuperado para: {count} de {total} resultados',
  'docs.doc.quotedFor': 'Citado para: {outcomes} ({quotes}) en {functions}',
  'docs.count.verifiedQuote.one': '{count} cita verificada',
  'docs.count.verifiedQuote.other': '{count} citas verificadas',
  'docs.doc.coverage': 'Cobertura actual de esos resultados: {distribution}',
  'docs.heading.neverQuoted.ingested': 'Incorporados pero nunca citados',
  'docs.heading.neverQuoted.retrieved': 'Recuperados pero nunca citados',
  'docs.neverQuoted.none.ingested': '_Todos los documentos incorporados se citan para al menos un resultado._',
  'docs.neverQuoted.none.retrieved': '_Todos los documentos vistos en la evaluación se citan para al menos un resultado._',
  'docs.neverQuoted.note':
    'En esta evaluación no se seleccionó ningún pasaje de estos documentos como evidencia textual de un resultado ' +
    'del CSF 2.0. Eso, por sí solo, no significa que un documento sea irrelevante o carezca de valor: su contenido ' +
    'puede quedar fuera del alcance del marco, puede repetir aquello para lo que ya se citó otro documento o, ' +
    'sencillamente, puede no haber estado entre los pasajes recuperados para un resultado.',
  'docs.table.neverQuoted.header': '| Documento | Fragmentos | Recuperado para |',
  'docs.neverQuoted.reconstructed':
    'La lista de documentos se reconstruyó, por lo que en esta sección faltan los documentos que no se ' +
    'recuperaron para ningún resultado.',
  'docs.footer':
    'Este informe procede del mismo Perfil Actual que gap-analysis.md y evidence-map.csv; este último recoge ' +
    'cada cita con su texto. Los documentos se identifican por su nombre de archivo. Los elementos marcados como ' +
    'SIN REVISAR o REVISIÓN DESACTUALIZADA aún requieren validación humana.',
  // The caveats of the document view. They are also shown on the dashboard
  // card as plain text, so they carry no Markdown.
  'docs.caveat.andMore': '{shown} y {count} más',
  'docs.caveat.reconstructed':
    'Lista de documentos reconstruida a partir de la evaluación: este directorio de trabajo no tiene un registro ' +
    'de incorporación de sus documentos (se incorporaron con una versión anterior de la herramienta). Solo se ' +
    'enumeran los documentos que se recuperaron o se citaron para al menos un resultado, no se dispone del ' +
    'número de fragmentos y no es posible detectar si hay archivos que comparten nombre. Para registrar la lista ' +
    'completa hay que volver a ejecutar la etapa de incorporación (ingest).',
  'docs.caveat.sharedName':
    '{count} archivos incorporados comparten el nombre {name}: {paths}. ' +
    'La evidencia se registra por nombre de archivo, por lo que sus citas y recuperaciones no pueden atribuirse ' +
    'a uno u otro archivo y se cuentan juntas en una sola fila.',
  'docs.caveat.unlisted.one':
    '{count} documento aparece en la evaluación pero no en el último registro de incorporación: ' +
    '{names}. La evaluación se hizo con un conjunto de documentos anterior; para ponerla al día hay que volver ' +
    'a ejecutar la etapa de análisis (analyze).',
  'docs.caveat.unlisted.other':
    '{count} documentos aparecen en la evaluación pero no en el último registro de incorporación: ' +
    '{names}. La evaluación se hizo con un conjunto de documentos anterior; para ponerla al día hay que volver ' +
    'a ejecutar la etapa de análisis (analyze).',
  'docs.caveat.noRetrieval':
    'La evaluación no registra qué pasajes se recuperaron para cada resultado, por lo que las cifras de ' +
    '"recuperado para" no están disponibles.',
  'docs.caveat.stale':
    'La evaluación no está al día con sus datos de entrada ({reasons}). Un documento incorporado o ' +
    'modificado después del análisis no se ha evaluado y aparece aquí como nunca citado; hay que volver a ' +
    'ejecutar la etapa de análisis (analyze).',
  'docs.caveat.incomplete':
    'El análisis está incompleto (resultados evaluados: {assessed} de {total}). Las cifras que aquí se muestran ' +
    'solo abarcan esos resultados; para completarlo hay que ejecutar la etapa de análisis (analyze).',

  /* --------------------------- evidence-requests.md ------------------------- */
  'requests.title': 'CSF 2.0 del NIST — Lista de solicitudes de evidencia',
  'requests.purpose':
    'Guía de entrevista y de recopilación para los resultados que esta evaluación no pudo demostrar con el nivel ' +
    'de cobertura requerido. Un resultado figura en la lista porque los documentos aportados no lo demostraron, ' +
    'no porque la organización necesariamente carezca de la práctica: la ausencia de evidencia no equivale a la ' +
    'ausencia de un control. Para cerrar un elemento hay que reunir los documentos o registros, añadirlos a la ' +
    'carpeta de documentos y volver a ejecutar el proceso completo (ingest, analyze, review, report). La ' +
    'evaluación solo asigna un nivel de cobertura superior a "ninguna" cuando lo respalda una cita verificada ' +
    'palabra por palabra en los documentos; después, un revisor valida cada nivel de cobertura y puede ' +
    'corregirlo.',
  'requests.sources':
    'Las tres preguntas son las mismas para todos los resultados y reflejan los criterios de la evaluación. Las ' +
    'listas de verificación son los Ejemplos de implementación oficiales del CSF 2.0 del NIST (dominio público, ' +
    'fuente: NIST CPRT), citados textualmente: son ilustrativos, no una lista exhaustiva ni una línea de base de ' +
    'acciones necesarias. Los fundamentos son el razonamiento que la IA generó durante la evaluación.',
  'requests.draft':
    '**BORRADOR — revisión incompleta.** Elementos sin revisar: {unreviewed}; con revisión desactualizada: ' +
    '{stale}. Una persona debe validar cada elemento antes de que los niveles de cobertura en los que se basa ' +
    'esta lista puedan considerarse definitivos.',
  'requests.caveat.stale':
    'La evaluación no está al día con sus datos de entrada ({reasons}). Antes de reunir evidencia a partir de ' +
    'esta lista hay que volver a ejecutar la etapa de análisis (analyze): la lista podría pedir algo que los ' +
    'documentos actuales ya demuestran.',
  'requests.caveat.incomplete':
    'El análisis está incompleto (resultados evaluados: {assessed} de {total}). Un resultado que no se ha ' +
    'evaluado figura con cobertura "ninguna" sin que se haya examinado ningún documento para él; para ' +
    'completarlo hay que ejecutar la etapa de análisis (analyze).',
  'requests.scope.target.one':
    'Alcance: resultados aplicables que no cumplen su objetivo ({count}), en el mismo orden y con la misma ' +
    'numeración que remediation-plan.md',
  'requests.scope.target.other':
    'Alcance: resultados aplicables que no cumplen su objetivo ({count}), en el mismo orden y con la misma ' +
    'numeración que remediation-plan.md',
  'requests.notListed.target': 'No incluidos: con el objetivo alcanzado o superado ({met})',
  'requests.notListed.scopedOut': 'excluidos por no aplicables ({count})',
  'requests.scope.gaps.one':
    'Alcance: resultados cuya cobertura actual es ninguna o parcial ({count}), agrupados por Función; no hay un ' +
    'Perfil Objetivo definido',
  'requests.scope.gaps.other':
    'Alcance: resultados cuya cobertura actual es ninguna o parcial ({count}), agrupados por Función; no hay un ' +
    'Perfil Objetivo definido',
  'requests.notListed.gaps': 'No incluidos: con cobertura sustancial o completa ({count})',
  'requests.open': 'Solicitudes abiertas: {count}',
  'requests.open.byCoverage': 'cobertura actual: {distribution}',
  'requests.heading.requests': 'Solicitudes de evidencia',
  'requests.none.target': '_No hay solicitudes de evidencia abiertas: todos los resultados aplicables cumplen su objetivo._',
  'requests.none.gaps':
    '_No hay solicitudes de evidencia abiertas: todos los resultados tienen cobertura sustancial o completa._',
  'requests.item.coverage': 'Cobertura actual: {coverage}',
  'requests.item.coverage.withTarget': '{coverage}; objetivo: {target}; prioridad: {priority}',
  'requests.item.reviewStatus': 'Estado de revisión: {status}',
  'requests.item.quotedDocuments': 'Documentos ya citados: {documents}',
  'requests.item.questions': 'Preguntas para plantear:',
  'requests.question.1': '¿Se logra hoy este resultado y quién es responsable de él?',
  'requests.question.2': '¿Dónde está documentado y cuándo se revisó esa documentación por última vez?',
  'requests.question.3': '¿Qué registros muestran que funciona en la práctica (y no solo que es obligatorio)?',
  'requests.item.examples':
    'Evidencia que podría demostrarlo: documentos o registros que muestren en funcionamiento prácticas como ' +
    'estas (Ejemplos de implementación del CSF 2.0 del NIST, textuales y en inglés; ilustrativos, no ' +
    'exhaustivos, no una línea de base obligatoria):',
  'requests.item.noExamples':
    'Evidencia que podría demostrarlo: (esta exportación del CSF Core no incluye Ejemplos de implementación)',
  'requests.footer.target':
    'Un elemento sale de esta lista cuando una evaluación posterior demuestra el resultado con el nivel de ' +
    'cobertura requerido, mediante citas verificadas, o cuando el Perfil Objetivo reduce su objetivo o lo ' +
    'excluye del alcance. Los elementos marcados como SIN REVISAR o REVISIÓN DESACTUALIZADA aún requieren ' +
    'validación humana.',
  'requests.footer.gaps':
    'Un elemento sale de esta lista cuando una evaluación posterior demuestra el resultado con el nivel de ' +
    'cobertura requerido, mediante citas verificadas. Los elementos marcados como SIN REVISAR o REVISIÓN ' +
    'DESACTUALIZADA aún requieren validación humana.',

  /* -------------------------------- crosswalk.md ---------------------------- */
  'crosswalk.title': 'CSF 2.0 del NIST — Relaciones con otros marcos (Referencias informativas)',
  'crosswalk.howToRead.title': '**Cómo leer este informe**',
  'crosswalk.howToRead.related':
    '**Relacionado no significa equivalente.** Un mapeo registra que un resultado del CSF 2.0 y una referencia ' +
    'de otro marco están relacionados. No afirma que lograr uno satisfaga el otro.',
  'crosswalk.howToRead.coverage':
    '**La cobertura se refiere solo al resultado del CSF.** La cobertura que aparece junto a un resultado es la ' +
    'que esta evaluación le asignó. No constituye una determinación de conformidad con el control o requisito ' +
    'referenciado, y este informe no mide la conformidad con ningún otro marco.',
  'crosswalk.howToRead.levels':
    '**Tres tipos de relación.** Un mapeo relaciona una referencia con un resultado del CSF (una Subcategoría), ' +
    'con una Categoría entera o con una Función entera. Cada mapeo que sigue presenta el primer tipo en una ' +
    'tabla y los otros dos en una segunda tabla. Para una Categoría o Función entera, el informe muestra cómo se ' +
    'distribuyen por nivel de cobertura los resultados que contiene; no elige uno, porque el mapeo tampoco lo ' +
    'hace.',
  'crosswalk.howToRead.identifiers':
    '**Solo identificadores.** Aquí no se reproduce ningún texto de controles o requisitos de los marcos ' +
    'referenciados. Para saber qué significa un identificador hay que consultar la publicación de cada marco.',
  'crosswalk.howToRead.who':
    '**Quién elaboró cada mapeo.** Los mapeos proceden de: {source}. Cada uno fue elaborado por la entidad ' +
    'que allí figura como su autor, no por este proyecto, que no añade mapeos propios. Su inclusión aquí no ' +
    'supone un respaldo del NIST ni de este proyecto.',
  'crosswalk.draft':
    '**BORRADOR — revisión incompleta.** Elementos de la evaluación sin revisar: {unreviewed}; con revisión ' +
    'desactualizada: {stale}. Los que aparezcan más abajo están marcados. Una persona debe validar cada elemento ' +
    'antes de que pueda confiarse en estos valores de cobertura.',
  'crosswalk.overview.mappingSource': 'Fuente de los mapeos: {source}; fecha de obtención de los datos: {date}',
  'crosswalk.overview.catalog': 'Catálogo en el que figuran cada mapeo y su autor: {url}',
  'crosswalk.overview.coverage':
    'Cobertura: tomada del Perfil Actual (current-profile.json); revisados {reviewed}, sin revisar {unreviewed}, ' +
    'con revisión desactualizada {stale}',
  'crosswalk.overview.included': 'Mapeos incluidos: {count}',
  'crosswalk.table.overview.header':
    '| Mapeo | Marco | Autor del mapeo | Publicación | Referencias | Subcategorías relacionadas |',
  'crosswalk.ofTotal': '{count} de {total}',
  'crosswalk.thirdParty.label': 'mapeo de terceros',
  'crosswalk.thirdParty.line':
    '**Mapeo de terceros: no lo elaboró quien publica el marco.** Se reproduce tal como se publicó, incluidas ' +
    'las entradas que sean poco específicas o parezcan errores.',
  'crosswalk.item.id': 'Identificador del mapeo: {id}',
  'crosswalk.item.mapping': 'Mapeo: {name}, versión {version}, fecha de publicación: {date}',
  'crosswalk.item.developer': 'Autor del mapeo (según figura en la fuente de los mapeos): {developer}',
  'crosswalk.item.catalog': 'Catálogo en el que figuran este mapeo y su autor: {url}',
  'crosswalk.item.document': 'Documento del mapeo (alojado por el NIST): {url}',
  'crosswalk.item.relationships':
    'Relaciones registradas para: {subcategories} de {totalSubcategories} Subcategorías, ' +
    '{categories} de {totalCategories} Categorías, {functions} de {totalFunctions} Funciones',
  'crosswalk.item.notShown':
    'No se muestran: este mapeo abarca además elementos que no forman parte de esta evaluación ' +
    '(Subcategorías: {subcategories}; Categorías o Funciones: {groups}).',
  'crosswalk.noReferences':
    '_Este mapeo no tiene ninguna referencia relacionada con los resultados del CSF incluidos en esta ' +
    'evaluación._',
  'crosswalk.counts.intro':
    'Los recuentos siguientes describen los resultados del CSF relacionados con cada referencia; una referencia ' +
    'relacionada con una Categoría o Función entera está relacionada con todos los resultados que esta contiene. ' +
    'Describen esos resultados: no indican si una referencia se satisface ni miden la conformidad con ' +
    '{framework}.',
  'crosswalk.counts.listed': 'Referencias enumeradas: {count}',
  'crosswalk.counts.withGap':
    'Referencias con al menos un resultado relacionado cuya cobertura es ninguna o parcial: {count}',
  'crosswalk.counts.pending':
    'Referencias con al menos un resultado relacionado aún sin revisar o con revisión desactualizada: {count}',
  'crosswalk.table.outcomes.title': '**Referencias relacionadas con resultados individuales (Subcategorías)**',
  'crosswalk.table.outcomes.header': '| Referencia | Resultados del CSF 2.0 relacionados (cobertura) |',
  'crosswalk.related.alsoGroup':
    '{outcomes}; también relacionada con una Categoría o Función entera (tabla siguiente)',
  'crosswalk.table.groups.title': '**Referencias relacionadas con una Categoría o Función entera**',
  'crosswalk.table.groups.intro':
    'El mapeo relaciona cada una de estas referencias con la Categoría o Función en su conjunto, no con un ' +
    'resultado concreto de ella. La última columna cuenta, por cobertura, los resultados que contiene.',
  'crosswalk.table.groups.header': '| Referencia | Categoría o Función relacionada | Resultados que contiene, por cobertura |',
  'crosswalk.group.category': 'Categoría: {name}',
  'crosswalk.group.function': 'Función: {name}',
  'crosswalk.distribution.one': '{count} resultado: {distribution}',
  'crosswalk.distribution.other': '{count} resultados: {distribution}',
  'crosswalk.pending.unreviewed': '{count} sin revisar',
  'crosswalk.pending.stale': '{count} con revisión desactualizada',
  'crosswalk.footer':
    'Los valores de cobertura proceden de la evaluación; gap-analysis.md y current-profile.json contienen la ' +
    'evidencia, el fundamento y el registro de revisión de cada uno. Los elementos marcados como SIN REVISAR o ' +
    'REVISIÓN DESACTUALIZADA aún requieren validación humana. Los identificadores de referencia proceden de los ' +
    'mapeos tal como se obtuvieron en la fecha indicada más arriba; esta herramienta no añade mapeos propios.',

  /* ------------------------------ `ask` result ------------------------------ */
  'ask.title': 'Respuesta',
  'ask.question': 'Pregunta: {question}',
  'ask.answerLabel': 'Respuesta (resumen generado por IA; debe contrastarse con las citas siguientes):',
  'ask.quotesLabel': 'Citas verificadas ({count}):',
  'ask.verified.some':
    'Citas devueltas por el modelo: {checked}; verificadas palabra por palabra en los documentos incorporados: ' +
    '{verified}. El resto se eliminó.',
  'ask.verified.single':
    'La cita que devolvió el modelo se verificó palabra por palabra en los documentos incorporados.',
  'ask.verified.all':
    'Las {count} citas que devolvió el modelo se verificaron palabra por palabra en los documentos incorporados.',
  'ask.onlyQuotesVerified':
    'Solo las citas están verificadas. El resumen es la redacción del modelo y no está verificado.',
  'ask.search.none': 'El índice no devolvió ningún pasaje en el que buscar.',
  'ask.search.all.one': 'Se buscó en todo el índice ({count} pasaje).',
  'ask.search.all.other': 'Se buscó en todo el índice ({count} pasajes).',
  'ask.search.top':
    'Pasajes del índice examinados: {count} de {indexed}, por orden de relevancia (retrieval.topK = {topK}).',
  'ask.partialSearch':
    'Solo se leyeron esos pasajes, por lo que esto significa "no se encontró ahí", no "los documentos no contienen ' +
    'nada sobre esto".',
  'ask.withheld.noQuote': 'El modelo propuso una respuesta sin ninguna cita, por lo que la respuesta no se muestra.',
  'ask.withheld.oneQuote':
    'El modelo propuso una respuesta, pero su cita no pudo verificarse palabra por palabra, por lo que la ' +
    'respuesta no se muestra.',
  'ask.withheld.quotes':
    'El modelo propuso una respuesta, pero ninguna de sus {count} citas pudo verificarse palabra por palabra, por ' +
    'lo que la respuesta no se muestra.',
  'ask.invalidOutput':
    'El modelo no devolvió una respuesta utilizable, ni siquiera tras un reintento, por lo que no hubo ninguna ' +
    'respuesta que verificar.',

  /* ------------------------------ dashboard.html ---------------------------- */
  'dashboard.title': 'CSF 2.0 del NIST — Panel de la evaluación',
  'dashboard.noscript':
    'Este panel necesita JavaScript. Los mismos datos están en {profile}, {gap} y {evidence}, junto a este archivo.',
  'dashboard.notRecorded': 'Sin registro',
  'dashboard.dateUnavailable': 'Fecha no disponible',
  'dashboard.dateUnavailable.lower': 'fecha no disponible',
  'dashboard.time.aria': '{label}; marca de tiempo ISO {iso}',
  'dashboard.generated': 'Generado:',
  'dashboard.providers.embeddings': 'embeddings: {id}',
  'dashboard.providers.reasoning': 'razonamiento: {id}',
  'dashboard.theme.auto': 'Tema: automático',
  'dashboard.theme.light': 'Tema: claro',
  'dashboard.theme.dark': 'Tema: oscuro',
  'dashboard.draft.title': 'Borrador — revisión incompleta.',
  'dashboard.draft.text':
    'Elementos sin revisar: {unreviewed}; con revisión desactualizada: {stale}. Lo que genera la IA es una ' +
    'propuesta; una persona debe validar cada elemento antes de que este perfil pueda considerarse definitivo.',
  'dashboard.outOfScope': 'Fuera de alcance',

  'dashboard.activity.title': 'Actividad de la evaluación',
  'dashboard.activity.desc':
    'Etapas registradas en esta instantánea, que es un archivo independiente. Para reflejar el trabajo posterior ' +
    'hay que volver a generar el informe.',
  'dashboard.activity.ingested': 'Documentos incorporados',
  'dashboard.activity.documents.detail': 'leídos: {parsed} · omitidos: {skipped} · con error: {failed}',
  'dashboard.activity.documents.unavailable': 'Recuento de documentos no disponible',
  'dashboard.activity.analyzed': 'Cobertura analizada',
  'dashboard.activity.analysis.detail': 'resultados evaluados: {assessed} de {total}',
  'dashboard.activity.review': 'Revisión humana',
  'dashboard.activity.review.detail': 'vigentes: {current} · pendientes: {pending}',
  'dashboard.activity.review.none': 'Sin revisiones registradas',
  'dashboard.activity.target': 'Objetivo actualizado',
  'dashboard.activity.target.baseline': 'Objetivo predeterminado: {baseline}',
  'dashboard.activity.target.optional': 'Etapa opcional',
  'dashboard.activity.target.notConfigured': 'Sin configurar',
  'dashboard.activity.snapshot': 'Instantánea generada',
  'dashboard.activity.snapshot.detail': 'Informe autónomo, sin conexión',

  'dashboard.tile.addressed': 'Resultados cubiertos',
  'dashboard.tile.addressed.ctx': '{count} de {total} con cobertura sustancial o completa',
  'dashboard.tile.gaps': 'Brechas de cobertura',
  'dashboard.tile.gaps.ctx': 'ninguna {none} · parcial {partial}',
  'dashboard.tile.review': 'Avance de la revisión',
  'dashboard.tile.review.ctx': 'revisados: {reviewed} · sin revisar: {unreviewed} · desactualizados: {stale}',
  'dashboard.tile.overrides': 'Correcciones del revisor',
  'dashboard.tile.overrides.ctx': 'valoraciones de la IA modificadas por una revisión humana vigente',
  'dashboard.tile.downgrades': 'Rebajados por el verificador',
  'dashboard.tile.downgrades.ctx': 'afirmaciones descartadas por citas no verificables',
  'dashboard.tile.target': 'Objetivo cumplido',
  'dashboard.tile.target.ctx': 'resultados aplicables que cumplen su objetivo: {met} de {applicable}',
  'dashboard.tile.target.outOfScope': 'fuera de alcance: {count}',
  'dashboard.tile.tier': 'Nivel del CSF',
  'dashboard.tile.tier.both': 'Actual: {current} → objetivo: {target}',
  'dashboard.tile.tier.currentOnly': 'Actual: {current} · objetivo no registrado',
  'dashboard.tile.tier.targetOnly': 'Objetivo: {target} · actual no registrado',
  'dashboard.tile.tier.basis': 'seleccionado por la organización; esta herramienta no lo calcula',

  'dashboard.chart.viewTable': 'Ver como tabla',
  'dashboard.chart.viewChart': 'Ver como gráfico',
  'dashboard.col.function': 'Función',
  'dashboard.col.total': 'Total',
  'dashboard.col.pctAddressed': '% cubierto',
  'dashboard.col.applicable': 'Aplicables',
  'dashboard.col.met': 'Cumplidos',
  'dashboard.col.unmet': 'No cumplidos',
  'dashboard.col.pctMet': '% cumplido',
  'dashboard.col.id': 'ID',
  'dashboard.col.coverage': 'Cobertura',
  'dashboard.col.confidence': 'Confianza',
  'dashboard.col.review': 'Revisión',
  'dashboard.col.target': 'Objetivo',
  'dashboard.col.priority': 'Prioridad',
  'dashboard.col.evidence': 'Evidencia',

  'dashboard.coverage.title': 'Cobertura por Función',
  'dashboard.coverage.desc':
    'Distribución de los resultados evaluados ({count}) entre los cuatro niveles de cobertura.',
  'dashboard.coverage.aria': 'Barras apiladas: número de resultados por nivel de cobertura en cada Función del CSF',
  'dashboard.coverage.rowTotal': 'total: {total}',

  'dashboard.target.title': 'Cobertura actual frente al objetivo',
  'dashboard.target.desc':
    'Porcentaje de resultados aplicables que ya alcanzan o superan su objetivo (objetivo predeterminado: ' +
    '{baseline}).',
  'dashboard.target.aria':
    'Barras: porcentaje de resultados aplicables que cumplen su objetivo, por Función del CSF',
  'dashboard.target.rowAria':
    '{function}: el {pct}% de los resultados aplicables cumple su objetivo ({met} de {applicable})',
  'dashboard.target.rowAria.outOfScope':
    '{function}: el {pct}% de los resultados aplicables cumple su objetivo ({met} de {applicable}; fuera de ' +
    'alcance: {outOfScope})',
  'dashboard.target.atTarget': 'Cumplidos',
  'dashboard.target.unmet': 'No cumplidos',
  'dashboard.target.na': 'no aplicable',

  'dashboard.plan.title': 'Principales prioridades del plan de acción',
  'dashboard.plan.desc':
    'Objetivos no cumplidos mostrados: {shown} de {total}, en el orden del plan; el plan completo, con las ' +
    'acciones sugeridas del NIST, está en remediation-plan.md.',
  'dashboard.plan.priority.high': 'prioridad alta',
  'dashboard.plan.priority.medium': 'prioridad media',
  'dashboard.plan.priority.low': 'prioridad baja',
  'dashboard.plan.priorityOf': 'prioridad {priority}',

  'dashboard.docs.title': 'Evidencia por documento',
  'dashboard.docs.summary.reconstructed.one': '{count} documento visto en la evaluación (lista reconstruida)',
  'dashboard.docs.summary.reconstructed.other': '{count} documentos vistos en la evaluación (lista reconstruida)',
  'dashboard.docs.summary.ingested.one': '{count} documento incorporado',
  'dashboard.docs.summary.ingested.other': '{count} documentos incorporados',
  'dashboard.docs.summary.shared.one': '{files} archivos incorporados con {count} solo nombre',
  'dashboard.docs.summary.shared.other': '{files} archivos incorporados con {count} nombres distintos',
  'dashboard.docs.summary.quoted': 'citados al menos una vez: {count}',
  'dashboard.docs.summary.neverQuoted': 'nunca citados: {count}',
  'dashboard.docs.summary.unlisted': 'fuera del registro de incorporación: {count}',
  'dashboard.docs.summary.outcomes': 'resultados con al menos una cita verificada: {count} de {total}.',
  'dashboard.docs.summary.detail': 'El detalle por documento está en evidence-by-document.md.',
  'dashboard.docs.note': 'Nota. {note}',
  'dashboard.docs.footer':
    'Que un documento nunca se cite no significa que sea irrelevante: en esta evaluación no se seleccionó ningún ' +
    'pasaje suyo como evidencia textual de un resultado del CSF.',
  'dashboard.docs.col.document': 'Documento',
  'dashboard.docs.col.chunks': 'Fragmentos',
  'dashboard.docs.col.retrievedFor': 'Recuperado para',
  'dashboard.docs.col.quotedFor': 'Citado para',
  'dashboard.docs.col.quotes': 'Citas',
  'dashboard.docs.col.coverage': 'Cobertura de esos resultados',
  'dashboard.docs.col.functions': 'Funciones',
  'dashboard.docs.sharedName': '{files} archivos comparten este nombre',
  'dashboard.docs.unlisted': 'fuera del registro de incorporación',
  'dashboard.docs.showFirst': 'Mostrar los primeros {count}',
  'dashboard.docs.showAll': 'Mostrar los {count} documentos',

  'dashboard.explorer.title': 'Todas las Subcategorías',
  'dashboard.explorer.desc':
    'Todos los resultados evaluados, con su evidencia verificada. Al hacer clic en una fila se muestran el ' +
    'fundamento y las citas.',
  'dashboard.explorer.desc.target':
    'Todos los resultados evaluados, con su evidencia verificada. Al hacer clic en una fila se muestran el ' +
    'fundamento, las citas y las acciones sugeridas del NIST.',
  'dashboard.explorer.count': '{shown} de {total}',
  'dashboard.quick.label': 'Filtros rápidos',
  'dashboard.quick.aria': '{label}; resultados: {count}',
  'dashboard.quick.attention': 'Requiere atención',
  'dashboard.quick.gaps': 'Brechas de cobertura',
  'dashboard.quick.review': 'Revisión pendiente',
  'dashboard.quick.unmet': 'Objetivo no cumplido',
  'dashboard.search.placeholder': 'Buscar en resultados, fundamentos, notas, fuentes y citas…',
  'dashboard.search.aria': 'Buscar en Subcategorías y evidencia',
  'dashboard.filter.function': 'Función',
  'dashboard.filter.function.all': 'Todas las Funciones',
  'dashboard.filter.coverage': 'Cobertura',
  'dashboard.filter.coverage.all': 'Todos los niveles de cobertura',
  'dashboard.filter.coverage.gaps': 'Brechas (ninguna + parcial)',
  'dashboard.filter.review': 'Estado de revisión',
  'dashboard.filter.review.all': 'Todos los estados de revisión',
  'dashboard.filter.target': 'Situación frente al objetivo',
  'dashboard.filter.target.all': 'Cualquier situación frente al objetivo',
  'dashboard.filter.target.unmet': 'Objetivo no cumplido',
  'dashboard.filter.target.met': 'Objetivo alcanzado o superado',

  'dashboard.override.tag': 'revisor',
  'dashboard.override.title': 'Corrección del revisor: {from} → {to}',
  'dashboard.override.aria': 'Corrección del revisor: la cobertura pasa de {from} a {to}',
  'dashboard.detail.override':
    'Corrección del revisor: la IA propuso cobertura "{ai}"; el revisor estableció cobertura "{human}".',
  'dashboard.detail.override.by':
    'Corrección del revisor: la IA propuso cobertura "{ai}"; el revisor estableció cobertura "{human}" ' +
    '({reviewer}).',
  'dashboard.detail.reviewerNote': 'Nota del revisor: {note}',
  'dashboard.detail.targetNote': 'Nota sobre el objetivo: {note}',
  'dashboard.detail.evidence': 'Evidencia verificada ({count})',
  'dashboard.detail.none': '(ninguna)',
  'dashboard.detail.examples': 'Ejemplos de implementación del NIST (acciones sugeridas)',
  'dashboard.detail.references': 'Referencias relacionadas (informativas)',
  'dashboard.detail.references.desc':
    'Identificadores que los mapeos seleccionados relacionan con este resultado. Relacionado no significa ' +
    'equivalente: la cobertura de este resultado no constituye una determinación de conformidad con ninguno de ellos.',
  'dashboard.detail.references.none':
    '(los mapeos seleccionados no registran ninguna para este resultado en particular)',
  'dashboard.detail.references.whole':
    'Relacionadas con su Categoría o Función en conjunto, no con este resultado en particular:',
  'dashboard.xref.category': 'Categoría {id}',
  'dashboard.xref.function': 'Función {id}',

  'dashboard.footer.target':
    'Perfil Objetivo: objetivo predeterminado "{baseline}". Los objetivos, las prioridades y el alcance son ' +
    'decisiones humanas; las acciones sugeridas son los Ejemplos de implementación oficiales del CSF 2.0 del ' +
    'NIST (dominio público).',
  'dashboard.footer.target.described':
    'Perfil Objetivo: objetivo predeterminado "{baseline}" — {description}. Los objetivos, las prioridades y el ' +
    'alcance son decisiones humanas; las acciones sugeridas son los Ejemplos de implementación oficiales del CSF ' +
    '2.0 del NIST (dominio público).',
  'dashboard.footer.crosswalk':
    'Referencias relacionadas: solo identificadores, tal como cada mapeo seleccionado los registra para una ' +
    'Subcategoría, una Categoría entera o una Función entera. Fuente de los mapeos: {source} (fecha de obtención ' +
    'de los datos: {retrievedAt}). Un mapeo registra una relación, no una equivalencia ni una conformidad. La ' +
    'búsqueda también encuentra estos identificadores, tratados como simple texto; véase crosswalk.md para más ' +
    'detalles.',
  'dashboard.footer.generated':
    'Informe autónomo generado por {tool}; esta página no necesita ni utiliza acceso a la red.',
};
