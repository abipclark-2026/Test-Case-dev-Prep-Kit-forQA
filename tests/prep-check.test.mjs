/**
 * Tests for tools/prep-check.mjs and tools/check-all.mjs.
 *
 *   node --test tests/prep-check.test.mjs
 *
 * Needs only Node 18+. Each test copies the passing example in tests/fixtures/xy-2/ to a temp
 * folder, breaks ONE thing, runs the checker, and checks the verdict and the message.
 * A test that expects NO-GO also checks WHY, so a checker that fails for the wrong reason
 * does not count as a pass.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PREP = join(root, 'tools', 'prep-check.mjs');
const CHECK_ALL = join(root, 'tools', 'check-all.mjs');
const FIXTURE = join(root, 'tests', 'fixtures', 'xy-2');

/** A fresh copy of the passing example, plus helpers to edit it. */
function story() {
  const dir = mkdtempSync(join(tmpdir(), 'prep-check-'));
  cpSync(FIXTURE, dir, { recursive: true });
  const p = (f) => join(dir, f);
  return {
    dir,
    p,
    read: (f) => readFileSync(p(f), 'utf8'),
    write: (f, s) => writeFileSync(p(f), s),
    trace: () => JSON.parse(readFileSync(p('traceability.json'), 'utf8')),
    saveTrace: (t) => writeFileSync(p('traceability.json'), JSON.stringify(t, null, 2)),
  };
}

function run(args) {
  const r = spawnSync(process.execPath, [PREP, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

/** Full Phase 2/3 run with every input supplied. `extra` overrides or removes flags. */
function runPhase(s, phase, extra = {}) {
  const flags = {
    '--csv': s.p('cases.csv'),
    '--trace': s.p('traceability.json'),
    '--ac': s.p('acceptance-criteria.md'),
    '--variants': 'guest,member',
    '--clarifications': s.p('clarification-log.md'),
    ...extra,
  };
  const args = ['--phase', String(phase)];
  for (const [k, v] of Object.entries(flags)) if (v !== null) args.push(k, v);
  return run(args);
}

const GO = (r, phase) => assert.equal(r.code, 0, `expected GO, got:\n${r.out}`) || assert.match(r.out, new RegExp(`Phase ${phase}: GO`));
const NOGO = (r, why) => {
  assert.equal(r.code, 1, `expected NO-GO, got exit ${r.code}:\n${r.out}`);
  assert.match(r.out, why, `NO-GO for the wrong reason:\n${r.out}`);
};

// ---------------------------------------------------------------- baseline

test('the untouched example passes Phases 1, 2 and 3', () => {
  const s = story();
  GO(run(['--phase', '1', '--csv', s.p('cases.csv')]), 1);
  GO(runPhase(s, 2), 2);
  GO(runPhase(s, 3), 3);
});

test('the SauceDemo example in examples/ still passes check-all', () => {
  const r = spawnSync(process.execPath, [CHECK_ALL, 'examples/saucedemo'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// ---------------------------------------------------------------- fix 1: check against the real AC

test('an AC line missing from the traceability file is NO-GO', () => {
  const s = story();
  const t = s.trace();
  t.ac = t.ac.filter((a) => a.id !== 'A2a');
  t.unmapped_cases = [{ name: 'XY-2: Verify the total is unchanged after an invalid code (Negative)', reason: 'hide it' }];
  s.saveTrace(t);
  NOGO(runPhase(s, 3), /AC A2a: in the acceptance criteria but missing from the traceability file/);
});

test('an AC id in the traceability file that is not in the AC is NO-GO (typo)', () => {
  const s = story();
  const t = s.trace();
  t.ac.find((a) => a.id === 'A2a').id = 'A2b';
  s.saveTrace(t);
  const r = runPhase(s, 3);
  NOGO(r, /AC A2b: in the traceability file but not in the acceptance criteria/);
  assert.match(r.out, /AC A2a: in the acceptance criteria but missing/);
});

test('only the section for this story is read when the AC file holds several stories', () => {
  // XY-1 has an A3; XY-2 does not. If the whole file were read, A3 would be reported missing.
  const s = story();
  const r = runPhase(s, 3);
  GO(r, 3);
  assert.doesNotMatch(r.out, /AC A3/);
});

test('an AC file whose story headings do not name this story is NO-GO (wrong file)', () => {
  const s = story();
  s.write('acceptance-criteria.md', s.read('acceptance-criteria.md').replace('## XY-2: Apply a discount code', '## Discount codes'));
  NOGO(runPhase(s, 3), /none names XY-2 \(wrong file\?\)/);
});

test('an AC file with no numbered AC lines is NO-GO', () => {
  const s = story();
  s.write('acceptance-criteria.md', 'A valid code reduces the total.\nAn invalid code shows an error.\n');
  NOGO(runPhase(s, 3), /no AC ids found/);
});

test('a single-story AC file with no headings is read whole', () => {
  const s = story();
  s.write('acceptance-criteria.md', 'A1. Valid code.\nA2. Invalid code.\n  A2a. Total unchanged.\n');
  GO(runPhase(s, 3), 3);
});

test('no --ac file: warning in Phase 2, NO-GO in Phase 3', () => {
  const s = story();
  const p2 = runPhase(s, 2, { '--ac': null });
  GO(p2, 2);
  assert.match(p2.out, /WARN .*No --ac file given/);
  NOGO(runPhase(s, 3, { '--ac': null }), /ERROR .*No --ac file given/);
});

// ---------------------------------------------------------------- fix 2: open questions in any wording

for (const note of [
  'TBD - check with the PO whether this applies.',
  'Confirm with spec author if rounding applies.',
  'Confirm with the product owner.',
  'TODO: get the exact error copy.',
  'Rounding rule ??',
  'To be confirmed by design.',
  'Pending clarification from the spec owner.',
]) {
  test(`an open question is NO-GO in Phase 3: "${note}"`, () => {
    const s = story();
    s.write('cases.csv', s.read('cases.csv').replace('Total reads $45.00.', `Total reads $45.00. ${note}`));
    NOGO(runPhase(s, 3), /ERROR 1 case\(s\) still carry an open question.*row 2/);
  });
}

test('an open question is only a warning in Phase 1', () => {
  const s = story();
  s.write('cases.csv', s.read('cases.csv').replace('Total reads $45.00.', 'Total reads $45.00. TBD'));
  const r = run(['--phase', '1', '--csv', s.p('cases.csv')]);
  GO(r, 1);
  assert.match(r.out, /WARN .*open question/);
});

test('a resolved note ("Confirmed with the spec author") is not an open question', () => {
  // The fixture's third case already carries one; this pins that it stays GO.
  const s = story();
  assert.match(s.read('cases.csv'), /Confirmed with the spec author/);
  GO(runPhase(s, 3), 3);
});

// ---------------------------------------------------------------- fix 3: variants are explicit

test('no variant list: warning in Phase 2, NO-GO in Phase 3', () => {
  const s = story();
  const p2 = runPhase(s, 2, { '--variants': null });
  GO(p2, 2);
  assert.match(p2.out, /WARN .*No variant list given/);
  NOGO(runPhase(s, 3, { '--variants': null }), /ERROR .*No variant list given/);
});

test('a variant with no coverage decision is NO-GO in Phase 3', () => {
  const s = story();
  NOGO(runPhase(s, 3, { '--variants': 'guest,member,admin' }), /coverage\.variants\.admin: no decision/);
});

test('--variants none skips variant decisions', () => {
  const s = story();
  const t = s.trace();
  delete t.coverage.variants;
  s.saveTrace(t);
  GO(runPhase(s, 3, { '--variants': 'none' }), 3);
});

test('SauceDemo users are no longer assumed for other products', () => {
  const s = story();
  const r = runPhase(s, 3);
  assert.doesNotMatch(r.out, /standard_user|locked_out_user/);
});

// ---------------------------------------------------------------- fix 4: Phase 4 empty tests

test('Phase 4: asserting and parked tests are GO', () => {
  const s = story();
  const r = run(['--phase', '4', '--spec', s.p('parked.spec.ts')]);
  GO(r, 4);
  assert.match(r.out, /2 test\(s\): 1 asserting, 1 parked/);
});

test('Phase 4: a test() with a TODO-only body is NO-GO, even if the comment mentions expect()', () => {
  const s = story();
  NOGO(run(['--phase', '4', '--spec', s.p('blank.spec.ts')]), /blank\.spec\.ts:8 "XY-2: Verify an invalid code shows an error \(Negative\)": test\(\) has no expect\(\)/);
});

test('Phase 4: a whole file parked with test.describe.skip is GO', () => {
  const s = story();
  s.write('skipped.spec.ts', s.read('blank.spec.ts').replace("test.describe('", "test.describe.skip('"));
  GO(run(['--phase', '4', '--spec', s.p('skipped.spec.ts')]), 4);
});

test('Phase 4: several files are checked in one run', () => {
  const s = story();
  const r = run(['--phase', '4', '--spec', `${s.p('parked.spec.ts')},${s.p('blank.spec.ts')}`]);
  NOGO(r, /blank\.spec\.ts:8/);
  assert.match(r.out, /parked\.spec\.ts: 2 test\(s\)/);
});

// ---------------------------------------------------------------- check-all wiring

function storyFolder(s, storyJson) {
  const folder = join(s.dir, 'stories', 'XY-2');
  mkdirSync(folder, { recursive: true });
  cpSync(FIXTURE, folder, { recursive: true });
  writeFileSync(join(folder, 'story.json'), JSON.stringify({
    story: 'XY-2', phase: 3, csv: 'cases.csv', trace: 'traceability.json',
    ac: 'acceptance-criteria.md', variants: ['guest', 'member'], ...storyJson,
  }));
  return spawnSync(process.execPath, [CHECK_ALL, folder], { encoding: 'utf8' });
}

test('check-all accepts an absolute folder path (was a bug: it joined it onto the cwd)', () => {
  const r = spawnSync(process.execPath, [CHECK_ALL, join(root, 'examples', 'saucedemo')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('check-all passes ac and variants from story.json', () => {
  const r = storyFolder(story(), {});
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('check-all fails a story whose story.json has no ac or variants at Phase 3', () => {
  const r = storyFolder(story(), { ac: undefined, variants: undefined });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /No --ac file given/);
  assert.match(r.stdout, /No variant list given/);
});

test('check-all runs the Phase 4 check on "specs" and fails on an empty test', () => {
  const r = storyFolder(story(), { specs: ['blank.spec.ts'] });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /Phase 4: NO-GO/);
});

// ---------------------------------------------------------------- clarification IDs and parking

/** Put an open, ID-carrying note on case 1 (row 2) and set the tracker row for it. */
function withOpenQuestion(s, status = 'Open', note = 'Confirm with spec author (XY-2-C2): is the discount applied before tax?') {
  s.write('cases.csv', s.read('cases.csv').replace('Total reads $45.00.', `Total reads $45.00. ${note}`));
  s.write('clarification-log.md', s.read('clarification-log.md').replace(
    '| XY-2-C1 |',
    `| XY-2-C2 | Is the discount applied before tax? | Phase 1 | Spec author | QA-2 | ${status} | 1 |\n| XY-2-C1 |`));
}

test('a story waiting on an Open clarification passes Phase 2 (parked)', () => {
  const s = story();
  withOpenQuestion(s);
  const r = runPhase(s, 2);
  GO(r, 2);
  assert.match(r.out, /Clarifications: 2 {2}\(Open 1, Answered 0, Applied 1, Withdrawn 0\)/);
});

test('the same story is NO-GO in Phase 3 until the clarification is Applied', () => {
  const s = story();
  withOpenQuestion(s);
  NOGO(runPhase(s, 3), /Clarification XY-2-C2 is Open\. Phase 3 needs every clarification Applied or Withdrawn/);
});

test('an open note with no clarification ID is NO-GO in Phase 2 when the tracker is used', () => {
  const s = story();
  s.write('cases.csv', s.read('cases.csv').replace('Total reads $45.00.', 'Total reads $45.00. Confirm with spec author if tax applies.'));
  NOGO(runPhase(s, 2), /row 2|Row 2/);
  NOGO(runPhase(s, 2), /open question has no clarification ID/);
});

test('an open note with no ID is only a warning in Phase 1', () => {
  const s = story();
  s.write('cases.csv', s.read('cases.csv').replace('Total reads $45.00.', 'Total reads $45.00. TBD'));
  const r = run(['--phase', '1', '--csv', s.p('cases.csv'), '--clarifications', s.p('clarification-log.md')]);
  GO(r, 1);
  assert.match(r.out, /WARN .*open question has no clarification ID/);
});

test('a note citing an ID that is not in the tracker is NO-GO', () => {
  const s = story();
  s.write('cases.csv', s.read('cases.csv').replace('Total reads $45.00.', 'Total reads $45.00. Confirm with spec author (XY-2-C9).'));
  NOGO(runPhase(s, 2), /cites XY-2-C9, which is not in the Clarification tracker/);
});

test('an Answered clarification whose note is still in the case is NO-GO (answer not applied)', () => {
  const s = story();
  withOpenQuestion(s, 'Answered');
  NOGO(runPhase(s, 2), /XY-2-C2 is Answered but the case still carries the open note/);
});

test('an Answered clarification with the note already replaced is a Phase 2 warning, NO-GO in Phase 3', () => {
  const s = story();
  s.write('clarification-log.md', s.read('clarification-log.md').replace('| Applied |', '| Answered |'));
  const p2 = runPhase(s, 2);
  GO(p2, 2);
  assert.match(p2.out, /WARN +Clarification XY-2-C1 is Answered/);
  NOGO(runPhase(s, 3), /Clarification XY-2-C1 is Answered\. Phase 3 needs/);
});

test('an Open clarification that no case cites is a warning', () => {
  const s = story();
  s.write('clarification-log.md', s.read('clarification-log.md').replace('| Applied |', '| Open |'));
  const r = runPhase(s, 2);
  GO(r, 2);
  assert.match(r.out, /WARN +Clarification XY-2-C1 is Open but no case cites it/);
});

test('Withdrawn clarifications pass Phase 3', () => {
  const s = story();
  s.write('clarification-log.md', s.read('clarification-log.md').replace('| Applied |', '| Withdrawn |'));
  GO(runPhase(s, 3), 3);
});

test('a bad status, a bad ID or a missing tracker section is NO-GO', () => {
  let s = story();
  s.write('clarification-log.md', s.read('clarification-log.md').replace('| Applied |', '| Done |'));
  NOGO(runPhase(s, 2), /status must be Open, Answered, Applied, Withdrawn \(got "Done"\)/);
  s = story();
  s.write('clarification-log.md', s.read('clarification-log.md').replace('| XY-2-C1 | Does', '| Q1 | Does'));
  NOGO(runPhase(s, 2), /"Q1" is not an ID like SD-104-C1/);
  s = story();
  s.write('clarification-log.md', '# XY-2 Clarification log\n\nNo tracker here.\n');
  NOGO(runPhase(s, 2), /no "## Clarification tracker" section/);
});

test('the empty tracker in templates/clarification-log.md is accepted', () => {
  const s = story();
  cpSync(join(root, 'templates', 'clarification-log.md'), s.p('clarification-log.md'));
  GO(runPhase(s, 3), 3);
});

// 3A: automate unblocked cases while the story waits; blocked cases stay parked.

/** A spec with a test for case 1 (blocked once withOpenQuestion runs) and case 2. */
function specFor(s, case1Body) {
  s.write('waiting.spec.ts', `import { test, expect } from '@playwright/test';
test.describe('Discount codes (XY-2)', () => {
  test('XY-2: Verify a valid code reduces the total by 10%', async ({ page }) => {
    ${case1Body}
  });
  test('XY-2: Verify an invalid code shows an error (Negative)', async ({ page }) => {
    await expect(page.getByText('Code not recognised')).toBeVisible();
  });
});
`);
  return ['--phase', '4', '--spec', s.p('waiting.spec.ts'), '--csv', s.p('cases.csv'), '--clarifications', s.p('clarification-log.md')];
}

test('Phase 4: an unblocked case can be automated while another case waits, if the blocked one is parked', () => {
  const s = story();
  withOpenQuestion(s);
  const r = run(specFor(s, "test.fixme(true, 'blocked on XY-2-C2');"));
  GO(r, 4);
  assert.match(r.out, /Blocked cases \(must stay parked\): 1/);
  assert.match(r.out, /2 test\(s\): 1 asserting, 1 parked/);
});

test('Phase 4: a test that asserts on a blocked case is NO-GO', () => {
  const s = story();
  withOpenQuestion(s);
  NOGO(run(specFor(s, "await expect(page.getByTestId('total')).toHaveText('$45.00');")),
    /"XY-2: Verify a valid code reduces the total by 10%": the case is still blocked on XY-2-C2\. Park it with test\.fixme\(true, 'blocked on XY-2-C2'\)/);
});

test('Phase 4: once the clarification is Applied and the note replaced, the test may assert', () => {
  const s = story();
  GO(run(specFor(s, "await expect(page.getByTestId('total')).toHaveText('$45.00');")), 4);
});

test('check-all passes "clarifications" from story.json, including to the Phase 4 check', () => {
  const s = story();
  withOpenQuestion(s);
  specFor(s, "await expect(page.getByTestId('total')).toHaveText('$45.00');");
  const folder = join(mkdtempSync(join(tmpdir(), 'prep-check-all-')), 'XY-2');
  cpSync(s.dir, folder, { recursive: true });
  writeFileSync(join(folder, 'story.json'), JSON.stringify({
    story: 'XY-2', phase: 2, csv: 'cases.csv', trace: 'traceability.json', ac: 'acceptance-criteria.md',
    clarifications: 'clarification-log.md', variants: ['guest', 'member'], specs: ['waiting.spec.ts'],
  }));
  const r = spawnSync(process.execPath, [CHECK_ALL, folder], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /Phase 2: GO/);
  assert.match(r.stdout, /still blocked on XY-2-C2/);
});

// ---------------------------------------------------------------- Phase 4 pre-PR run check (--results)
// tests/fixtures/xy-2/runs/ holds real Playwright JSON reports of checkout.spec.js: green, a failure,
// a flaky test (passes only on retry), a single run, and a run filtered with -g.

function runResults(file, extra = []) {
  const s = story();
  return run(['--phase', '4', '--spec', s.p('runs/checkout.spec.js'), '--results', s.p(`runs/${file}`), ...extra]);
}

test('pre-PR: a green run with --repeat-each=3 is GO, parked tests excepted', () => {
  const r = runResults('results-green.json');
  GO(r, 4);
  assert.match(r.out, /Run: --repeat-each=3; 2 test\(s\) passed every run, 1 parked/);
});

test('pre-PR: a failing test is NO-GO and the error shows expected vs. received', () => {
  NOGO(runResults('results-fail.json'),
    /"XY-2: Verify an invalid code shows an error \(Negative\)" failed in 3 of 3 runs\. First error: .*Expected: "Code not recognised" \| Received: "Code not found"/);
});

test('pre-PR: a flaky test (passes only on retry) is NO-GO', () => {
  NOGO(runResults('results-flaky.json'), /is flaky \(passed only on retry in 3 of 3 runs\)\. Find the cause before the PR; do not raise retries/);
});

test('pre-PR: a run with fewer than 3 repeats is NO-GO', () => {
  NOGO(runResults('results-once.json'), /the run used --repeat-each=1\. Run every spec at least 3 times/);
});

test('pre-PR: a filtered run that skips tests in the spec is NO-GO', () => {
  const r = runResults('results-filtered.json');
  NOGO(r, /"XY-2: Verify an invalid code shows an error \(Negative\)" \(.*checkout\.spec\.js\) is not in the run/);
  assert.match(r.out, /"XY-2: Verify the total is unchanged after an invalid code \(Negative\)" .* is not in the run/);
});

test('pre-PR: a spec edited after the run gets a re-run warning', () => {
  // The fixtures were copied after the runs, so every spec is newer than its results.
  assert.match(runResults('results-green.json').out, /WARN +Results: .*checkout\.spec\.js was edited after this run started/);
});

test('pre-PR: a test renamed after the run is NO-GO (not in the run) and the old name is a warning', () => {
  const s = story();
  s.write('runs/checkout.spec.js', s.read('runs/checkout.spec.js').replace('reduces the total by 10%', 'takes 10% off the total'));
  const r = run(['--phase', '4', '--spec', s.p('runs/checkout.spec.js'), '--results', s.p('runs/results-green.json')]);
  NOGO(r, /"XY-2: Verify a valid code takes 10% off the total" .* is not in the run/);
  assert.match(r.out, /WARN +Results: "XY-2: Verify a valid code reduces the total by 10%" is in the run but not in the specs/);
});

test('pre-PR: a file that is not a Playwright JSON report is NO-GO', () => {
  const s = story();
  s.write('runs/not-a-report.json', '{"hello": "world"}');
  NOGO(run(['--phase', '4', '--spec', s.p('runs/checkout.spec.js'), '--results', s.p('runs/not-a-report.json')]), /not a Playwright JSON report/);
});

test('pre-PR: a results file saved as UTF-16 by Windows PowerShell is read correctly', () => {
  const s = story();
  const utf8 = s.read('runs/results-green.json');
  writeFileSync(s.p('runs/results-utf16.json'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(utf8, 'utf16le')]));
  GO(run(['--phase', '4', '--spec', s.p('runs/checkout.spec.js'), '--results', s.p('runs/results-utf16.json')]), 4);
});
