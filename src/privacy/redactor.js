/**
 * REDACTOR — pattern-based pseudonymization of identifiers in outbound text.
 *
 * WHAT: before text is sent to a provider that is not on this machine, the
 * identifiers in it (e-mail addresses, URLs, IP and MAC addresses, host names,
 * and the literal terms the user listed) are replaced with placeholders such as
 * [[EMAIL_1]]; when the provider replies, the placeholders are replaced with
 * the originals again, locally. This module is the pure part of that: text in,
 * text out, no I/O. The provider decorators (redactingProviders.js) decide
 * where it is applied.
 *
 * WHAT IT IS NOT: anonymization. Only what matches a pattern below or a listed
 * term is replaced. Personal and company names (unless listed), postal
 * addresses, phone and account numbers, secrets, and all the surrounding prose
 * pass through unchanged.
 *
 * WHY it is built this way:
 *  - Placeholders are numbered in order of first appearance within one call.
 *    The same input therefore always produces the same output, and a
 *    placeholder says nothing about the value behind it (no hash of it).
 *  - Each distinct original string — exact, case-sensitive — has its own
 *    placeholder, so restoring is exact: restore(redact(x)) === x. That is what
 *    keeps the verbatim guarantee intact: a quote the model returns with
 *    placeholders is restored to the document's own characters and only then
 *    checked, by the unchanged verifier, against the original chunks.
 *  - Text that already looks like a placeholder is itself replaced. After
 *    redaction, every placeholder-shaped token in the text is one issued here,
 *    so restoring can never mistake document text for a placeholder.
 *  - Overlapping matches are merged, not arbitrated: every character that any
 *    detector claims is replaced. Preferring one match and dropping the other
 *    could leave the tail of the dropped one in the clear.
 *  - Detectors err toward replacing. A four-part section number looks like an
 *    IPv4 address and "end.The" (a missing space) like a host name. Replacing
 *    them never changes what is delivered, because the text is restored
 *    exactly; the price is that the model and the embedder do not see those
 *    words. The exceptions are deliberate and listed where they are made
 *    (document file names, CSF Category identifiers, a conservative IPv6
 *    pattern).
 *  - A listed term is matched more loosely than the quote verifier treats text
 *    as "trivially different" (verifier.js: letter case, whitespace layout,
 *    typographic quotes and dashes, Unicode composition), never more strictly:
 *    a name broken across two lines, hyphenated at a line end, typed with a
 *    curly apostrophe or joined into a file name is still the name.
 *  - JSON-aware. The tool itself puts JSON into a prompt (the critique pass
 *    re-sends the first-pass assessment), and documents contain JSON too. JSON
 *    escaping changes what surrounds a value: a line break becomes the two
 *    characters \n, which puts a letter in front of whatever follows. Two
 *    measures: (1) no detector lets an escape hide a value — left boundaries
 *    accept "preceded by an escape", and terms accept the escaped spellings;
 *    (2) redactPrompt() redacts a line that is itself a JSON object value by
 *    value, in decoded form, so a value there gets the same placeholder as in
 *    the surrounding text and the model sees one consistent picture.
 *
 * ONE THING THIS MODULE CANNOT DO: recognize a value it is shown only part of.
 * Text must reach it with its identifiers whole, which is why `ingest` keeps
 * them whole when it cuts documents into chunks (see detect() and
 * ingest/chunker.js).
 */

/** Placeholder types. The order labels a span that several detectors claim. */
export const PLACEHOLDER_TYPES = Object.freeze(['TOKEN', 'TERM', 'EMAIL', 'URL', 'IP', 'MAC', 'HOST']);

// A dotted token ending in one of these is a file name, not a host: leaving it
// alone keeps file names in prose — and the source_file labels the model must
// echo — readable. The cost: a host whose last label is one of these (a ".md"
// domain written without a scheme, say) is not replaced.
const DOCUMENT_EXTENSIONS = new Set(['pdf', 'docx', 'doc', 'md', 'txt', 'csv', 'json', 'html', 'xlsx', 'pptx', 'png', 'jpg']);

// "PR.AA", "GV.OC": the form of a CSF 2.0 Category identifier. Every assessment
// prompt carries one, and it must reach the model as written.
const CSF_CATEGORY_ID = /^[A-Z]{2}\.[A-Z]{2}$/;

// Characters that take no space and that word processors put INSIDE words:
// soft hyphen, zero-width space / non-joiner / joiner, word joiner, BOM.
const INVISIBLE = String.raw`\u{ad}\u{200b}-\u{200d}\u{2060}\u{feff}`;
const INVISIBLE_RE = new RegExp(`[${INVISIBLE}]`, 'gu');
// Hyphen-minus, hyphen and non-breaking hyphen (what a .docx yields for a
// hyphen that must not wrap); DASHES adds the en and em dash.
const HYPHENS = String.raw`\-\u{2010}\u{2011}`;
const DASHES = String.raw`${HYPHENS}\u{2013}\u{2014}`;

// What a host-name label and the local part of an e-mail address are made of.
// Deliberately generous (combining marks, the hyphen variants, the invisible
// characters): a character left out here would split a value and leave one
// half of it in the clear.
const LABEL = String.raw`\p{L}\p{M}\p{N}_${HYPHENS}${INVISIBLE}`;
const LOCAL = String.raw`\p{L}\p{M}\p{N}._%+'!#$&*/=?^{|}~${HYPHENS}${INVISIBLE}`;

// In JSON text a value can directly follow an escape (\n, \t, \u0011 ...), whose
// last character is a letter or digit. A left boundary that forbids letters or
// digits must therefore also accept "preceded by an escape", or the value would
// be missed there. Accepting it in ordinary text only ever replaces more.
const AFTER_JSON_ESCAPE = String.raw`(?<=\\[bfnrt]|\\u[0-9A-Fa-f]{4})`;
const notAfter = (characterClass) => `(?:(?<![${characterClass}])|${AFTER_JSON_ESCAPE})`;

// [[TYPE_N]], tolerating the harmless ways a model may echo it: letter case and
// spaces inside the brackets or around the underscore. The SAME pattern defines
// "placeholder-shaped document text" and "what restore recognizes", so the two
// can never disagree.
const PLACEHOLDER_SOURCE = String.raw`\[\[[ \t]*([A-Za-z]{1,16})[ \t]*_[ \t]*([0-9]{1,12})[ \t]*\]\]`;
const placeholderRegex = () => new RegExp(PLACEHOLDER_SOURCE, 'gu');

// The lookbehind anchors each attempt at the start of a run of address
// characters. It changes nothing about what is matched (a match always starts
// there) but keeps the scan linear on long unbroken text. "%40" is "@" as a
// mailto: link writes it.
const EMAIL_RE = new RegExp(
  String.raw`(?<![${LOCAL}])[${LOCAL}]+(?:@|%40)(?:[${LABEL}]+(?:\.[${LABEL}]+)*|\[[0-9A-Fa-f:.]+\])`,
  'gu',
);

// Any scheme://... (http, https, ftp, but also ldap, smb, ssh and the like) and
// bare www. addresses. A URL ends at whitespace, a quote, an angle bracket, a
// backtick or a backslash — the last so that a JSON escape after it stays out,
// except for "\/", which is how some JSON writers spell a slash.
const URL_CHARACTERS = String.raw`(?:[^\s<>"\\\x60\x00-\x1f\x7f]|\\\/)+`;
const URL_RE = new RegExp(String.raw`(?:([A-Za-z][A-Za-z0-9+.-]{0,31}:(?:\\?\/){2})|[Ww]{3}\.)${URL_CHARACTERS}`, 'gu');
// What may follow a host name or an address written without a scheme: an
// optional port, then a path, query or fragment. Sticky: tried at lastIndex only.
const URL_TAIL_RE = new RegExp(String.raw`(?::[0-9]{1,5})?(?=[/?#]|\\\/)${URL_CHARACTERS}`, 'yu');
const URL_TRAILING_PUNCTUATION = '.,;:!?*\'"’”»…';

// Not preceded by a digit or a dot — unless that dot does not itself follow a
// digit ("10.0.0.1...10.0.0.9", "host.10.0.0.5").
const IPV4_RE = new RegExp(
  String.raw`(?:(?<![0-9.])|(?<=(?<![0-9])\.)|${AFTER_JSON_ESCAPE})([0-9]{1,3}(?:\.[0-9]{1,3}){3})(\/[0-9]{1,2})?(?![0-9])(?!\.[0-9])`,
  'gu',
);

// IPv6, conservatively: the full eight-group form, or a form compressed with
// "::". Colon-separated numbers without "::" (times, ratios, verse numbers) are
// never touched, and identifier boundaries keep scope operators such as
// "std::string" out. A colon may follow the address ("fe80::1: the gateway",
// "fe80::1:domain") as long as no further group of the address follows it.
// validIpv6() adds two more checks.
const HEX = '[0-9A-Fa-f]';
const HEX_GROUP = `${HEX}{1,4}`;
const IPV6_RE = new RegExp(
  `${notAfter('A-Za-z0-9')}(?:(?:${HEX_GROUP}:){7}${HEX_GROUP}|(?:${HEX_GROUP}(?::${HEX_GROUP}){0,6})?::(?:${HEX_GROUP}(?::${HEX_GROUP}){0,6})?)` +
    String.raw`(?:\/[0-9]{1,3})?(?![A-Za-z0-9])(?!:(?:${HEX_GROUP}(?![A-Za-z0-9])|:))`,
  'gu',
);

// The spellings network equipment and operating systems print: six octets with
// one separator throughout (aa:bb:cc:dd:ee:ff, aa-bb-...), octets without their
// leading zero (0:1b:21:a:b:c), three groups of four (aabb.ccdd.eeff,
// aabb-ccdd-eeff), and two groups of six (aabbcc-ddeeff). The last form must
// contain a letter: two six-digit numbers joined by a hyphen are far more often
// a date range than an address.
const MAC_RE = new RegExp(
  String.raw`${notAfter('0-9A-Fa-f')}(?:${HEX}{2}([:-])(?:${HEX}{2}\1){4}${HEX}{2}|${HEX}{1,2}(?::${HEX}{1,2}){5}|${HEX}{4}([.-])${HEX}{4}\2${HEX}{4}|(?=[0-9A-Fa-f-]{0,12}[A-Fa-f])${HEX}{6}-${HEX}{6})(?![0-9A-Fa-f])`,
  'gu',
);

// A maximal run of dot-separated labels. Whether it is a host name is decided
// in hostSpan(); the regex only finds the candidates, in linear time.
const DOTTED_TOKEN_RE = new RegExp(String.raw`(?<![${LABEL}])[${LABEL}]+(?:\.[${LABEL}]+)+`, 'gu');
// A label a host name can end in: letters only, or a punycode top-level domain.
const TOP_LEVEL_LABEL = /^(?:\p{L}{2,63}|xn--[a-z0-9-]{1,59})$/iu;
// The same, as the first part of a compound ("example.com-hosted", "ACME.COM_HOST").
const TOP_LEVEL_PREFIX = new RegExp(String.raw`^(\p{L}{2,63})[_${HYPHENS}]`, 'u');
const HOST_EDGE_RE = new RegExp(String.raw`^[.${HYPHENS}${INVISIBLE}]+|[.${HYPHENS}${INVISIBLE}]+$`, 'gu');

// A term is a sequence of WORDS. What separates two of them in the text may be
// any run of whitespace (also in its JSON-escaped spellings), of the characters
// names are joined with when they become identifiers (hyphen, dash, underscore,
// dot), of a quotation mark at the start of a quoted line — or nothing at all.
// "Blue Ridge" thus covers "Blue\nRidge", "blue-ridge", "blue_ridge" and
// "BlueRidge", which is how a name appears in file names and host names.
const TERM_SEPARATOR_CHARACTERS = String.raw`\s_.>${DASHES}${INVISIBLE}`;
const TERM_SEPARATOR = String.raw`(?:[${TERM_SEPARATOR_CHARACTERS}]|\\+[nrtf]|\\+u000[bB])*`;
// Inside a word the text may have an invisible character, or a hyphen followed
// by a line break or a space: a word hyphenated at the end of a line ("North-
// wind"; PDF extraction turns the line break into a space).
const TERM_IGNORABLE = String.raw`(?:[${INVISIBLE}]|[${HYPHENS}](?:\s|\\+[nrtf])+)*`;
const TERM_SPLIT_RE = new RegExp(`[${TERM_SEPARATOR_CHARACTERS}]+`, 'u');

/** Trim, drop empties and duplicates; a fixed order (longest first) keeps everything deterministic. */
function normalizeTerms(terms) {
  const cleaned = (Array.isArray(terms) ? terms : [])
    .filter((t) => typeof t === 'string')
    .map((t) => t.replace(INVISIBLE_RE, '').trim())
    .filter((t) => t.length > 0);
  return [...new Set(cleaned)].sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0));
}

const escapeRegExp = (text) => text.replace(/[$()*+.?[\]^{|}/\\]/gu, String.raw`\$&`);

/** How JSON writers that escape everything outside ASCII spell a character: é (any number of backslashes). */
function jsonEscapeSource(ch) {
  let source = '';
  for (let i = 0; i < ch.length; i++) source += String.raw`\\+u` + ch.charCodeAt(i).toString(16).padStart(4, '0');
  return source;
}

/**
 * Pattern source for one character of a term, tolerant of the spellings the
 * same character has in real text: typographic apostrophes and quotation
 * marks, a composed or a decomposed accent, and the JSON-escaped forms (a
 * backslash before a quote, doubled backslashes, \uXXXX).
 */
function termCharacterSource(ch) {
  if ("'‘’‛".includes(ch)) return "['‘’‛]";
  if ('"“”'.includes(ch)) return String.raw`\\*["“”]`;
  if (ch === '\\') return String.raw`\\+`;
  const spellings = [escapeRegExp(ch)];
  const decomposed = ch.normalize('NFD');
  if (decomposed !== ch) spellings.push(escapeRegExp(decomposed));
  if (ch.codePointAt(0) > 0x7e) spellings.push(jsonEscapeSource(ch));
  return spellings.length === 1 ? spellings[0] : `(?:${spellings.join('|')})`;
}

/** Pattern source for one term, or null if it has no word in it. */
function termSource(term) {
  const words = term.normalize('NFC').split(TERM_SPLIT_RE).filter((word) => word.length > 0);
  if (words.length === 0) return null;
  return words.map((word) => [...word].map(termCharacterSource).join(TERM_IGNORABLE)).join(TERM_SEPARATOR);
}

/**
 * Compile the terms, or return null when there are none.
 *
 * Two things an ordinary alternation scan would get wrong, each leaving part of
 * a listed term in the clear:
 *  - it reports one match and resumes AFTER it, skipping a term that begins
 *    inside that match. `anywhere` is therefore a lookahead: it stops at every
 *    position where some term starts.
 *  - at a position it takes the first alternative that fits, not the longest.
 *    `each` therefore holds one anchored regex per term, and the caller keeps
 *    the longest match among them.
 * No pattern has two repeated groups next to each other (every separator or
 * ignorable run is followed by a required character), so matching is linear.
 * @returns {{anywhere: RegExp, each: RegExp[]}|null}
 */
function compileTerms(terms) {
  const sources = [...new Set(terms.map(termSource).filter((source) => source !== null))];
  if (sources.length === 0) return null;
  return {
    anywhere: new RegExp(`(?=(?:${sources.join('|')}))`, 'giu'),
    each: sources.map((source) => new RegExp(source, 'yiu')), // sticky: matched at lastIndex only
  };
}

/** Length of the longest term match starting exactly at `index` (0 if none). */
function longestTermAt(text, index, termMatcher) {
  let longest = 0;
  for (const regex of termMatcher.each) {
    regex.lastIndex = index;
    const length = regex.exec(text)?.[0].length ?? 0;
    if (length > longest) longest = length;
  }
  return longest;
}

function count(text, ch) {
  let n = 0;
  for (let i = text.indexOf(ch); i !== -1; i = text.indexOf(ch, i + 1)) n++;
  return n;
}

/** Length of a URL match without the sentence punctuation that tends to follow one. */
function urlLength(url) {
  const openers = { ')': '(', ']': '[', '}': '{' };
  // Counted once and kept up to date while trimming, so a long tail of brackets costs one pass.
  const counts = Object.fromEntries([...'()[]{}'].map((ch) => [ch, count(url, ch)]));
  let end = url.length;
  while (end > 0) {
    const last = url[end - 1];
    if (URL_TRAILING_PUNCTUATION.includes(last)) {
      end--;
      continue;
    }
    // A closing bracket belongs to the URL only if it closes one opened inside it.
    const opener = openers[last];
    if (opener && counts[opener] < counts[last]) {
      counts[last]--;
      end--;
      continue;
    }
    break;
  }
  return end;
}

/** Length of the port/path/query that directly follows a host or address ending at `index` (0 if none). */
function urlTailLength(text, index) {
  URL_TAIL_RE.lastIndex = index;
  const tail = URL_TAIL_RE.exec(text);
  return tail ? urlLength(tail[0]) : 0;
}

/** Every octet 0–255. Anything else is a version or section number that only looks like an address. */
function validIpv4(address) {
  return address.split('.').every((octet) => Number(octet) <= 255);
}

/**
 * The two extra checks that keep the IPv6 pattern conservative: at most eight
 * groups in all, and at least one decimal digit — real addresses have one,
 * while "a::b" in source code does not.
 */
function validIpv6(match) {
  const address = match.split('/')[0];
  if (!/[0-9]/.test(address)) return false;
  return address.split(':').filter((group) => group.length > 0).length <= 8;
}

/**
 * Decide whether a dotted token is a host name and which part of it. A host
 * has at least two labels and ends in a top-level label; labels after that one
 * are left out ("db01.corp.example.2"), and so is the rest of a compound
 * ("corp.example-hosted"). Document file names and CSF Category identifiers
 * are not host names.
 * @returns {{start: number, end: number, whole: boolean}|null} offsets within
 *   the token; `whole` when the host name runs to the end of the token
 */
function hostSpan(token) {
  // A name does not begin or end with a hyphen or a dot; ignore decoration around it.
  const start = /^[^\p{L}\p{N}_]*/u.exec(token)[0].length;
  const body = token.slice(start).replace(HOST_EDGE_RE, '');
  const labels = body.split('.');

  let last = labels.length - 1;
  let topLevel = null;
  for (; last >= 1; last--) {
    const label = labels[last].replace(INVISIBLE_RE, '');
    if (TOP_LEVEL_LABEL.test(label)) {
      topLevel = labels[last];
      break;
    }
    const compound = TOP_LEVEL_PREFIX.exec(labels[last]);
    if (compound) {
      topLevel = compound[1];
      break;
    }
  }
  if (topLevel === null) return null;
  if (DOCUMENT_EXTENSIONS.has(topLevel.replace(INVISIBLE_RE, '').toLowerCase())) return null;

  const host = [...labels.slice(0, last), topLevel].join('.');
  if (CSF_CATEGORY_ID.test(host)) return null;
  const end = start + host.length;
  return { start, end, whole: end === token.length };
}

/** Raw candidate spans from every detector, unsorted and possibly overlapping. */
function candidates(text, termMatcher) {
  const spans = [];
  const add = (type, start, end) => {
    if (end > start) spans.push({ type, start, end });
  };

  for (const m of text.matchAll(placeholderRegex())) add('TOKEN', m.index, m.index + m[0].length);

  if (termMatcher) {
    for (const m of text.matchAll(termMatcher.anywhere)) add('TERM', m.index, m.index + longestTermAt(text, m.index, termMatcher));
  }

  for (const m of text.matchAll(EMAIL_RE)) {
    // Punctuation in front of the address (an opening quote, a stray dot) is not part of it.
    const lead = /^[^\p{L}\p{N}_]+/u.exec(m[0])?.[0].length ?? 0;
    if (!/^(?:@|%40)/.test(m[0].slice(lead))) add('EMAIL', m.index + lead, m.index + m[0].length);
  }

  for (const m of text.matchAll(URL_RE)) {
    const length = urlLength(m[0]);
    if (length > (m[1]?.length ?? 4)) add('URL', m.index, m.index + length); // more than the bare "scheme://" or "www."
  }

  for (const m of text.matchAll(IPV4_RE)) {
    if (!validIpv4(m[1])) continue;
    const end = m.index + m[1].length;
    const cidr = m[2] && Number(m[2].slice(1)) <= 32 ? m[2].length : 0;
    // An address directly followed by a path is a URL written without its scheme.
    const tail = cidr ? 0 : urlTailLength(text, end);
    add(tail ? 'URL' : 'IP', m.index, end + cidr + tail);
  }

  for (const m of text.matchAll(IPV6_RE)) {
    if (validIpv6(m[0])) add('IP', m.index, m.index + m[0].length);
  }

  for (const m of text.matchAll(MAC_RE)) add('MAC', m.index, m.index + m[0].length);

  // Dotted tokens inside a tail already taken with an earlier host are covered;
  // skipping them keeps a long unbroken run from being re-read for each one.
  let claimedUntil = 0;
  for (const m of text.matchAll(DOTTED_TOKEN_RE)) {
    if (m.index < claimedUntil) continue;
    const span = hostSpan(m[0]);
    if (!span) continue;
    const start = m.index + span.start;
    const end = m.index + span.end;
    // A host name directly followed by a path is a URL written without its
    // scheme: the port, path and query go with it.
    const tail = span.whole ? urlTailLength(text, end) : 0;
    add(tail ? 'URL' : 'HOST', start, end + tail);
    if (tail) claimedUntil = end + tail;
  }

  return spans;
}

/**
 * Find what would be replaced in a text: non-overlapping spans in text order.
 * Overlapping detections are merged into one span (labelled with the type of
 * its first, longest member), so every character any detector claims is
 * covered. Pure; this is the whole detection logic, exported for inspection,
 * for tests, and for `ingest`, which uses it to avoid cutting a chunk in the
 * middle of one of these spans.
 * @param {string} text
 * @param {{terms?: string[]}} [options]
 * @returns {Array<{type: string, start: number, end: number, value: string}>}
 */
export function detect(text, { terms = [] } = {}) {
  return detectWith(String(text ?? ''), compileTerms(normalizeTerms(terms)));
}

function detectWith(text, termMatcher) {
  const spans = candidates(text, termMatcher).sort(
    (a, b) => a.start - b.start || b.end - a.end || PLACEHOLDER_TYPES.indexOf(a.type) - PLACEHOLDER_TYPES.indexOf(b.type),
  );
  const merged = [];
  for (const span of spans) {
    const current = merged[merged.length - 1];
    if (current && span.start < current.end) current.end = Math.max(current.end, span.end);
    else merged.push({ ...span });
  }
  for (const span of merged) span.value = text.slice(span.start, span.end);
  return merged;
}

/**
 * Apply `fn` to every scalar of a parsed JSON value, in document order: to each
 * string (keys included) as it is, and to each number, boolean or null as its
 * JSON text. A non-string scalar is kept as it is unless `fn` changes its text,
 * in which case the changed text takes its place as a string.
 */
function mapScalars(value, fn) {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((item) => mapScalars(item, fn));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [fn(key), mapScalars(item, fn)]));
  }
  const text = JSON.stringify(value);
  const changed = fn(text);
  return changed === text ? value : changed;
}

/** Is this line, exactly as written, the JSON.stringify form of an object? */
function isCanonicalJsonObject(line) {
  if (line.length < 2 || line[0] !== '{' || line[line.length - 1] !== '}') return false;
  try {
    return JSON.stringify(JSON.parse(line)) === line;
  } catch {
    return false;
  }
}

function createSession(termMatcher) {
  const placeholderByOriginal = new Map(); // "admin@corp.example" -> "[[EMAIL_1]]"
  const originalByKey = new Map(); // "EMAIL_1" -> "admin@corp.example"

  const placeholderFor = (type, original) => {
    let placeholder = placeholderByOriginal.get(original);
    if (!placeholder) {
      const key = `${type}_${originalByKey.size + 1}`;
      placeholder = `[[${key}]]`;
      placeholderByOriginal.set(original, placeholder);
      originalByKey.set(key, original);
    }
    return placeholder;
  };

  const redact = (input) => {
    const text = String(input ?? '');
    let out = '';
    let position = 0;
    for (const span of detectWith(text, termMatcher)) {
      out += text.slice(position, span.start) + placeholderFor(span.type, span.value);
      position = span.end;
    }
    return out + text.slice(position);
  };

  /** The original behind a placeholder-shaped match, or undefined if it was not issued here. */
  const lookup = (type, digits) => originalByKey.get(`${type.toUpperCase()}_${digits.replace(/^0+(?=[0-9])/, '')}`);

  // A single pass: what is put back is never scanned again, so an original
  // that itself looks like a placeholder is restored as the literal it was.
  const restoreWith = (input, render) =>
    String(input ?? '').replace(placeholderRegex(), (match, type, digits) => {
      const original = lookup(type, digits);
      return original === undefined ? match : render(original);
    });

  // KNOWN LIMIT of the structured path: it is right when the model answers
  // with the JSON it was shown (the critique pass), and loses a quote when the
  // model quotes such a line of a DOCUMENT as text and a replaced value in it
  // needs JSON escaping — the restored quote is then escaped once where the
  // document has it escaped twice. The quote fails verification and is dropped.
  const redactJsonLine = (line) => {
    try {
      const structured = JSON.stringify(mapScalars(JSON.parse(line), redact));
      // Every scalar has been redacted on its own. The one thing that could
      // still be there is a listed term that only exists ACROSS scalars (it
      // would have to contain JSON punctuation). If so, give up on the
      // structure and redact the line as ordinary text, which sees it.
      // Placeholders are blanked for this check: a term that happens to equal
      // a type name ("IP") must not be found inside them.
      if (!termMatcher || structured.replace(placeholderRegex(), '\x00').search(termMatcher.anywhere) === -1) return structured;
    } catch {
      // Pathologically deep nesting: fall through to the plain path.
    }
    return redact(line);
  };

  return {
    /**
     * Replace every detected identifier in a text. Exactly invertible:
     * restore(redact(x)) === x for any string x.
     * @param {string} text
     * @returns {string}
     */
    redact,

    /**
     * Redact a prompt. Like redact(), except that a line which is itself the
     * JSON.stringify form of an object is redacted value by value, in decoded
     * form (see the module comment). Plain text between such lines is redacted
     * as one piece, so a term broken across lines is still matched.
     * @param {string} text
     * @returns {string}
     */
    redactPrompt(text) {
      const lines = String(text ?? '').split('\n');
      const isJson = lines.map(isCanonicalJsonObject);
      if (!isJson.includes(true)) return redact(text);
      const out = [];
      let plain = [];
      const flush = () => {
        if (plain.length > 0) out.push(redact(plain.join('\n')));
        plain = [];
      };
      lines.forEach((line, i) => {
        if (isJson[i]) {
          flush(); // first, so placeholders stay numbered in text order
          out.push(redactJsonLine(line));
        } else {
          plain.push(line);
        }
      });
      flush();
      return out.join('\n');
    },

    /**
     * Put the originals back. A placeholder this session did not issue is left
     * as it is.
     * @param {string} text
     * @returns {string}
     */
    restore: (text) => restoreWith(text, (original) => original),

    /**
     * Put the originals back into JSON TEXT: each original is inserted in its
     * JSON-string-escaped form, so one containing a quote, a backslash or a line
     * break cannot break the reply it is restored into.
     * @param {string} text a provider's raw reply
     * @returns {string}
     */
    restoreJson: (text) => restoreWith(text, (original) => JSON.stringify(original).slice(1, -1)),

    /** Number of distinct values replaced so far in this session. */
    get size() {
      return originalByKey.size;
    },

    /** The placeholders issued so far, in order: [["[[EMAIL_1]]", "admin@corp.example"], ...]. */
    entries: () => [...originalByKey].map(([key, original]) => [`[[${key}]]`, original]),
  };
}

/**
 * Compile a redactor for a list of literal terms.
 *
 * A SESSION holds one placeholder map and corresponds to one outbound call:
 * the same value gets the same placeholder across everything redacted in the
 * session (system prompt and user prompt of one request), and the reply to that
 * request is restored with the same session. Nothing is shared between
 * sessions, so numbering restarts with each call.
 *
 * @param {{terms?: string[]}} [options] literal terms to replace wherever they
 *   appear (matched case-insensitively, anywhere — also inside longer words)
 * @returns {{terms: string[], session: () => object}}
 */
export function createRedactor({ terms = [] } = {}) {
  const cleanTerms = normalizeTerms(terms);
  const termMatcher = compileTerms(cleanTerms);
  return {
    /** The terms in effect, cleaned and ordered. */
    terms: cleanTerms,
    session: () => createSession(termMatcher),
  };
}
