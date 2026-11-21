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
