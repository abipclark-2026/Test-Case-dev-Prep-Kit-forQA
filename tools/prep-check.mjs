#!/usr/bin/env node
/**
 * prep-check — mechanical exit-gate checks for the QA Prep Cycle.
 *
 * Needs only Node 18+. No install, no dependencies.
 *
 *   node tools/prep-check.mjs --phase 1 --csv <cases.csv>
 *   node tools/prep-check.mjs --phase 2 --csv <cases.csv> --trace <traceability.json> --ac <ac.md> --variants a,b,c
 *   node tools/prep-check.mjs --phase 3 --csv <cases.csv> --trace <traceability.json> --ac <ac.md> --variants a,b,c
 *   node tools/prep-check.mjs --phase 4 --spec <file.spec.ts>[,<file2.spec.ts>] [--csv <cases.csv> --clarifications <log.md>] [--results <results.json>]
 *
 *   --ac        the story's acceptance criteria exactly as pasted from the ticket (a .md or .txt
 *               file). Every AC id in it (A1, A2, A2a...) must appear in the traceability file,
 *               so an AC line the assistant skipped cannot pass. If the file holds several
 *               stories, only the section under the heading naming this story is used.
 *               Missing: warning in Phase 2, error in Phase 3.
 *   --clarifications  the story's clarification log. Its "## Clarification tracker" table gives
 *               every spec question an ID (<STORY>-C1, <STORY>-C2...) and a status: Open, Answered,
 *               Applied or Withdrawn. Every open note in a case must cite an ID from the tracker
 *               ("Confirm with spec author (SD-104-C1)"). Phase 3 refuses Open and Answered rows.
 *               In Phase 4, with --csv too, a test for a case that still has an open note must be
 *               parked (test.fixme / test.skip), so unblocked cases can be automated while the
 *               story waits at Phase 2.
 *   --results   Phase 4, before the PR: the Playwright JSON report of a local run of these specs
 *               (npx playwright test <specs> --repeat-each=3 --reporter=json > results.json).
 *               Every test in the specs must be in the run; every test that is not parked must
 *               pass in every repeat (no failures, no flaky results); the run must use
 *               --repeat-each of at least 3. A spec edited after the run is a warning: re-run.
 *   --variants  the axes your product behaves differently on (user types, roles, browsers...).
 *               Every one needs a coverage decision. Use --variants none if the story has none.
 *               Missing: warning in Phase 2, error in Phase 3.
 *
 * Phase 1  CSV is well-formed (header, 7 columns, unique names, Spec + Time present,
 *          parallel numbering). Open "confirm with spec author" notes are listed.
 * Phase 2  Adds the traceability file: every AC has a status, every case maps to an AC,
 *          every case named in the file exists. GAP rows are allowed here.
 * Phase 3  Strict. No GAP rows, no open questions left in the cases ("confirm with spec author",
 *          "TBD", "check with the PO", "???"...), every Waived row has a reason, every Deferred
 *          row names where it went.
 * Phase 4  Spec files: every test() reaches an expect() or is parked with test.fixme / test.skip.
 *          A test() with an empty or TODO-only body passes and counts as green coverage.
 *
 * Exit code 0 = GO, 1 = NO-GO (errors), 2 = bad usage. Warnings never block.
 *
 * Traceability file shape (one per story, written in Phase 2, finished in Phase 3):
 * {
 *   "story": "SD-102",
 *   "ac": [
 *     { "id": "A1",  "text": "...", "status": "OK",       "cases": ["SD-102: Verify ..."] },
 *     { "id": "A2a", "text": "...", "status": "Waived",   "reason": "covered manually" },
 *     { "id": "A3",  "text": "...", "status": "Deferred", "target": "SD-110" },
 *     { "id": "A4",  "text": "...", "status": "GAP",      "priority": "HIGH" }
 *   ],
 *   "unmapped_cases": [ { "name": "SD-102: Verify ...", "reason": "regression guard" } ],
 *   "coverage": {
 *     "variants": {                      // one key per variant in scope (default list below)
 *       "standard_user":      { "status": "Covered",  "cases": ["SD-102: Verify ..."] },
 *       "locked_out_user":    { "status": "N/A",      "reason": "cannot log in, never reaches this screen" },
 *       "visual_user":        { "status": "Deferred", "target": "SD-110" }
 *     },
 *     "edge_categories": {               // keys: boundary, empty-or-invalid-input,
 *       "boundary": { "status": "Covered", "cases": ["..."] }   // role-or-permission,
 *     }                                  // state-or-timing, interaction
 *   }
 * }
 * Every variant and edge category needs an explicit decision. A missing "coverage"
 * section is a warning in Phase 2 and an error in Phase 3.
 */
import { readFileSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';

const HEADER = ['Feature Name', 'Test Case Name', 'Preconditions', 'Test Case Steps', 'Expected Result', 'Spec', 'Time'];
const STATUSES = ['OK', 'GAP', 'Waived', 'Deferred'];
// A "variant" is any axis your story can behave differently on: user type, role, browser, locale.
// There is no default: each story names its own with --variants (or "variants" in story.json).
let VARIANTS = null;
const EDGE_CATEGORIES = ['boundary', 'empty-or-invalid-input', 'role-or-permission', 'state-or-timing', 'interaction'];
// Wording that means a question is still open. Resolved notes ("confirmed with the spec author
// on 11/20") do not match, because "confirmed" is not "confirm with".
const OPEN_NOTE_RES = [
  /\bconfirm with\b/i,                    // confirm with spec author / the PO / dev
  /\bcheck with\b/i,                      // check with the PO
  /\b(TBD|TBC|TODO|FIXME)\b/,              // capitals only, so "todo list" in copy is fine
  /\bto be (confirmed|decided|determined)\b/i,
  /\b(pending|awaiting) (confirmation|clarification|an answer)\b/i,
  /\?\?/,                                  // ?? or ???
];
const openNote = (text) => OPEN_NOTE_RES.some((re) => re.test(text));
// A clarification id: <STORY-ID>-C<n>, e.g. SD-104-C3.
const CLAR_ID_RE = /\b[A-Z][A-Z0-9]+-\d+-C\d+\b/g;
const CLAR_STATUSES = ['Open', 'Answered', 'Applied', 'Withdrawn'];
// An AC id at the start of a line: "A1.", "- A3a.", "  * A12)".
const AC_ID_RE = /^\s*(?:[-*+]\s+)?\*{0,2}(A\d+[a-z]?)\*{0,2}[.):]\s/gm;

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

/** RFC 4180 parser: quoted cells, embedded commas, newlines and "" escapes. */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) err('CSV ends inside an open quote: a cell is missing its closing double quote.');
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

/** "1. a\n2. b" -> numbers [1,2]. Returns null when the cell has no numbered list. */
function listNumbers(cell) {
  const nums = [...cell.matchAll(/^\s*(\d+)\.\s/gm)].map((m) => Number(m[1]));
  return nums.length ? nums : null;
}

function checkCsv(path) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (e) { err(`Cannot read CSV: ${e.message}`); return []; }
  const rows = parseCsv(text);
  if (!rows.length) { err('CSV is empty.'); return []; }
  const head = rows[0].map((h) => h.trim());
  if (head.join('|') !== HEADER.join('|')) {
    err(`Header must be exactly: ${HEADER.join(',')}\n    found:               ${head.join(',')}`);
    return [];
  }
  const cases = [];
  const seen = new Map();
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2; // data row number as a reader counts it (header = 1)
    if (r.length !== HEADER.length) {
      err(`Row ${line}: ${r.length} columns, expected ${HEADER.length} (an unquoted comma or newline?).`);
      return;
    }
    const [feature, name, pre, steps, exp, spec, time] = r.map((x) => x.trim());
    const tag = `Row ${line} "${name.slice(0, 60)}"`;
    if (!name) { err(`Row ${line}: empty Test Case Name.`); return; }
    if (seen.has(name)) err(`${tag}: duplicate Test Case Name (also row ${seen.get(name)}). The name is the upsert key downstream.`);
    else seen.set(name, line);
    if (!feature) err(`${tag}: empty Feature Name.`);
    if (!/^[A-Z][A-Z0-9]+-\d+:\s*\S/.test(name)) warn(`${tag}: name should start "<STORY-ID>: Verify ...".`);
    if (!pre) err(`${tag}: empty Preconditions.`);
    if (!steps) err(`${tag}: empty Test Case Steps.`);
    if (!exp) err(`${tag}: empty Expected Result.`);
    if (!/^https?:\/\/\S+$/.test(spec)) err(`${tag}: Spec must be a URL (got "${spec.slice(0, 40)}").`);
    if (!/^\d+:[0-5]\d$/.test(time)) err(`${tag}: Time must be H:MM (got "${time}").`);
    const s = listNumbers(steps), e = listNumbers(exp);
    if (!s) warn(`${tag}: Steps are not a numbered list.`);
    if (!e) warn(`${tag}: Expected Result is not a numbered list.`);
    if (s && e && s.length !== e.length) warn(`${tag}: ${s.length} steps but ${e.length} expected results (should be parallel).`);
    if (pre && !listNumbers(pre)) warn(`${tag}: Preconditions are not a numbered list.`);
    cases.push({ name, line, open: openNote(exp) || openNote(steps) || openNote(pre), text: [pre, steps, exp].join('\n') });
  });
  return cases;
}

/**
 * Variant and edge-case coverage. Every variant and every edge category needs an explicit
 * decision, so "we didn't think about locked_out_user" cannot pass. Missing section: warning in
 * Phase 2, error in Phase 3.
 */
function checkCoverage(cov, names, phase) {
  const missing = (m) => (phase >= 3 ? err(m) : warn(m));
  if (!cov || typeof cov !== 'object') {
    missing('No "coverage" section in the traceability file. Add "variants" and "edge_categories" (shape in the header).');
    return;
  }
  const groups = [['edge_categories', EDGE_CATEGORIES]];
  if (VARIANTS === null) missing('No variant list given. Pass --variants a,b,c (or "variants" in story.json), or --variants none if this story has no variants.');
  else if (VARIANTS.length) groups.unshift(['variants', VARIANTS]);
  for (const [key, required] of groups) {
    const g = cov[key];
    if (!g || typeof g !== 'object') { missing(`coverage.${key} is missing.`); continue; }
    for (const k of required) {
      const tag = `coverage.${key}.${k}`;
      const e = g[k];
      if (!e) { missing(`${tag}: no decision. Mark it Covered, N/A (with a reason) or Deferred (with a target).`); continue; }
      if (!['Covered', 'N/A', 'Deferred'].includes(e.status)) { err(`${tag}: status must be Covered, N/A or Deferred (got "${e.status}").`); continue; }
      if (e.status === 'Covered') {
        if (!e.cases?.length) err(`${tag}: Covered but no cases listed.`);
        for (const n of e.cases ?? []) if (!names.has(n)) err(`${tag}: case not found in the CSV: "${n.slice(0, 70)}".`);
      }
      if (e.status === 'N/A' && !String(e.reason ?? '').trim()) err(`${tag}: N/A needs a "reason" (why this does not apply to the story).`);
      if (e.status === 'Deferred' && !String(e.target ?? '').trim()) err(`${tag}: Deferred needs a "target".`);
    }
    for (const k of Object.keys(g)) if (!required.includes(k)) warn(`coverage.${key}.${k}: not a recognised key (expected ${required.join(', ')}).`);
  }
}

/**
 * Read the AC ids from the pasted acceptance criteria. If the file covers several stories, use
 * only the section whose heading names this story (up to the next heading naming another story).
 */
function readAcIds(path, story) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (e) { err(`Cannot read AC file: ${e.message}`); return null; }
  const lines = text.split(/\r?\n/);
  const isStoryHeading = (l) => /^#{1,6}\s.*\b[A-Z][A-Z0-9]+-\d+\b/.test(l);
  const esc = String(story ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const start = story ? lines.findIndex((l) => isStoryHeading(l) && new RegExp(`\\b${esc}\\b`).test(l)) : -1;
  let section = text;
  if (start >= 0) {
    const rest = lines.slice(start + 1);
    const end = rest.findIndex(isStoryHeading);
    section = (end >= 0 ? rest.slice(0, end) : rest).join('\n');
  } else if (lines.some(isStoryHeading)) {
    err(`AC file has story headings but none names ${story} (wrong file?). Add a heading like "## ${story}: <title>".`);
    return null;
  }
  const ids = [...section.matchAll(AC_ID_RE)].map((m) => m[1]);
  if (!ids.length) { err(`AC file: no AC ids found (expected lines starting "A1.", "A2." ...). Number the AC first.`); return null; }
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  for (const d of new Set(dupes)) err(`AC file: AC id ${d} appears more than once.`);
  return new Set(ids);
}

function checkTrace(path, cases, phase, acPath) {
  let t;
  try { t = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { err(`Cannot read traceability file: ${e.message}`); return; }
  if (!Array.isArray(t.ac) || !t.ac.length) { err('Traceability file needs a non-empty "ac" array.'); return; }
  const names = new Set(cases.map((c) => c.name));
  const mapped = new Set();
  const ids = new Set();
  for (const a of t.ac) {
    const tag = `AC ${a.id ?? '(no id)'}`;
    if (!a.id) { err('An AC row has no "id".'); continue; }
    if (ids.has(a.id)) err(`${tag}: duplicate AC id.`);
    ids.add(a.id);
    if (!a.text) warn(`${tag}: no "text". Paste the AC verbatim so the file stands alone.`);
    if (!STATUSES.includes(a.status)) { err(`${tag}: status must be one of ${STATUSES.join(', ')} (got "${a.status}").`); continue; }
    if (a.status === 'OK') {
      if (!a.cases?.length) err(`${tag}: status OK but no cases listed.`);
      for (const n of a.cases ?? []) {
        if (!names.has(n)) err(`${tag}: case not found in the CSV: "${n.slice(0, 70)}" (renamed? typo?).`);
        mapped.add(n);
      }
    }
    if (a.status === 'GAP') {
      if (!['HIGH', 'MED', 'LOW'].includes(a.priority)) err(`${tag}: GAP needs priority HIGH, MED or LOW.`);
      if (phase >= 3) err(`${tag}: still a GAP. Fill it with a case or mark it Waived with a reason.`);
    }
    if (a.status === 'Waived' && !String(a.reason ?? '').trim()) err(`${tag}: Waived needs a "reason". "Forgot" is not a reason.`);
    if (a.status === 'Deferred' && !String(a.target ?? '').trim()) err(`${tag}: Deferred needs a "target" (the story or phase it moved to).`);
  }
  if (acPath) {
    const source = readAcIds(acPath, t.story);
    if (source) {
      for (const id of source) if (!ids.has(id)) err(`AC ${id}: in the acceptance criteria but missing from the traceability file. Every AC line needs a status.`);
      for (const id of ids) if (!source.has(id)) err(`AC ${id}: in the traceability file but not in the acceptance criteria (typo, or AC changed?).`);
    }
  } else {
    (phase >= 3 ? err : warn)('No --ac file given, so the traceability file cannot be checked against the real AC. Pass --ac <the pasted acceptance criteria>.');
  }
  const allowed = new Map((t.unmapped_cases ?? []).map((u) => [u.name, u.reason]));
  for (const [n, reason] of allowed) {
    if (!names.has(n)) err(`unmapped_cases names a case not in the CSV: "${n.slice(0, 70)}".`);
    if (!String(reason ?? '').trim()) err(`unmapped_cases "${n.slice(0, 50)}": needs a reason.`);
  }
  for (const c of cases) {
    if (!mapped.has(c.name) && !allowed.has(c.name)) {
      err(`Row ${c.line} "${c.name.slice(0, 60)}": maps to no AC. Add it to an AC row, or list it in unmapped_cases with a reason.`);
    }
  }
  checkCoverage(t.coverage, names, phase);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, t.ac.filter((a) => a.status === s).length]));
  console.log(`AC rows: ${t.ac.length}  (${STATUSES.map((s) => `${s} ${counts[s]}`).join(', ')})`);
}

/**
 * Read the "## Clarification tracker" table from the clarification log.
 * Returns Map(id -> status), or null if the file or table is missing or broken.
 */
function readTracker(path) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (e) { err(`Cannot read clarification log: ${e.message}`); return null; }
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,6}\s+Clarification tracker\s*$/i.test(l));
  if (start < 0) { err(`${path}: no "## Clarification tracker" section. Copy the table from templates/clarification-log.md.`); return null; }
  const rows = [];
  for (const l of lines.slice(start + 1)) {
    if (/^\s*\|/.test(l)) rows.push(l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
    else if (rows.length && l.trim() !== '') break;
    else if (/^#{1,6}\s/.test(l)) break;
  }
  if (rows.length < 2) { err(`${path}: the Clarification tracker table is empty. Add a header row and a separator row, even if there are no questions yet.`); return null; }
  const head = rows[0].map((h) => h.toLowerCase());
  const iId = head.indexOf('id'), iStatus = head.indexOf('status');
  if (iId < 0 || iStatus < 0) { err(`${path}: the Clarification tracker needs "ID" and "Status" columns.`); return null; }
  const tracker = new Map();
  for (const r of rows.slice(1)) {
    if (r.every((c) => /^:?-+:?$/.test(c) || c === '')) continue; // separator row
    const id = (r[iId] ?? '').replace(/[*`]/g, '');
    const status = (r[iStatus] ?? '').replace(/[*`]/g, '');
    if (!/^[A-Z][A-Z0-9]+-\d+-C\d+$/.test(id)) { err(`Clarification tracker: "${id}" is not an ID like SD-104-C1.`); continue; }
    if (tracker.has(id)) err(`Clarification tracker: ${id} appears more than once.`);
    if (!CLAR_STATUSES.includes(status)) { err(`Clarification tracker ${id}: status must be ${CLAR_STATUSES.join(', ')} (got "${status}").`); continue; }
    tracker.set(id, status);
  }
  return tracker;
}

/**
 * Cases vs. the tracker. An open note must cite an Open clarification; an Answered one means the
 * answer is not applied yet. Phase 3 accepts only Applied and Withdrawn.
 */
function checkClarifications(cases, tracker, phase) {
  const cited = new Set();
  for (const c of cases) {
    const ids = [...new Set(c.text.match(CLAR_ID_RE) ?? [])];
    ids.forEach((id) => cited.add(id));
    if (!c.open) continue;
    const tag = `Row ${c.line} "${c.name.slice(0, 60)}"`;
    if (!ids.length) { (phase >= 2 ? err : warn)(`${tag}: open question has no clarification ID. Write it as "Confirm with spec author (<STORY>-C<n>)" and add that ID to the tracker.`); continue; }
    for (const id of ids) {
      const st = tracker.get(id);
      if (!st) err(`${tag}: cites ${id}, which is not in the Clarification tracker.`);
      else if (st === 'Answered') err(`${tag}: ${id} is Answered but the case still carries the open note. Apply the answer, then mark ${id} Applied.`);
      else if (st !== 'Open') err(`${tag}: ${id} is ${st} but the case still carries an open note. Replace the note with the answer.`);
    }
  }
  const counts = Object.fromEntries(CLAR_STATUSES.map((s) => [s, 0]));
  for (const [id, st] of tracker) {
    counts[st]++;
    if (phase >= 3 && (st === 'Open' || st === 'Answered')) err(`Clarification ${id} is ${st}. Phase 3 needs every clarification Applied or Withdrawn.`);
    else if (st === 'Answered') warn(`Clarification ${id} is Answered: apply it to its cases in Phase 3, then mark it Applied.`);
    if (st === 'Open' && !cited.has(id)) warn(`Clarification ${id} is Open but no case cites it. Add the ID to the affected case(s), or mark it Withdrawn.`);
  }
  console.log(`Clarifications: ${tracker.size}  (${CLAR_STATUSES.map((s) => `${s} ${counts[s]}`).join(', ')})`);
}

/** Phase 4: names of cases that are still blocked on an open clarification. */
function blockedCases(csvPath, logPath) {
  const before = errors.length;
  const cases = checkCsv(csvPath);
  const tracker = logPath ? readTracker(logPath) : null;
  if (errors.length > before) return null;
  const blocked = new Map();
  for (const c of cases) {
    const ids = [...new Set(c.text.match(CLAR_ID_RE) ?? [])].filter((id) => !tracker || ['Open', 'Answered'].includes(tracker.get(id)));
    if (c.open || ids.length) blocked.set(c.name, ids.length ? ids.join(', ') : 'an open question');
  }
  return blocked;
}

/**
 * Phase 4: every test() body must reach an expect() or be parked. Comments are stripped first, so
 * "// TODO: expect(...)" does not count as an assertion. A file wrapped in test.describe.skip is
 * parked as a whole.
 */
function checkSpec(path, blocked, titles) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (e) { err(`Cannot read spec: ${e.message}`); return; }
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, '')          // block comments
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');      // line comments (not the // in https://)
  if (/\btest\.describe\.skip\s*\(/.test(code) && !/\btest\.describe\s*\(/.test(code)) {
    for (const m of code.matchAll(/(?<![.\w])test\s*\(\s*(['"`])((?:(?!\1).)*)\1/g)) titles?.set(m[2], { path, parked: true });
    console.log(`${path}: whole file parked with test.describe.skip`);
    return;
  }
  const starts = [...code.matchAll(/(?<![.\w])test\s*\(\s*(['"`])((?:(?!\1).)*)\1/g)];
  if (!starts.length) { warn(`${path}: no test() found.`); return; }
  let asserting = 0, parked = 0;
  starts.forEach((m, i) => {
    const body = code.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : code.length);
    const lineNo = code.slice(0, m.index).split('\n').length;
    const title = m[2].slice(0, 60);
    const parkedHere = /\btest\.(fixme|skip)\s*\(/.test(body);
    if (blocked?.has(m[2]) && !parkedHere) {
      err(`${path}:${lineNo} "${title}": the case is still blocked on ${blocked.get(m[2])}. Park it with test.fixme(true, 'blocked on ${blocked.get(m[2]).split(', ')[0]}') until the answer is applied.`);
      return;
    }
    titles?.set(m[2], { path, parked: parkedHere });
    if (parkedHere) parked++;
    else if (/\bexpect(\.\w+)?\s*\(/.test(body)) asserting++;
    else err(`${path}:${lineNo} "${title}": test() has no expect() and is not parked. It will pass and count as green. Add an assertion or test.fixme(true, 'reason').`);
  });
  console.log(`${path}: ${starts.length} test(s): ${asserting} asserting, ${parked} parked`);
}

/**
 * Phase 4, pre-PR: check a Playwright JSON report against the spec files.
 * specTitles: Map(title -> { path, parked }) built while checking the specs.
 */
function checkResults(path, specTitles, specPaths) {
  let r;
  try {
    // Windows PowerShell's ">" writes UTF-16; accept that as well as UTF-8.
    const buf = readFileSync(path);
    let text = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le') : buf.toString('utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    r = JSON.parse(text);
  } catch (e) { err(`Cannot read results file: ${e.message}. Produce it with --reporter=json.`); return; }
  if (!Array.isArray(r.suites)) { err(`${path}: not a Playwright JSON report (no "suites"). Run with --reporter=json.`); return; }
  const repeat = Math.min(...(r.config?.projects ?? [{}]).map((p) => Number(p.repeatEach ?? 1)));
  if (!(repeat >= 3)) err(`Results: the run used --repeat-each=${Number.isFinite(repeat) ? repeat : 1}. Run every spec at least 3 times: --repeat-each=3.`);
  for (const e of r.errors ?? []) err(`Results: the run itself reported an error: ${String(e.message ?? e).split('\n')[0].slice(0, 160)}`);
  const ran = new Map(); // title -> [statuses]
  const firstError = new Map();
  const walk = (suite) => {
    for (const sp of suite.specs ?? []) {
      for (const t of sp.tests ?? []) {
        if (!ran.has(sp.title)) ran.set(sp.title, []);
        ran.get(sp.title).push(t.status);
        if (t.status !== 'expected' && t.status !== 'skipped' && !firstError.has(sp.title)) {
          const res = (t.results ?? []).find((x) => x.error || x.errors?.length);
          const msg = res?.error?.message ?? res?.errors?.[0]?.message;
          if (msg) firstError.set(sp.title, msg.replace(/\u001b\[[0-9;]*m/g, '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join(' | ').slice(0, 240));
        }
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  r.suites.forEach(walk);
  let passed = 0, parkedN = 0;
  for (const [title, info] of specTitles) {
    const st = ran.get(title);
    if (!st) { err(`Results: "${title.slice(0, 70)}" (${info.path}) is not in the run. Re-run the full spec, not a filtered subset.`); continue; }
    if (info.parked) { parkedN++; continue; }
    const bad = st.filter((x) => x !== 'expected');
    if (!bad.length) { passed++; continue; }
    const why = firstError.get(title) ? ` First error: ${firstError.get(title)}` : '';
    if (bad.includes('flaky')) err(`Results: "${title.slice(0, 70)}" is flaky (passed only on retry in ${bad.filter((x) => x === 'flaky').length} of ${st.length} runs). Find the cause before the PR; do not raise retries.${why}`);
    if (bad.includes('unexpected')) err(`Results: "${title.slice(0, 70)}" failed in ${bad.filter((x) => x === 'unexpected').length} of ${st.length} runs.${why}`);
    if (bad.includes('skipped')) err(`Results: "${title.slice(0, 70)}" was skipped in the run but is not parked in the spec. Did the spec change after the run?`);
  }
  for (const title of ran.keys()) if (!specTitles.has(title)) warn(`Results: "${title.slice(0, 70)}" is in the run but not in the specs checked (renamed, or another spec?).`);
  const started = Date.parse(r.stats?.startTime ?? '');
  if (Number.isFinite(started)) {
    for (const f of specPaths) {
      try { if (statSync(f).mtimeMs > started) warn(`Results: ${f} was edited after this run started. Re-run before the PR so the results match the code.`); } catch { /* reported elsewhere */ }
    }
  }
  console.log(`Run: --repeat-each=${repeat}; ${passed} test(s) passed every run, ${parkedN} parked`);
}

// ---- main ----
let values;
try {
  ({ values } = parseArgs({ options: {
    phase: { type: 'string' }, csv: { type: 'string' }, trace: { type: 'string' },
    ac: { type: 'string' }, variants: { type: 'string' }, spec: { type: 'string' }, clarifications: { type: 'string' }, results: { type: 'string' },
  } }));
} catch (e) { console.error(e.message); process.exit(2); }
if (values.variants !== undefined) {
  VARIANTS = values.variants.trim().toLowerCase() === 'none' ? [] : values.variants.split(',').map((s) => s.trim()).filter(Boolean);
}
const phase = Number(values.phase);
const usage = 'Usage:\n  node tools/prep-check.mjs --phase 1 --csv <cases.csv>\n  node tools/prep-check.mjs --phase 2|3 --csv <cases.csv> --trace <traceability.json> --ac <ac.md> --variants a,b,c|none\n  node tools/prep-check.mjs --phase 4 --spec <file.spec.ts>[,<more>] [--csv <cases.csv> --clarifications <log.md>] [--results <results.json>]\n  add --clarifications <log.md> to any phase to check open questions against the tracker';
if (phase === 4) {
  if (!values.spec) { console.error(usage); process.exit(2); }
  const blocked = values.csv ? blockedCases(values.csv, values.clarifications) : null;
  if (blocked?.size) console.log(`Blocked cases (must stay parked): ${blocked.size}`);
  const specPaths = values.spec.split(',').map((s) => s.trim()).filter(Boolean);
  const titles = new Map();
  for (const f of specPaths) checkSpec(f, blocked, titles);
  if (values.results) checkResults(values.results, titles, specPaths);
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  console.log(`\nPhase 4: ${errors.length ? 'NO-GO' : 'GO'}  (${errors.length} error(s), ${warnings.length} warning(s))`);
  process.exit(errors.length ? 1 : 0);
}
if (![1, 2, 3].includes(phase) || !values.csv || (phase > 1 && !values.trace)) {
  console.error(usage);
  process.exit(2);
}

const cases = checkCsv(values.csv);
console.log(`Cases: ${cases.length}`);
if (phase > 1 && cases.length) checkTrace(values.trace, cases, phase, values.ac);
if (values.clarifications && cases.length) {
  const tracker = readTracker(values.clarifications);
  if (tracker) checkClarifications(cases, tracker, phase);
}

const open = cases.filter((c) => c.open);
if (open.length) {
  const msg = `${open.length} case(s) still carry an open question ("confirm with...", "TBD", "??"...): ${open.map((c) => `row ${c.line}`).join(', ')}.`;
  if (phase >= 3) err(`${msg} Close each with the author's answer (see the Spec Clarification ticket).`);
  else warn(`${msg} Each needs a Spec Clarification ticket.`);
}

for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
const verdict = errors.length ? 'NO-GO' : 'GO';
console.log(`\nPhase ${phase}: ${verdict}  (${errors.length} error(s), ${warnings.length} warning(s))`);
process.exit(errors.length ? 1 : 0);
