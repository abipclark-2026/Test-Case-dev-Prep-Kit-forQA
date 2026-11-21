#!/usr/bin/env node
/**
 * check-all — run prep-check on every story folder in the repo.
 *
 * Needs only Node 18+. No install, no dependencies.
 *
 *   node tools/check-all.mjs              # checks stories/* and examples/*
 *   node tools/check-all.mjs stories/SD-201   # checks one folder
 *
 * A story folder is any folder that contains a story.json:
 * {
 *   "story": "SD-102",
 *   "phase": 3,                                  // the gate this story must pass right now
 *   "csv":   "SD-102-inventory-test-cases.csv",  // relative to the folder
 *   "trace": "SD-102-traceability.json",         // needed for phase 2 and 3
 *   "ac":    "SD-102-acceptance-criteria.md",    // the AC as pasted; required from phase 3
 *   "variants": ["admin", "editor"],             // required from phase 3; [] if none apply
 *   "specs": ["skeleton/inventory.spec.ts"]      // optional; Phase 4 check on these files
 * }
 *
 * Exit code 0 = every story GO, 1 = at least one NO-GO, 2 = a story.json is broken.
 * In GitHub Actions it also writes a results table to the job summary.
 */
import { readFileSync, readdirSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const prepCheck = join(root, 'tools', 'prep-check.mjs');

function findStoryFolders(dir, depth = 0) {
  if (!existsSync(dir) || depth > 3) return [];
  const found = existsSync(join(dir, 'story.json')) ? [dir] : [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_') && entry.name !== 'node_modules') {
      found.push(...findStoryFolders(join(dir, entry.name), depth + 1));
    }
  }
  return found;
}

const targets = process.argv.slice(2);
const folders = targets.length
  ? targets.map((t) => resolve(t))
  : [...findStoryFolders(join(root, 'stories')), ...findStoryFolders(join(root, 'examples'))];

if (!folders.length) {
  console.log('No story folders found (a story folder contains a story.json). Nothing to check.');
  process.exit(0);
}

const results = [];
let broken = false;

for (const folder of folders) {
  const label = relative(root, folder) || '.';
  let story;
  try {
    story = JSON.parse(readFileSync(join(folder, 'story.json'), 'utf8'));
  } catch (e) {
    console.error(`\n✗ ${label}: cannot read story.json (${e.message})`);
    results.push({ label, story: '?', phase: '?', verdict: 'BROKEN' });
    broken = true;
    continue;
  }
  const phase = Number(story.phase);
  if (![1, 2, 3].includes(phase) || !story.csv || (phase > 1 && !story.trace)) {
    console.error(`\n✗ ${label}: story.json needs "phase" (1-3), "csv", and "trace" for phase 2 or 3`);
    results.push({ label, story: story.story ?? '?', phase: story.phase ?? '?', verdict: 'BROKEN' });
    broken = true;
    continue;
  }

  const args = [prepCheck, '--phase', String(phase), '--csv', join(folder, story.csv)];
  if (phase > 1) args.push('--trace', join(folder, story.trace));
  if (story.ac) args.push('--ac', join(folder, story.ac));
  if (Array.isArray(story.variants)) args.push('--variants', story.variants.length ? story.variants.join(',') : 'none');

  console.log(`\n=== ${story.story ?? label} (${label}) — Phase ${phase} gate ===`);
  const run = spawnSync(process.execPath, args, { encoding: 'utf8' });
  process.stdout.write(run.stdout ?? '');
  process.stderr.write(run.stderr ?? '');
  let verdict = run.status === 0 ? 'GO' : run.status === 1 ? 'NO-GO' : 'BROKEN';

  if (Array.isArray(story.specs) && story.specs.length) {
    console.log(`--- ${story.story ?? label}: Phase 4 spec check ---`);
    const specRun = spawnSync(process.execPath, [prepCheck, '--phase', '4', '--spec', story.specs.map((f) => join(folder, f)).join(',')], { encoding: 'utf8' });
    process.stdout.write(specRun.stdout ?? '');
    process.stderr.write(specRun.stderr ?? '');
    if (specRun.status === 2) verdict = 'BROKEN';
    else if (specRun.status !== 0 && verdict === 'GO') verdict = 'NO-GO';
  }
  if (verdict === 'BROKEN') broken = true;
  results.push({ label, story: story.story ?? '?', phase, verdict });
}

const failed = results.filter((r) => r.verdict !== 'GO');
console.log(`\n${results.length} story folder(s): ${results.length - failed.length} GO, ${failed.length} not GO`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const icon = { GO: '✅', 'NO-GO': '❌', BROKEN: '⚠️' };
  const table = [
    '## Prep-check results',
    '',
    '| Story | Folder | Gate | Verdict |',
    '|---|---|---|---|',
    ...results.map((r) => `| ${r.story} | \`${r.label}\` | Phase ${r.phase} | ${icon[r.verdict]} ${r.verdict} |`),
    '',
  ].join('\n');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, table + '\n');
}

process.exit(broken ? 2 : failed.length ? 1 : 0);
