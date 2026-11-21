<!-- Copy this file into your Playwright TEST repo at .github/pull_request_template.md.
     GitHub pre-fills every new PR with it. -->

## What this adds

Story: <!-- e.g. SD-102 -->
Specs: <!-- e.g. tests/inventory/inventory.spec.ts -->

## Phase 4 checklist

- [ ] Every case here passed the 4-gate triage (deterministic, driveable, seedable, payback)
- [ ] Test names match the CSV Test Case Names exactly
- [ ] No bare `test()` with a TODO body: each test asserts, or is parked with `test.fixme(true, 'reason')`
- [ ] Selectors live in page objects; fragile ones marked `// SELECTOR_DEBT`
- [ ] Gate C: every line of the code was reviewed before it was saved
- [ ] Gate D: every failure was decided (fixed, parked as a defect with its ID, or investigated); no test was weakened to pass
- [ ] Gate E: type check and lint clean; specs run 3 times with `--repeat-each=3 --reporter=json`; `prep-check --phase 4 --results` prints GO
- [ ] Gate E report pasted below (commands, results, parked tests and why)
- [ ] Green in CI on this branch
- [ ] `COVERAGE.md` row(s) and tally updated in this same PR
- [ ] Manual siblings filed with the `MANUAL — ` prefix
- [ ] Branch is current with `main`

## Gate E report

<!-- Paste the prep-check output (including the "Run:" line) and the list of parked tests with their reasons. -->

## Reviewer

Do not self-merge. A designated reviewer approves and merges.
