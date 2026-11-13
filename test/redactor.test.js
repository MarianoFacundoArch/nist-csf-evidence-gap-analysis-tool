import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRedactor, detect, PLACEHOLDER_TYPES } from '../src/privacy/redactor.js';
import { SYSTEM_PROMPT, buildTaskPrompt, buildCritiquePrompt } from '../src/prompts/templates.js';
import { ASK_SYSTEM_PROMPT, buildAskPrompt } from '../src/prompts/askTemplates.js';
import { loadCsfCore } from '../src/csf/loader.js';

const TERMS = ['Northwind Analytics', "O'Brien & Sons", 'CORP\\jsmith', 'Acme "Rocket" Corp', 'Café Zürich', 'Project Nightingale'];

const session = (terms = TERMS) => createRedactor({ terms }).session();
const found = (text, terms = []) => detect(text, { terms }).map((s) => `${s.type}:${s.value}`);
const jsonForm = (s) => JSON.stringify(s).slice(1, -1);
const PLACEHOLDER = /\[\[[ \t]*[A-Za-z]{1,16}[ \t]*_[ \t]*[0-9]{1,12}[ \t]*\]\]/gu;

// Deterministic pseudo-random numbers, so the generated cases never change.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Values the redactor must replace, in the forms documents write them.
const SENSITIVE = [
  // e-mail
  'admin@northwind.example', 'Jane.Doe+ops@mail.corp.example', 'first_last@sub.domain.co.uk', 'josé@correo.example',
  'root@localhost', "o'brien@corp.example", 'ops@[10.9.8.7]',
  // URL
  'https://intranet.corp.example/wiki/IR?id=7&x=y#top', 'http://10.1.2.3:8080/admin', 'ftp://files.corp.example/pub',
  'www.corp.example/login', 'ldaps://dc01.corp.example:636', 'HTTPS://Portal.Corp.Example/A_(b)', 'portal.corp.example/wiki/Runbook',
  // IPv4
  '10.0.0.5', '192.168.1.0/24', '172.16.254.1', '8.8.8.8', '010.001.002.003',
  // IPv6
  '2001:db8::8a2e:370:7334', 'fe80::1', '2001:0db8:85a3:0000:0000:8a2e:0370:7334', '::ffff:192.0.2.1', '2001:DB8::/32',
  // MAC
  '00:1A:2B:3C:4D:5E', '00-1a-2b-3c-4d-5e', '0011.2233.4455',
  // host names
  'db01.corp.example', 'mail.northwind-analytics.io', 'DC01.CORP.LOCAL', 'bücher.example', 'srv_01.internal.lan',
  // listed terms, in the variants a document may contain
  'Northwind Analytics', 'northwind  analytics', 'NORTHWIND\nANALYTICS', 'O’Brien & Sons', 'CORP\\jsmith',
  'Acme "Rocket" Corp', 'Acme “Rocket” Corp', 'Café Zürich', 'Café Zürich'.normalize('NFD'), 'project nightingale',
];

// Text that must come through untouched.
const NEUTRAL = [
  'the', 'policy', 'requires', 'approval', 'by', 'owner', 'reviewed', 'quarterly', 'report.pdf', 'notes.md', 'PR.AA',
  'ID.AM-01', 'section', '12:30:45', '1:2:3', 'std::string', 'v1.2.3', 'e.g.', 'i.e.', '(see', 'below)', '—', '“quoted”',
  '日本語のテキスト', '😀', 'naïve', '3.14', '100%', '[CHUNK', '1]', 'a::b', 'x',
];

const SEPARATORS = [' ', ' ', ' ', '\n', '\t', ', ', '; ', ' (', ') ', ': ', ' - ', '\n\n', ' "', '" ', " '", "' ", ' <', '> ', ' | ', '. ', ' = '];

function compose(rand, pieces) {
  const used = [];
  let text = '';
  for (let i = 0; i < pieces; i++) {
    const sensitive = rand() < 0.45;
    const pool = sensitive ? SENSITIVE : NEUTRAL;
    const piece = pool[Math.floor(rand() * pool.length)];
    if (sensitive) used.push(piece);
    text += piece + SEPARATORS[Math.floor(rand() * SEPARATORS.length)];
  }
  return { text, used };
}

/* ------------------------------ what is found ------------------------------ */

test('every documented identifier pattern is detected', () => {
  const cases = [
    ['mail admin@northwind.example today', ['EMAIL:admin@northwind.example']],
    ['<Jane.Doe+ops@mail.corp.example>', ['EMAIL:Jane.Doe+ops@mail.corp.example']],
    ["write to 'bob@corp.example'.", ['EMAIL:bob@corp.example']],
    ['ssh root@bastion01 now', ['EMAIL:root@bastion01']],
    ['ops@[10.9.8.7] is the relay', ['EMAIL:ops@[10.9.8.7]']],
    ['see https://intranet.corp.example/wiki/IR?id=7#top.', ['URL:https://intranet.corp.example/wiki/IR?id=7#top']],
    ['(http://10.1.2.3:8080/admin)', ['URL:http://10.1.2.3:8080/admin']],
    ['ftp://files.corp.example/pub, then', ['URL:ftp://files.corp.example/pub']],
    ['open www.corp.example/login!', ['URL:www.corp.example/login']],
    ['bind ldaps://dc01.corp.example:636 first', ['URL:ldaps://dc01.corp.example:636']],
    ['[wiki](https://corp.example/a_(b))', ['URL:https://corp.example/a_(b)']],
    ['see portal.corp.example/wiki/Runbook, then', ['URL:portal.corp.example/wiki/Runbook']],
    ['gateway 10.0.0.5.', ['IP:10.0.0.5']],
    ['subnet 192.168.1.0/24 and 10.0.0.1-10.0.0.9', ['IP:192.168.1.0/24', 'IP:10.0.0.1', 'IP:10.0.0.9']],
    ['mask 10.0.0.0/255.255.255.0', ['URL:10.0.0.0/255.255.255.0']],
    ['v6 2001:db8::8a2e:370:7334, fe80::1%eth0', ['IP:2001:db8::8a2e:370:7334', 'IP:fe80::1']],
    ['full 2001:0db8:85a3:0000:0000:8a2e:0370:7334: ok', ['IP:2001:0db8:85a3:0000:0000:8a2e:0370:7334']],
    ['[2001:db8::1]:443 and ::ffff:192.0.2.1 and 2001:DB8::/32', ['IP:2001:db8::1', 'IP:::ffff:192.0.2.1', 'IP:2001:DB8::/32']],
    ['nic 00:1A:2B:3C:4D:5E / 00-1a-2b-3c-4d-5e / 0011.2233.4455', ['MAC:00:1A:2B:3C:4D:5E', 'MAC:00-1a-2b-3c-4d-5e', 'MAC:0011.2233.4455']],
    ['host db01.corp.example.', ['HOST:db01.corp.example']],
    ['*.corp.example and DC01.CORP.LOCAL', ['HOST:corp.example', 'HOST:DC01.CORP.LOCAL']],
    ['bücher.example, srv_01.internal.lan', ['HOST:bücher.example', 'HOST:srv_01.internal.lan']],
    ['\\\\fs01.corp.example\\share', ['HOST:fs01.corp.example']],
  ];
  for (const [text, expected] of cases) assert.deepEqual(found(text), expected, text);
});

test('listed terms are matched literally: any case, anywhere, across line breaks, with typographic variants', () => {
  assert.deepEqual(found('NORTHWIND ANALYTICS and northwind analytics', TERMS), ['TERM:NORTHWIND ANALYTICS', 'TERM:northwind analytics']);
  // A name broken across lines, or spaced out, is the same name.
  assert.deepEqual(found('by Northwind\nAnalytics and Northwind \t Analytics', TERMS), ['TERM:Northwind\nAnalytics', 'TERM:Northwind \t Analytics']);
  // Inside a longer word or identifier.
  assert.deepEqual(found('the northwind analytics-prod bucket', TERMS), ['TERM:northwind analytics']);
  // Where the term has a space, identifiers have a hyphen, an underscore, a dot or nothing.
  assert.deepEqual(
    found('northwind_analytics_policy.pdf, NorthwindAnalytics-prod, northwind-analytics, northwind.analytics', TERMS),
    ['TERM:northwind_analytics', 'TERM:NorthwindAnalytics', 'TERM:northwind-analytics', 'TERM:northwind.analytics'],
  );
  // But the words must be adjacent: other text between them is not the name.
  assert.deepEqual(found('Northwind and Analytics, Northwind (Analytics)', TERMS), []);
  // Straight and typographic apostrophes, quotes and dashes are interchangeable.
  assert.deepEqual(found('O’Brien & Sons / O‘Brien & Sons', TERMS), ['TERM:O’Brien & Sons', 'TERM:O‘Brien & Sons']);
  assert.deepEqual(found('Acme “Rocket” Corp', TERMS), ['TERM:Acme “Rocket” Corp']);
  assert.deepEqual(found('Smith–Jones LLP', ['Smith-Jones LLP']), ['TERM:Smith–Jones LLP']);
  // Composed and decomposed accents (PDF extraction often decomposes).
  const decomposed = 'Café Zürich'.normalize('NFD');
  assert.notEqual(decomposed, 'Café Zürich');
  assert.deepEqual(found(`at ${decomposed}.`, TERMS), [`TERM:${decomposed}`]);
  assert.deepEqual(found('at Café Zürich.', [decomposed]), ['TERM:Café Zürich']);
  // Regex metacharacters in a term are literal.
  assert.deepEqual(found('C++ (UK) [Ltd.] | a.b*c?', ['C++ (UK) [Ltd.]', 'a.b*c?']), ['TERM:C++ (UK) [Ltd.]', 'TERM:a.b*c?']);
  assert.deepEqual(found('axbxc and C+ (UK)', ['a.b*c?', 'C++ (UK)']), []);
});

test('term lists are cleaned: trimmed, empty and duplicate entries ignored, garbage tolerated', () => {
  assert.deepEqual(createRedactor({ terms: ['  Acme  ', '', '   ', 'Acme', 'Northwind Analytics', 42, null] }).terms, ['Northwind Analytics', 'Acme']);
  for (const terms of [undefined, null, 'Acme', { 0: 'Acme' }]) {
    const s = createRedactor({ terms }).session();
    assert.equal(s.redact('Acme at 10.0.0.5'), 'Acme at [[IP_1]]');
  }
  // A whitespace-only term must never turn every space into a placeholder.
  assert.equal(createRedactor({ terms: [' '] }).session().redact('a b c'), 'a b c');
});

test('the longest term wins, and a term that starts inside another is not left half in the clear', () => {
  assert.deepEqual(found('Acme Corporation Ltd', ['Acme', 'Acme Corporation']), ['TERM:Acme Corporation']);
  // "Longest" means the longest MATCH at a position, whatever order the terms are listed
  // in and however their patterns compare: "Blue Ridge" also fits the start of "BlueRidgeBank".
  for (const terms of [['Blue Ridge', 'BlueRidgeBank'], ['BlueRidgeBank', 'Blue Ridge']]) {
    assert.deepEqual(found('wire to BlueRidgeBank today', terms), ['TERM:BlueRidgeBank']);
    assert.equal(createRedactor({ terms }).session().redact('wire to BlueRidgeBank today'), 'wire to [[TERM_1]] today');
  }
  // The term written with more characters can be the one with the SHORTER match here.
  assert.deepEqual(found('wire to BlueRidgeCorp today', ['Blue Ridge Co', 'BlueRidgeCorp']), ['TERM:BlueRidgeCorp']);
  // "Corp Finance" begins inside "Acme Corp": both are covered by one span.
  assert.deepEqual(found('the Acme Corp Finance team', ['Acme Corp', 'Corp Finance']), ['TERM:Acme Corp Finance']);
  const s = session(['Acme Corp', 'Corp Finance']);
  const out = s.redact('the Acme Corp Finance team');
  assert.equal(out, 'the [[TERM_1]] team');
  assert.equal(s.restore(out), 'the Acme Corp Finance team');
});

test('overlapping detections are merged so that every claimed character is replaced', () => {
  // An e-mail address is one value, not a local part plus a host name.
  assert.deepEqual(found('a jane@db01.corp.example b'), ['EMAIL:jane@db01.corp.example']);
  // A URL is one value, not a scheme plus a host plus an address.
  assert.deepEqual(found('http://10.1.2.3:8080/x and https://db01.corp.example/y'), ['URL:http://10.1.2.3:8080/x', 'URL:https://db01.corp.example/y']);
  // A term overlapping the start of an e-mail address: the union is replaced.
  assert.deepEqual(found('John Smith@corp.example', ['John Smith']), ['TERM:John Smith@corp.example']);
  // IPv4-mapped IPv6: the IPv6 and IPv4 detections overlap.
  assert.deepEqual(found('::ffff:192.0.2.1'), ['IP:::ffff:192.0.2.1']);
  // Adjacent (touching) values stay separate.
  const s = session();
  const out = s.redact('10.0.0.5,10.0.0.6 a@b.example;c@d.example');
  assert.equal(out, '[[IP_1]],[[IP_2]] [[EMAIL_3]];[[EMAIL_4]]');
  assert.equal(s.restore(out), '10.0.0.5,10.0.0.6 a@b.example;c@d.example');
});

test('values are found in the places real documents put them: compounds, ports, ranges, vendor spellings', () => {
  const cases = [
    // A host name as the first part of a compound, or wrapped in Markdown emphasis.
    ['acme.com-hosted mail', ['HOST:acme.com']],
    ['bucket backups-acme.com-prod', ['HOST:backups-acme.com']],
    ['env ACME.COM_HOST and _acme.com_', ['HOST:ACME.COM', 'HOST:_acme.com']],
    // Without a scheme: the port, path and query still belong to the address.
    ['Console at intranet.corp.example:8443/wiki/ProjectTitan.', ['URL:intranet.corp.example:8443/wiki/ProjectTitan']],
    ['open corp.example?token=abc123 now', ['URL:corp.example?token=abc123']],
    ['Console at 10.1.2.3/wiki/ProjectTitan', ['URL:10.1.2.3/wiki/ProjectTitan']],
    ['db01.corp.example:5432 is up; is it corp.example?', ['HOST:db01.corp.example', 'HOST:corp.example']],
    ['www.10.1.2.3/x?u=http://', ['URL:www.10.1.2.3/x?u=http://']],
    // An address after dots, and one followed by a service name.
    ['pool 10.1.2.1...10.1.2.254; file config.10.1.2.3', ['IP:10.1.2.1', 'IP:10.1.2.254', 'IP:10.1.2.3']],
    ['tcp6 0 0 fe80::1:domain LISTEN; gw 2001:db8::1:default', ['IP:fe80::1', 'IP:2001:db8::1']],
    // MAC addresses as arp, switches and access points print them.
    ['? (10.0.0.1) at 0:1b:21:a:b:c on en0', ['IP:10.0.0.1', 'MAC:0:1b:21:a:b:c']],
    ['MAC 001a-2b3c-4d5e on GE0/0/1; MAC 001a2b-3c4d5e port 12', ['MAC:001a-2b3c-4d5e', 'MAC:001a2b-3c4d5e']],
    // Internationalized names, in Unicode and in punycode.
    ['mx corp.xn--p1ai and почта.рф', ['HOST:corp.xn--p1ai', 'HOST:почта.рф']],
    // E-mail addresses with the less common local parts, and "@" as a link writes it.
    ['mail ops/oncall@corp.example, first!last@corp.example', ['EMAIL:ops/oncall@corp.example', 'EMAIL:first!last@corp.example']],
    ['mailto:jdoe%40corp.example', ['EMAIL:jdoe%40corp.example']],
    [`mail ${'josé'.normalize('NFD')}.garcia@corp.example`, [`EMAIL:${'josé'.normalize('NFD')}.garcia@corp.example`]],
    // What a .docx yields for Word's non-breaking and optional hyphens.
    ['portal acme\u{2011}corp.com; write to mary\u{2011}ann.smith@corp.example', ['HOST:acme\u{2011}corp.com', 'EMAIL:mary\u{2011}ann.smith@corp.example']],
    ['host intra\u{ad}net.corp.example', ['HOST:intra\u{ad}net.corp.example']],
    // JSON written with escaped slashes.
    [String.raw`{"url":"https:\/\/intranet.corp.example\/wiki\/ProjectTitan"}`, [String.raw`URL:https:\/\/intranet.corp.example\/wiki\/ProjectTitan`]],
  ];
  for (const [text, expected] of cases) assert.deepEqual(found(text), expected, text);
  // The same exclusions still hold next to these forms.
  for (const text of ['PR.AA-05 and GV.OC-01', 'report.pdf-old, policy.md_draft', 'v1.2-beta, 3.5-inch, AC.L2-3.1.1', '202401-202412 and 2026-01-01', 'U.S-based, e.g-x']) {
    assert.deepEqual(found(text), [], text);
  }
});

test('a listed term survives what documents do to names', () => {
  const one = (text, terms) => detect(text, { terms }).map((s) => s.value);
  // Hyphenated at the end of a line (and, after PDF extraction, with a space instead of the break).
  assert.deepEqual(one('approved by Blue Ridge Finan-\ncial Services', ['Blue Ridge Financial']), ['Blue Ridge Finan-\ncial']);
  assert.deepEqual(one('approved by North- wind Analytics', ['Northwind']), ['North- wind']);
  // Word's non-breaking hyphen and optional (soft) hyphen; a zero-width space.
  assert.deepEqual(one('Smith\u{2011}Jones LLP', ['Smith-Jones']), ['Smith\u{2011}Jones']);
  assert.deepEqual(one('North\u{ad}wind Holdings and North\u{200b}wind', ['Northwind']), ['North\u{ad}wind', 'North\u{200b}wind']);
  // One accent composed, the other decomposed, in the same name.
  assert.deepEqual(one('Jos\u{e9} Pen\u{303}a signed', ['José Peña']), ['Jos\u{e9} Pen\u{303}a']);
  // Broken across quoted lines.
  assert.deepEqual(one('> approved by Blue\n> Ridge Bank', ['Blue Ridge']), ['Blue\n> Ridge']);
  // Hyphens, underscores and dots in the TERM are separators too.
  assert.deepEqual(one('Smith Jones, SmithJones, smith_jones', ['Smith-Jones']), ['Smith Jones', 'SmithJones', 'smith_jones']);
  // JSON spellings: everything outside ASCII escaped, and text encoded twice.
  const asciiOnly = (text, hex = (code) => code.toString(16)) =>
    text.replace(/[^\x00-\x7f]/g, (ch) => `\\u${hex(ch.charCodeAt(0)).padStart(4, '0')}`);
  const escapedName = asciiOnly('Café Zürich'); // every non-ASCII character as a backslash-u escape
  assert.equal(escapedName.length, 'Café Zürich'.length + 10);
  assert.ok(/^[\x00-\x7f]+$/.test(escapedName));
  assert.deepEqual(one(`{"org": "${escapedName}"}`, ['Café Zürich']), [escapedName]);
  const upperHex = asciiOnly('Café Zürich', (code) => code.toString(16).toUpperCase());
  assert.deepEqual(one(`{"org": "${upperHex}"}`, ['Café Zürich']), [upperHex]);
  assert.deepEqual(
    one(String.raw`{"message": "{\"user\": \"CORP\\\\jsmith\", \"org\": \"Acme \\\"Rocket\\\" Corp\"}"}`, ['CORP\\jsmith', 'Acme "Rocket" Corp']),
    [String.raw`CORP\\\\jsmith`, String.raw`Acme \\\"Rocket\\\" Corp`],
  );
  // Every one of these restores exactly.
  const s = session(['Blue Ridge Financial', 'Northwind', 'Smith-Jones', 'José Peña']);
  const text = 'Blue Ridge Finan-\ncial, North\u{ad}wind, Smith\u{2011}Jones, Jos\u{e9} Pen\u{303}a';
  assert.equal(s.redact(text), '[[TERM_1]], [[TERM_2]], [[TERM_3]], [[TERM_4]]');
  assert.equal(s.restore(s.redact(text)), text);
  // A term with no word in it (only separators) is ignored rather than matching everywhere.
  assert.deepEqual(one('a - b _ c . d', ['-', ' _ ', '...']), []);
});

test('detection stays linear on text built to make it slow', () => {
  const slow = [
    ['closing brackets after dotted names', 'a.bc/'.repeat(400) + ')'.repeat(2000), []],
    ['closing brackets after a URL', `see http://a.example/x${')'.repeat(20000)}`, []],
    ['200 KB of host/ pairs', 'a.bc/'.repeat(40000), []],
    ['dashes after a term with a dash', `Smith${'-'.repeat(100000)}`, ['Smith - Jones']],
    ['dashes and a term that starts with one', '-'.repeat(100000), ['- Acme']],
    ['hyphenation look-alikes', `Smith${'- '.repeat(50000)}`, ['Smithsonian']],
    ['a long run of local-part characters', `${'a=b/'.repeat(50000)}@`, []],
  ];
  for (const [label, text, terms] of slow) {
    const started = Date.now();
    const s = session(terms);
    assert.equal(s.restore(s.redact(text)), text, label);
    assert.ok(Date.now() - started < 2000, `${label}: took ${Date.now() - started} ms`);
  }
});

/* ---------------------------- what is NOT found ---------------------------- */

test('document file names and CSF identifiers are left readable', () => {
  const files = ['report.pdf', 'Asset-Inventory.docx', 'old.doc', 'access-control-standard.md', 'notes.txt', 'evidence-map.csv',
    'current-profile.json', 'dashboard.html', 'budget.xlsx', 'deck.pptx', 'diagram.png', 'photo.jpg', 'report.final.PDF'];
  for (const name of files) assert.deepEqual(found(`see ${name} for details`), [], name);
  // The labels the model must echo back, exactly as the prompt renders them.
  assert.deepEqual(found('[CHUNK 1 | source_file: "incident-response-plan.pdf" | page: 1 | chunk_id: incident-response-plan.pdf~70a67a#p1#c0]'), []);
  // CSF Function.Category identifiers and subcategory ids.
  for (const id of ['GV.OC', 'GV.RM', 'ID.AM', 'PR.AA', 'PR.DS', 'DE.CM', 'RS.MA', 'RC.RP', 'PR.AA-05', 'GV.OC-01']) {
    assert.deepEqual(found(`Category: ${id} — Identity Management (${id})`), [], id);
  }
  // The exclusions are narrow: other dotted names are still host names.
  assert.deepEqual(found('pr.aa and PR.AAA and report.pdf.example'), ['HOST:pr.aa', 'HOST:PR.AAA', 'HOST:report.pdf.example']);
});

test('documented non-detections stay non-detections', () => {
  const untouched = [
    'Call +1 (305) 555-0142 or 305-555-0199.', // phone numbers
    'Jane Doe, Chief Information Security Officer', // personal names and titles
    'Northwind Holdings LLC, 100 Biscayne Blvd, Miami, FL 33131', // company names (unless listed) and postal addresses
    'the server FS01 and the share \\\\fs01\\finance', // single-label machine names
    'account 123456789012, SSN 078-05-1120, card 4111 1111 1111 1111', // account and identity numbers
    'key sk_live_51Habc and password Hunter2!', // secrets
    'at 12:30:45 on 2026-01-01, ratio 1:2:3, score 3.14', // times, dates, ratios, decimals
    'std::string, Foo::Bar, a::b, vec::new()', // scope operators
    'version v1.2.3, build 10.0.19045.3803, OID 1.3.6.1.4.1.311', // versions and OIDs
    'e.g. this, i.e. that, etc. and a.m. or U.S.A.', // abbreviations
    'ISO 27001 A.5.1, CIS 1.1.1, SOC 2 CC6.1, NIST SP 800-53 AC-2(1)', // control identifiers
    'hash d41d8cd98f00b204e9800998ecf8427e', // bare hexadecimal
    'localhost, intranet, fileserver', // names without a dot
    'C2 at evil[.]example and 10[.]1[.]2[.]3', // defanged indicators
    'bind as CN=svc-backup,OU=Service Accounts,DC=corp,DC=example', // directory names
    '001a2b3c4d5e and 550e8400e29b41d4a716446655440000', // addresses and ids written without separators
  ];
  for (const text of untouched) {
    assert.deepEqual(found(text), [], text);
    assert.equal(session([]).redact(text), text);
  }
});

test('IPv6 detection is conservative; IPv4 requires real octets', () => {
  // No "::" and fewer than eight groups: times, ratios, verse and clause numbers.
  for (const text of ['12:30', '12:30:45', '1:2:3:4', 'aa:bb:cc', 'John 3:16', '10:00-12:00']) assert.deepEqual(found(text), [], text);
  // "::" with no digit is a scope operator, not an address.
  for (const text of ['a::b', 'dead::beef', 'std::face', 'x ::  y']) assert.deepEqual(found(text), [], text);
  // Not addresses: an out-of-range octet, five parts, a longer number around it.
  for (const text of ['999.1.2.3', '1.2.3.256', '1.2.3.4.5', '11.2.3.4.5.6', '1234.5.6.7']) assert.deepEqual(found(text), [], text);
  // A prefix length is part of the address; anything else after a slash is a path.
  assert.deepEqual(found('10.0.0.5/24 and 10.0.0.5/443'), ['IP:10.0.0.5/24', 'URL:10.0.0.5/443']);
  // Over-replacement by design: a four-part number is indistinguishable from an address.
  assert.deepEqual(found('Section 4.2.1.3 applies'), ['IP:4.2.1.3']);
});

/* --------------------------------- redact --------------------------------- */

test('placeholders are typed, numbered by first appearance, and one per distinct original', () => {
  const s = session();
  const out = s.redact('a@x.example then 10.0.0.5 then a@x.example then A@x.example then 10.0.0.5');
  assert.equal(out, '[[EMAIL_1]] then [[IP_2]] then [[EMAIL_1]] then [[EMAIL_3]] then [[IP_2]]');
  assert.deepEqual(s.entries(), [['[[EMAIL_1]]', 'a@x.example'], ['[[IP_2]]', '10.0.0.5'], ['[[EMAIL_3]]', 'A@x.example']]);
  assert.equal(s.size, 3);
  // Every type name is one the module declares.
  for (const [placeholder] of s.entries()) assert.ok(PLACEHOLDER_TYPES.includes(/^\[\[([A-Z]+)_/.exec(placeholder)[1]));
});

test('a session shares one map across calls; separate sessions start over', () => {
  const s = session();
  assert.equal(s.redact('system mentions db01.corp.example'), 'system mentions [[HOST_1]]');
  assert.equal(s.redact('user: 10.0.0.5 on db01.corp.example'), 'user: [[IP_2]] on [[HOST_1]]');
  assert.equal(session().redact('user: 10.0.0.5 on db01.corp.example'), 'user: [[IP_1]] on [[HOST_2]]');
});

test('redaction is deterministic and reveals nothing about the values', () => {
  const text = 'admin@northwind.example, 10.0.0.5, Northwind Analytics, db01.corp.example';
  const a = session().redact(text);
  assert.equal(session().redact(text), a);
  assert.equal(a, '[[EMAIL_1]], [[IP_2]], [[TERM_3]], [[HOST_4]]');
  // Different values of the same kinds produce the very same output.
  assert.equal(session(['Contoso Ltd']).redact('root@contoso.example, 172.16.0.9, Contoso Ltd, web7.contoso.example'), a);
});

test('ROUND TRIP: restore(redact(x)) === x over a broad crafted set', () => {
  const crafted = [
    '', ' ', '\n', '\t \n', 'no identifiers here at all',
    ...SENSITIVE,
    ...NEUTRAL,
    SENSITIVE.join(' '), SENSITIVE.join('\n'), SENSITIVE.join(','), SENSITIVE.join(''), NEUTRAL.join(' '),
    // adjacent and overlapping matches
    '10.0.0.5,10.0.0.6;10.0.0.5', 'a@b.example,c@d.example', 'jane@db01.corp.example/Northwind Analytics',
    'https://x.example/a?u=bob@corp.example&ip=10.0.0.5', 'Northwind AnalyticsNorthwind Analytics', 'www.www.corp.example',
    // repeated values and mixed-case terms
    'db01.corp.example DB01.CORP.EXAMPLE db01.corp.example Db01.Corp.Example', 'NORTHWIND analytics northwind ANALYTICS NorthWind AnalYtics',
    // unicode around and inside values
    '日本語 admin@corp.example のメール', '😀10.0.0.5😀', 'ÅÄÖ åäö@corp.example', 'München: bücher.example — «www.corp.example»',
    'caf\u{e9} \u{65}\u{301} Caf\u{e9} Z\u{fc}rich', '\u{feff}leading BOM 10.0.0.5', 'lone \u{d800} surrogate 10.0.0.5 \u{dfff} end',
    // text that already looks like placeholders
    '[[EMAIL_1]]', '[[EMAIL_1]] admin@corp.example [[EMAIL_1]]', '[[ ip_2 ]] [[TERM _ 003]] [[Foo_12]] [[TOKEN_1]]',
    '[[[EMAIL_1]]]', '[[EMAIL_1]][[IP_2]]', '[[EMAIL_]] [[_1]] [[1_A]] [EMAIL_1] [[EMAIL-1]] [[EMAIL_1]', '[[a_1]]@corp.example',
    // JSON-escaped text, and escapes right before a value
    jsonForm('line one\nadmin@corp.example\t10.0.0.5\n"Northwind\nAnalytics"'), 'x\\u001110.0.0.5 \\bfe80::1 \\f00:1A:2B:3C:4D:5E',
    'C:\\Users\\jsmith\\notes.txt and \\\\fs01.corp.example\\share',
    // punctuation soup
    '@', '@@', '.', '...', '://', 'http://', 'www.', '::', ':::', '[[', ']]', '[[]]', '_', 'a@', '@b', 'a.', '.b', '1.2.3.', '.1.2.3.4',
  ];
  for (const text of crafted) {
    const s = session();
    assert.equal(s.restore(s.redact(text)), text, JSON.stringify(text));
  }
});

test('ROUND TRIP and NO SURVIVOR over 1,500 generated documents', () => {
  for (let seed = 1; seed <= 1500; seed++) {
    const rand = mulberry32(seed);
    const { text, used } = compose(rand, 3 + Math.floor(rand() * 14));
    const s = session();
    const redacted = s.redact(text);

    assert.equal(s.restore(redacted), text, `round trip, seed ${seed}`);
    assert.equal(session().redact(text), redacted, `determinism, seed ${seed}`);
    for (const value of used) assert.ok(!redacted.includes(value), `seed ${seed}: ${JSON.stringify(value)} survived in ${JSON.stringify(redacted)}`);
    // A fresh scan of the output finds nothing but the placeholders just issued.
    const issued = new Set(s.entries().map(([placeholder]) => placeholder));
    for (const span of detect(redacted, { terms: TERMS })) {
      assert.ok(span.type === 'TOKEN' && issued.has(span.value), `seed ${seed}: ${JSON.stringify(span)} left in ${JSON.stringify(redacted)}`);
    }
  }
});

test('ROUND TRIP over 4,000 strings built from the characters that make up placeholders and addresses', () => {
  const atoms = ['[', '[', ']', ']', '[[', ']]', '_', '1', '2', '0', '9', 'a', 'b', 'e', 'f', 'x', 'A', 'IP', 'EMAIL', 'TERM', 'TOKEN', '@', '.', '.',
    ':', '::', '/', '//', '\\', '\\n', '\\t', '\\u0011', '"', "'", ' ', ' ', '\n', '\t', '-', '%', '+', 'é', 'ü', '日', '😀', 'www.', 'http://', 'com',
    'corp', 'example', 'Northwind', 'Analytics', 'jsmith', 'CORP', '10', '255', '256', '{', '}', ',', '’', '“', '—', '\u{301}'];
  // Terms chosen to collide with the placeholder syntax itself.
  const redactor = createRedactor({ terms: [...TERMS, 'IP', 'a.b', '[[', 'x_1', '_1]]'] });
  for (let seed = 1; seed <= 4000; seed++) {
    const rand = mulberry32(seed * 7919);
    let text = '';
    for (let i = 1 + Math.floor(rand() * 30); i > 0; i--) text += atoms[Math.floor(rand() * atoms.length)];

    const s = redactor.session();
    const redacted = s.redact(text);
    assert.equal(s.restore(redacted), text, `seed ${seed}: ${JSON.stringify(text)}`);
    // After redaction, every placeholder-shaped token is one this session issued.
    const issued = new Set(s.entries().map(([placeholder]) => placeholder));
    for (const m of redacted.matchAll(PLACEHOLDER)) assert.ok(issued.has(m[0]), `seed ${seed}: foreign ${m[0]} in ${JSON.stringify(redacted)}`);
    // Restoring into JSON text is exact as well, once the JSON is decoded.
    assert.equal(JSON.parse(s.restoreJson(`{"q":"${jsonForm(redacted)}"}`)).q, text, `seed ${seed}`);
  }
});

test('empty, whitespace-only, non-string and very long input', () => {
  const s = session();
  for (const text of ['', ' ', '\n\n', '\t']) assert.equal(s.redact(text), text);
  assert.equal(s.redact(undefined), '');
  assert.equal(s.redact(null), '');
  assert.equal(s.redact(42), '42');
  assert.equal(s.restore(undefined), '');

  // About 2 MB of ordinary text with identifiers throughout.
  const paragraph = 'The policy is reviewed by admin@northwind.example for Northwind Analytics on db01.corp.example (10.0.0.5). ';
  const long = paragraph.repeat(20000);
  const started = Date.now();
  const long1 = session();
  const redacted = long1.redact(long);
  assert.equal(long1.restore(redacted), long);
  assert.equal(long1.size, 4);
  assert.ok(!redacted.includes('northwind') && !redacted.includes('10.0.0.5'));

  // Long unbroken runs must not make any detector quadratic.
  for (const unit of ['a', '1', '.', 'a.', '1.', ':', 'a:', '@', 'a@', '[', '[[', '_', ' ', '\\', '/', 'ab-', 'é', '日本']) {
    const run = unit.repeat(Math.ceil(300000 / unit.length));
    const r = session();
    assert.equal(r.restore(r.redact(run)), run, `run of ${JSON.stringify(unit)}`);
  }
  assert.ok(Date.now() - started < 20000, 'long inputs are processed in linear time');
});

/* --------------------------- placeholder literals -------------------------- */

test('text that already looks like a placeholder is itself replaced, so restoring cannot confuse the two', () => {
  const s = session();
  const text = 'The template uses [[EMAIL_1]] for admin@corp.example and [[ip_2]] for 10.0.0.5.';
  const out = s.redact(text);
  assert.equal(out, 'The template uses [[TOKEN_1]] for [[EMAIL_2]] and [[TOKEN_3]] for [[IP_4]].');
  assert.deepEqual(s.entries(), [
    ['[[TOKEN_1]]', '[[EMAIL_1]]'],
    ['[[EMAIL_2]]', 'admin@corp.example'],
    ['[[TOKEN_3]]', '[[ip_2]]'],
    ['[[IP_4]]', '10.0.0.5'],
  ]);
  assert.equal(s.restore(out), text);
  // A literal that is put back is not expanded a second time.
  const t = session();
  const tricky = 'literal [[EMAIL_2]] then real a@b.example';
  assert.equal(t.redact(tricky), 'literal [[TOKEN_1]] then real [[EMAIL_2]]');
  assert.equal(t.restore(t.redact(tricky)), tricky);
});

test('restore tolerates case and inner spaces, and leaves placeholders it never issued alone', () => {
  const s = session();
  s.redact('admin@corp.example and 10.0.0.5');
  // The ways a model may harmlessly re-type a placeholder.
  assert.equal(s.restore('[[email_1]] [[ EMAIL_1 ]] [[Email _ 1]] [[EMAIL_01]] [[\tIP_2\t]]'),
    'admin@corp.example admin@corp.example admin@corp.example admin@corp.example 10.0.0.5');
  // Never issued: a number that does not exist, or the right number under the wrong type.
  for (const unknown of ['[[EMAIL_3]]', '[[IP_1]]', '[[EMAIL_2]]', '[[HOST_1]]', '[[EMAIL_0]]', '[[EMAIL_999999999999]]']) {
    assert.equal(s.restore(`x ${unknown} y`), `x ${unknown} y`);
  }
  // Not the placeholder syntax at all.
  for (const other of ['[EMAIL_1]', '[[EMAIL-1]]', '[[EMAIL 1]]', '[[EMAIL_1]', '{{EMAIL_1}}', 'EMAIL_1']) assert.equal(s.restore(other), other);
});

/* ------------------------------- JSON safety ------------------------------- */

test('restoreJson inserts originals JSON-escaped: a quote, a backslash or a line break cannot break the reply', () => {
  const s = session();
  const chunk = 'Owner: Acme "Rocket" Corp, login CORP\\jsmith, part of Northwind\nAnalytics.';
  const sent = s.redact(chunk);
  assert.equal(sent, 'Owner: [[TERM_1]], login [[TERM_2]], part of [[TERM_3]].');

  // The model answers with JSON that quotes the redacted passage.
  const reply = JSON.stringify({ evidence: [{ source_file: 'a.md', quote: sent }], rationale: 'Names [[TERM_1]] as owner.' });
  // A plain restore would produce invalid JSON here ...
  assert.throws(() => JSON.parse(s.restore(reply)));
  // ... restoreJson produces JSON that decodes to the original characters.
  const parsed = JSON.parse(s.restoreJson(reply));
  assert.equal(parsed.evidence[0].quote, chunk);
  assert.equal(parsed.rationale, 'Names Acme "Rocket" Corp as owner.');
});

test('JSON escapes cannot hide a value: every pattern is still replaced right after an escape', () => {
  const values = ['admin@corp.example', '10.0.0.5', '192.168.1.0/24', 'fe80::1', '2001:db8::8a2e:370:7334', '00:1A:2B:3C:4D:5E',
    '0011.2233.4455', 'db01.corp.example', 'https://x.corp.example/a', 'www.corp.example/a', 'Northwind Analytics', 'CORP\\jsmith'];
  // Line breaks and tabs, the letter-less control codes (escaped as \uXXXX), a quote and a backslash.
  const before = ['\n', '\t', '\r', '\b', '\f', '\x00', '\x01', '\x11', '\x19', '\x0b', '\x1f', '"', '\\'];
  for (const value of values) {
    for (const lead of before) {
      for (const tail of [' ', lead, '.', '\n', '"']) {
        const raw = `x${lead}${value}${tail}y`;
        const escaped = jsonForm(raw); // the text as it sits inside a JSON string
        for (const text of [raw, escaped]) {
          const s = session();
          const out = s.redact(text);
          assert.ok(!out.includes(value) && !out.includes(jsonForm(value)), `${JSON.stringify(value)} after ${JSON.stringify(lead)} in ${JSON.stringify(text)}`);
          assert.equal(s.restore(out), text);
        }
      }
    }
  }
});

test('a listed term is found in its JSON-escaped spellings too', () => {
  // As written inside a JSON string: an escaped line break, escaped quotes, a doubled backslash.
  const escaped = jsonForm('Northwind\nAnalytics / Acme "Rocket" Corp / CORP\\jsmith');
  assert.equal(escaped, 'Northwind\\nAnalytics / Acme \\"Rocket\\" Corp / CORP\\\\jsmith');
  const s = session();
  assert.equal(s.redact(escaped), '[[TERM_1]] / [[TERM_2]] / [[TERM_3]]');
  assert.equal(s.restore(s.redact(escaped)), escaped);
});

/* ------------------------------ redactPrompt ------------------------------ */

test('redactPrompt: an embedded JSON line is redacted value by value with the SAME placeholders as the text', () => {
  const chunk = 'Contacts:\nadmin@corp.example\t10.0.0.5\nOperated by Northwind\nAnalytics for Acme "Rocket" Corp (CORP\\jsmith).';
  const firstPass = JSON.stringify({
    subcategory_id: 'PR.AA-05',
    coverage: 'partial',
    confidence: 0.5,
    evidence: [{ source_file: 'northwind analytics-policy.md', quote: chunk }],
    rationale: 'Names admin@corp.example as contact.',
    needs_review: true,
  });
  const prompt = `=== EVIDENCE ===\n${chunk}\n=== FIRST PASS ===\n${firstPass}\n=== END ===`;
  const s = session();
  const out = s.redactPrompt(prompt);

  const redactedChunk = 'Contacts:\n[[EMAIL_1]]\t[[IP_2]]\nOperated by [[TERM_3]] for [[TERM_4]] ([[TERM_5]]).';
  const lines = out.split('\n');
  const json = lines.find((l) => l.startsWith('{'));
  assert.equal(out, `=== EVIDENCE ===\n${redactedChunk}\n=== FIRST PASS ===\n${json}\n=== END ===`);
  // The line is still valid JSON, and decodes to the same redacted text the evidence shows.
  const decoded = JSON.parse(json);
  assert.equal(decoded.evidence[0].quote, redactedChunk);
  assert.equal(decoded.evidence[0].source_file, '[[TERM_6]]-policy.md');
  assert.equal(decoded.rationale, 'Names [[EMAIL_1]] as contact.');
  // Everything else in it is untouched.
  assert.deepEqual([decoded.subcategory_id, decoded.coverage, decoded.confidence, decoded.needs_review], ['PR.AA-05', 'partial', 0.5, true]);
  for (const value of ['admin@corp.example', '10.0.0.5', 'Northwind', 'Rocket', 'jsmith', 'northwind']) assert.ok(!out.includes(value), value);
  // If the model copies the JSON line back, restoring yields the original JSON exactly.
  assert.equal(s.restoreJson(json), firstPass);
});

test('redactPrompt: placeholders are numbered in text order across text and JSON lines', () => {
  const s = session();
  const out = s.redactPrompt(['first 10.0.0.1', '{"a":"10.0.0.2","b":"10.0.0.1"}', 'then 10.0.0.3 and 10.0.0.2'].join('\n'));
  assert.equal(out, ['first [[IP_1]]', '{"a":"[[IP_2]]","b":"[[IP_1]]"}', 'then [[IP_3]] and [[IP_2]]'].join('\n'));
});

test('redactPrompt: keys, nested values and non-string values are covered', () => {
  const s = session(['8812', 'Northwind Analytics']);
  const line = JSON.stringify({ 'admin@corp.example': { hosts: ['db01.corp.example', 'db02.corp.example'], count: 8812, ok: true, none: null }, n: 3.5 });
  const out = s.redactPrompt(line);
  assert.equal(out, '{"[[EMAIL_1]]":{"hosts":["[[HOST_2]]","[[HOST_3]]"],"count":"[[TERM_4]]","ok":true,"none":null},"n":3.5}');
  // A term that only exists ACROSS values falls back to plain-text redaction — still nothing survives.
  const across = createRedactor({ terms: ['alpha","b":"beta'] }).session();
  const acrossOut = across.redactPrompt('{"a":"alpha","b":"beta"}');
  assert.ok(!acrossOut.includes('alpha","b":"beta'));
  assert.equal(across.restore(acrossOut), '{"a":"alpha","b":"beta"}');
  // A term equal to a placeholder type name does not disturb the structured path.
  const typeName = createRedactor({ terms: ['IP'] }).session();
  assert.equal(typeName.redactPrompt('{"addr":"10.0.0.5"}'), '{"addr":"[[IP_1]]"}');
});

test('redactPrompt: only a line that is exactly canonical JSON is treated as JSON; anything else is text', () => {
  const s = session();
  const pretty = '{\n  "contact": "admin@corp.example",\n  "note": "x"\n}';
  const spaced = '{ "contact": "admin@corp.example" }';
  const notJson = '{admin@corp.example}';
  for (const text of [pretty, spaced, notJson, 'plain admin@corp.example', '{', '}', '{}', '']) {
    const fresh = session();
    const out = fresh.redactPrompt(text);
    assert.equal(out, session().redact(text), JSON.stringify(text)); // exactly what plain redaction produces
    assert.equal(fresh.restore(out), text);
    assert.ok(!out.includes('admin@corp.example'));
  }
  // Multi-line terms still match across the lines between JSON lines.
  assert.equal(s.redactPrompt('by Northwind\nAnalytics\n{"k":"v"}\nand Northwind\nAnalytics'), 'by [[TERM_1]]\n{"k":"v"}\nand [[TERM_1]]');
  // Pathological nesting is handled without throwing.
  const deep = `${'{"a":'.repeat(20000)}"admin@corp.example"${'}'.repeat(20000)}`;
  assert.ok(!session().redactPrompt(deep).includes('admin@corp.example'));
});

test('redactPrompt: 600 generated prompts — nothing survives, placeholders agree, the JSON restores exactly', () => {
  for (let seed = 1; seed <= 600; seed++) {
    const rand = mulberry32(seed * 104729);
    const { text, used } = compose(rand, 3 + Math.floor(rand() * 12));
    const firstPass = JSON.stringify({
      subcategory_id: 'PR.AA-05', coverage: 'partial', confidence: 0.5,
      evidence: [{ source_file: 'policy.md', quote: text }], rationale: `Because ${used[0] ?? 'nothing'}.`, needs_review: true,
    });
    const s = session();
    const out = s.redactPrompt(`=== EVIDENCE ===\n${text}\n=== FIRST PASS ===\n${firstPass}\n=== END ===`);

    for (const value of used) {
      assert.ok(!out.includes(value) && !out.includes(jsonForm(value)), `seed ${seed}: ${JSON.stringify(value)} survived`);
    }
    const json = out.split('\n').find((l) => l.startsWith('{"subcategory_id"'));
    const evidenceText = out.slice('=== EVIDENCE ===\n'.length, out.indexOf('\n=== FIRST PASS ==='));
    assert.equal(JSON.parse(json).evidence[0].quote, evidenceText, `seed ${seed}: same placeholders in text and JSON`);
    assert.equal(s.restoreJson(json), firstPass, `seed ${seed}: restores exactly`);
  }
});

/* ------------------------------ the tool itself ---------------------------- */

test('the tool\'s own prompts and the official CSF text contain nothing the redactor replaces', async () => {
  // Redaction must hide the user's identifiers, not rewrite the instructions:
  // the system prompts, the task scaffolding, and all 106 official outcomes
  // (with their Function and Category identifiers) pass through unchanged.
  const csf = await loadCsfCore('data/csf-core.json', { info() {}, warn() {} });
  assert.equal(csf.subcategories.length, 106);
  assert.deepEqual(detect(SYSTEM_PROMPT), []);
  assert.deepEqual(detect(ASK_SYSTEM_PROMPT), []);
  assert.deepEqual(detect(buildAskPrompt('Is MFA required for remote access?', [])), []);
  for (const sub of csf.subcategories) {
    assert.deepEqual(detect(buildTaskPrompt(sub, [])), [], sub.id);
    assert.deepEqual(detect(buildCritiquePrompt(sub, [], '{}')), [], sub.id);
  }
});

test('the redactor is pure: it imports nothing and touches no global state', () => {
  const source = readFileSync(new URL('../src/privacy/redactor.js', import.meta.url), 'utf8');
  assert.ok(!/^\s*import\s/m.test(source), 'no imports');
  assert.ok(!/\b(?:process|console|globalThis)\s*\.|\b(?:fetch|require|import)\s*\(|\bDate\b|Math\.random/.test(source), 'no I/O, clock or randomness');
});
