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
      │
      ▼
[4] VALIDATE ────────────► green locally (2–3 runs) ─► green in CI on the branch
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

---

## Step 4 — validate (the first half of the promotion bar)

1. **Green locally, 2–3 consecutive runs.** Run it a few times to shake out
   flake:
   ```sh
   npx playwright test tests/<area>/<flow>.spec.ts --repeat-each=3
   ```
   If it fails, find the cause; do not paper over it.
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
- [ ] Body written; selectors in the page object
- [ ] Green locally 2–3 runs
- [ ] Type check / lint / freshness clean
- [ ] Green in CI on the branch
- [ ] Coverage-matrix row + tally line in the same commit
- [ ] Manual siblings filed with the `MANUAL — ` prefix
- [ ] PR opened for the reviewer to review and merge
