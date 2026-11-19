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
- [ ] Green locally 3 runs: `npx playwright test <spec> --repeat-each=3`
- [ ] Green in CI on this branch
- [ ] `COVERAGE.md` row(s) and tally updated in this same PR
- [ ] Manual siblings filed with the `MANUAL — ` prefix
- [ ] Branch is current with `main`

## Reviewer

Do not self-merge. A designated reviewer approves and merges.
