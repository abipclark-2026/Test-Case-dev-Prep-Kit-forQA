# Automation in Execution — a QA onramp

**Who this is for:** any QA engineer who can run a terminal and open a pull
request. You do not need to have written a Playwright spec before.

**What this process is:** while you execute a sprint's test cases manually, you
*also* build automation for the cases worth automating. Once a spec passes
locally and in CI, it goes up as a PR; a reviewer merges it to `main`, which puts
it into regression runs and, once proven, a smoke suite. The goal is a regression
suite that grows with the product instead of a backlog that never gets automated.

**What this process is NOT:** automating every test case. Most of the work here
is *deciding what not to build*. Read "Step 1 — the triage filter" and apply it
honestly; a small suite of high-value specs beats a large flaky one.

---

## The flow at a glance

```
sprint test cases
      │
      ▼
[1] TRIAGE ───────────────► most cases stay MANUAL (file in your test tool, prefix "MANUAL — ")
      │  (4-gate filter)
      ▼  (survivors)
[2] SKELETON ────────────► describe + intent comment + annotations + arrange layer; assertions parked
      │
      ▼
[3] BODY ────────────────► write the assertions; fill in the page-object selectors
      │                     Gate C: review the code   Gate D: review every run's errors
      ▼
[4] VALIDATE ────────────► Gate E: 3 clean local runs + prep-check GO ─► green in CI on the branch
      │
      ▼
[5] PROMOTE ─────────────► commit + PR ─► reviewer reviews ─► reviewer merges to main ─► in regression
```

Steps 1–2 can happen *during* execution, before the feature is even stable:
full skeletons, zero assertions, parked until the feature lands. Step 3 waits for
the feature; steps 4–5 are the promotion bar.

---

## Step 1 — the triage filter (the important part)

For each test case, run the four gates. **Automate only when all four are true.**
If any gate fails, it's a manual case, and that is the correct, expected outcome
for most cases.

| Gate | Automate when… | Leave MANUAL when… |
|---|---|---|
| **Deterministic outcome** | You can assert a concrete thing: exact text, a row that appears, a status, a number | It's a visual/layout "looks right" call, email/PDF rendering, anything judged by eye |
| **Driveable** | Reachable with a login helper and stable selectors (test ids, roles, labels) | Needs physical hardware, an SMS-only flow, or a third-party UI you can't script |
| **Seedable preconditions** | Setup is cheap per run: an API call, a fixture, a feature toggle | One-off migration state, state that only exists in production, or a destructive-in-production action |
| **Payback** | Regression-prone, runs every suite, a human would otherwise re-test it often | The precondition cost dwarfs the value, e.g. a once-a-year check |

### Then rank the survivors by cost

Passing all four gates means a case *can* be automated. This tells you *when*:

- **Automate now**: core happy path, reuses page objects/helpers that already
  exist, deterministic assert. Highest value per hour spent.
- **Automate later (backlog it, don't lose it)**: valuable but needs a new page
  object, a new seeding helper, or account-state plumbing you don't have yet.
  Park it as `test.fixme(true, 'reason: needs X')` or add a gap row to your
  coverage matrix. It's tracked, not forgotten.
- **Leave manual**: you'd spend a day of plumbing to save a two-minute check.

### The one trap — read this before you call anything "can't automate"

> **"Missing preconditions" is NOT the same as "not automatable."**
>
> A flow can look like a broken selector problem for weeks when the real blocker
> is an unconfigured setting or missing test data: a **setup gap to solve**, not a
> reason to file the case manual. Before declaring something un-automatable,
> verify the claim against the live page (open it in a headed browser or use
> Playwright's codegen/inspector). Decide from what the product actually does,
> not from what the test case text implies.

**Output of Step 1:** a short list of cases to skeleton, and everything else
filed as manual cases in your test-management tool with a `MANUAL — ` name prefix
(that prefix keeps an automated case sync from ever colliding with them).

---

## Step 2 — build the skeleton

A skeleton is a complete, parked spec: it compiles, it's shaped correctly, and
every unfinished assertion is explicitly parked so it can't masquerade as a
passing test. Copy this template into `tests/<area>/<flow>.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

/**
 * Intent:         <what this verifies, one sentence>.
 * Why it matters: <the risk if it breaks>.
 * Isolation:      <preconditions + teardown>.
 */
test.describe('<Area> - <Behavior>', () => {   // hyphen, not em dash
  test('user can <behavior>', {
    annotation: [
      { type: 'preconditions',  description: '<what the case needs>' },
      { type: 'expectedResult', description: '<the one thing this case proves>' },
    ],
  }, async ({ page }) => {
    // Arrange: this layer you CAN write now (seed data, log in).

    // Act: drive the UI in test.step(...) blocks so case steps show up in reports.

    // Assert: if you cannot write it yet, park the whole test instead:
    test.fixme(true, 'blocked on <feature> landing');
    // Never leave a bare body with a // TODO. See the guardrails below.
  });
});
```

Why the annotations matter: they carry the CSV's preconditions and expected
result into reports even before the body exists, so the test record is useful
from day one.

---

## Step 3 — write the body

Fill in Act and Assert. Selectors live in a page object, never inline in the
spec. Prefer role, label and test-id locators; where you must use a fragile
selector, mark it `// SELECTOR_DEBT` so it surfaces in cleanup passes.

With an AI assistant, use `step5-body-and-validation-PROMPT.md`. It works in
small batches and stops twice per batch:

- **Gate C — code review, before anything is saved.** You see every change in
  full, a locator table (element, locator, how it was confirmed) and an
  assertion table (each `expect` and the CSV expected result it proves).
- **Gate D — run and error review, after every run.** Each failure comes back
  verbatim with a likely cause (test bug, product bug, environment, don't know)
  and a proposed next step. You choose: apply the fix (back through Gate C),
  park it as a product defect with `test.fixme(true, 'defect <ID>')`, or
  investigate headed / with a trace first.

**A failing test may be the bug report.** Never make it pass by changing the
expected value to whatever the app showed, loosening an assertion, adding
sleeps or retries, or wrapping it in `try/catch`. If the CSV case itself is
wrong, fix it through Phase 3 first, then the test.

---

## Step 4 — validate (the first half of the promotion bar)

1. **Gate E — green locally, 3 runs, checked by the tool.** Before any PR, run
   from the test repo, with the branch current with `main`:
   ```sh
   npx tsc --noEmit
   npx playwright test <all specs for the story> --repeat-each=3 --reporter=json > <STORY>-results.json
   node <kit>/tools/prep-check.mjs --phase 4 --spec <specs> --csv <csv> --clarifications <log> --results <STORY>-results.json
   ```
   `<kit>` is the path to this kit's folder (for example
   `../Test-Case-dev-Prep-Kit-forQA`), or copy `tools/prep-check.mjs` into the
   test repo; it has no dependencies. `prep-check` prints GO only when every
   test in the specs ran, every test that is not parked passed in all 3 runs,
   nothing was flaky, and the run really used `--repeat-each=3`. A spec edited
   after the run gets a warning: re-run so the results match the code. If it
   fails, find the cause; do not paper over it. A flaky test is a failing test.
   Add `*-results.json` to the test repo's `.gitignore`: the results file is
   evidence for the PR description, not something to commit.
2. **Green in CI on the branch.** Push the branch and get one green CI run before
   you ask for review. A spec that only passes on your machine is not done.

Also run the mechanical checks CI will run anyway (type check, lint, branch
freshness against `main`), so review is never the first time you hear about a
problem.

**No CI yet?** Copy `templates/test-repo/.github/` from this kit into your test
repo. It adds a `playwright` workflow (type check + full suite on every PR, with
the HTML report saved to the run) and a PR template carrying the per-case
checklist below. Copy `templates/coverage-matrix.md` in as `COVERAGE.md`.

---

## Step 5 — promote

Local green + CI green → commit and open a PR. **A designated reviewer reviews
it and merges it to `main`.** Merging is what adds the spec to regression runs.
Do not self-merge.

**Smoke promotion:** a newly merged spec rides the normal regression set first.
Once it has run a sprint clean (no flakes) it's earned a place in the smoke
suite. Flag it to the reviewer when you think it's proven; don't tag it as smoke
on day one.

---

## Guardrails (the ones that cause real damage if ignored)

1. **A test proves something or says why it cannot.** A `test()` body reaches an
   assertion, OR it is `test.fixme(true, 'reason')`. A whole scaffold file is
   `test.describe.skip`. **Never a bare `test()` with a `// TODO` body: it
   PASSES, and gets counted as green coverage.** This is the single most
   important rule in this doc.
2. **Wait for a signal, never for time.** Use web-first assertions and polling for
   the value you expect; no fixed sleeps to "let it settle."
3. **Gate per test, not per hook.** `test.skip(cond, 'reason')` goes inside the
   test body. A skip in `beforeAll`/`beforeEach` skips the whole describe.
4. **Dynamic data only.** Create users and records per run with unique names.
   Never depend on a static seed record that someone may delete.
5. **Bookkeeping rides the same commit** as the spec: a coverage-matrix row and a
   tally line in `COVERAGE.md` (template: `templates/coverage-matrix.md`).
6. **Branch current with `main` before you build and before the PR.** Merge
   `main` in; never rebase a shared branch.

---

## Per-case checklist

- [ ] Ran the 4-gate triage filter; this case passed all four (else it's manual)
- [ ] Ranked it: automate now / backlog / manual, and acted accordingly
- [ ] Verified any "can't automate" claim against the live page (the trap)
- [ ] Skeleton: `test.describe` + intent comment + annotations; assertions parked
      with `test.fixme(true, 'reason')` if the feature isn't ready
- [ ] Body written through Gate C (code reviewed) and Gate D (every failure decided)
- [ ] Selectors in the page object; unconfirmed ones marked `// SELECTOR_DEBT`
- [ ] Gate E: 3 local runs with a JSON report; `prep-check --phase 4 --results` GO
- [ ] Type check / lint / freshness clean
- [ ] Green in CI on the branch
- [ ] Coverage-matrix row + tally line in the same commit
- [ ] Manual siblings filed with the `MANUAL — ` prefix
- [ ] PR opened for the reviewer to review and merge
