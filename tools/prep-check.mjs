#!/usr/bin/env node
/**
 * prep-check — mechanical exit-gate checks for the QA Prep Cycle.
 *
 * Needs only Node 18+. No install, no dependencies.
 *
 *   node tools/prep-check.mjs --phase 1 --csv <cases.csv>
 *   node tools/prep-check.mjs --phase 2 --csv <cases.csv> --trace <story-traceability.json>
 *   node tools/prep-check.mjs --phase 3 --csv <cases.csv> --trace <story-traceability.json>
 *   add  --variants a,b,c  to override the variant list (default: the SauceDemo user types)
 *
 * Phase 1  CSV is well-formed (header, 7 columns, unique names, Spec + Time present,
 *          parallel numbering). Open "confirm with spec author" notes are listed.
 * Phase 2  Adds the traceability file: every AC has a status, every case maps to an AC,
 *          every case named in the file exists. GAP rows are allowed here.
 * Phase 3  Strict. No GAP rows, no open "confirm with spec author" notes, every
 *          Waived row has a reason, every Deferred row names where it went.
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
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const HEADER = ['Feature Name', 'Test Case Name', 'Preconditions', 'Test Case Steps', 'Expected Result', 'Spec', 'Time'];
const STATUSES = ['OK', 'GAP', 'Waived', 'Deferred'];
// A "variant" is any axis your story can behave differently on: user type, role, browser, locale.
// The default list is SauceDemo's six built-in users. Override with --variants a,b,c.
let VARIANTS = ['standard_user', 'locked_out_user', 'problem_user', 'performance_glitch_user', 'error_user', 'visual_user'];
const EDGE_CATEGORIES = ['boundary', 'empty-or-invalid-input', 'role-or-permission', 'state-or-timing', 'interaction'];
const CONFIRM_RE = /confirm with (the )?spec author/i;

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
    cases.push({ name, line, open: CONFIRM_RE.test(exp) || CONFIRM_RE.test(steps) || CONFIRM_RE.test(pre) });
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
  const groups = [['variants', VARIANTS], ['edge_categories', EDGE_CATEGORIES]];
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

function checkTrace(path, cases, phase) {
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

// ---- main ----
let values;
try {
  ({ values } = parseArgs({ options: { phase: { type: 'string' }, csv: { type: 'string' }, trace: { type: 'string' }, variants: { type: 'string' } } }));
} catch (e) { console.error(e.message); process.exit(2); }
if (values.variants) VARIANTS = values.variants.split(',').map((s) => s.trim()).filter(Boolean);
const phase = Number(values.phase);
if (![1, 2, 3].includes(phase) || !values.csv || (phase > 1 && !values.trace)) {
  console.error('Usage:\n  node tools/prep-check.mjs --phase 1 --csv <cases.csv>\n  node tools/prep-check.mjs --phase 2|3 --csv <cases.csv> --trace <traceability.json> [--variants a,b,c]');
  process.exit(2);
}

const cases = checkCsv(values.csv);
console.log(`Cases: ${cases.length}`);
if (phase > 1 && cases.length) checkTrace(values.trace, cases, phase);

const open = cases.filter((c) => c.open);
if (open.length) {
  const msg = `${open.length} case(s) still carry a "confirm with spec author" note: ${open.map((c) => `row ${c.line}`).join(', ')}.`;
  if (phase >= 3) err(`${msg} Close each with the author's answer (see the Spec Clarification ticket).`);
  else warn(`${msg} Each needs a Spec Clarification ticket.`);
}

for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
const verdict = errors.length ? 'NO-GO' : 'GO';
console.log(`\nPhase ${phase}: ${verdict}  (${errors.length} error(s), ${warnings.length} warning(s))`);
process.exit(errors.length ? 1 : 0);
