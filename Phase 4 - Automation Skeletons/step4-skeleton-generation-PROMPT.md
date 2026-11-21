# Phase 4 — Skeleton Generation (Reusable Prompt)

**Where this fits:** Phase 4 of the QA Sprint Prep Cycle (`../QA-sprint-prep-cycle.md`).
Phase 4 is a *workflow*, not a single task: triage → **skeleton** → body →
validate → promote. **This prompt covers only the SKELETON step.** The judgment
and run steps around it are human work and live in the guide beside this file,
`automation-in-execution.md`. Read that first; this prompt assumes you've already
triaged (decided which cases are worth automating) and are ready to scaffold
them.

A **skeleton** is a complete, parked spec: it compiles, it's shaped per your
repo's conventions, every case carries its intent from the CSV, and every
assertion you can't write yet is **parked** (`test.fixme(true, 'reason')`) so
nothing passes blank. It's what you can build *before* the feature is
testable: the Arrange layer can be real; the Assert layer waits.

A finished example is `../examples/saucedemo/skeleton/inventory.spec.ts`.

---

## What you give the agent

1. **The Phase 1 CSV** (and, if it helps, the Phase 2 Coverage Map) for the
   story: the cases you triaged as "automate."
2. **Which cases to skeleton**: the automate-now set from triage (not the manual
   ones, not the backlog ones). Name them, or say "all automate-tagged rows."
3. **Story + epic ids and titles.**
4. **Target spec path**, e.g. `tests/<area>/<flow>.spec.ts` (one file per flow).
5. **Fixture + helper context**: your page objects, login helper, and any seed
   helpers the Arrange layer should use. If unknown, the agent leaves a
   clearly-marked `IMPORT_DEBT` placeholder rather than guessing.
6. **Is the feature testable yet?** If no, ALL assertions are parked and this is
   a pure skeleton. If yes, say which cases can also get a real Assert layer now.

## What you get back

One or more `.spec.ts` **skeleton** files at the target path: compiling,
convention-correct, populated from the CSV, assertions parked. Nothing is a bare
`test()` with a TODO body.

---

## The anatomy to produce

Placeholders in `<ANGLE BRACKETS>` get filled from the inputs.

```typescript
import { test, expect } from '@playwright/test';   // or your project's own fixture module
// Arrange-layer helpers for THIS story (leave as IMPORT_DEBT if unknown):
// import { <PAGE-OBJECTS-AND-HELPERS> } from '<HELPER-IMPORT-PATH>';

/**
 * Intent:         <what this spec verifies, from the story>.
 * Why it matters: <the risk if it breaks>.
 * Oracle:         <how the result is checked: UI read, API read; "TBD until feature lands" is OK>.
 * Isolation:      <preconditions + teardown>.
 * Stories:        <STORY-ID> (<short label>).
 */
test.describe('<Area> - <Behavior> (<STORY-ID>)', () => {

  test.beforeEach(async ({ page }) => {
    // Arrange-layer setup the whole file shares. Real code is allowed here
    // even before the feature lands; it is the Assert that waits.
  });

  test('<case name exactly as the CSV Test Case Name>', {
    annotation: [
      { type: 'preconditions',   description: '<CSV Preconditions, condensed to one line>' },
      { type: 'expectedResult',  description: '<CSV Expected Result>' },
    ],
  }, async ({ page }) => {
    test.setTimeout(<MS>); // per-test, in-spec; not a global config change

    await test.step('<CSV step 1>', async () => { /* Arrange / Act */ });
    await test.step('<CSV step 2>', async () => { /* Act */ });

    // Assert: park what you can't write yet.
    test.fixme(true, 'blocked on <FEATURE/STORY> landing');
  });
});
```

---

## Prompt to give the agent

> **Task:** Generate Playwright **spec skeletons** from a finished Phase 1 CSV for
> the cases I triaged as "automate." Match the anatomy above. Every assertion I
> can't write yet must be PARKED, never left as a bare `test()` with a TODO body.
> Follow the Phase 4 rules in `automation-in-execution.md`.
>
> **Inputs I'm providing:**
> - Phase 1 CSV (+ Coverage Map if useful): `<PATH or pasted>`
> - Cases to skeleton (the automate-now set): `<list, or "all automate-tagged rows">`
> - Story id + title: `<STORY-ID: title>`
> - Epic id + title: `<EPIC-ID epic title>`
> - Target spec path(s): `<tests/AREA/FLOW.spec.ts>`
> - Fixture import: `<FIXTURE-IMPORT-PATH>`
> - Arrange-layer helpers (if known): `<HELPERS from PATH>`
> - Feature testable yet? `<yes/no — if no, park ALL assertions>`
>
> **Steps to follow:**
>
> 1. **Read the whole CSV** (past any truncation) and take ONLY the cases I named
>    as automate. Ignore manual (`MANUAL — …`) and backlog cases.
>
> 2. **One file per flow**, at the target path. Open each file with the JSDoc
>    intent block (Intent / Why it matters / Oracle / Isolation / Stories). If any
>    import path is unknown, write `// IMPORT_DEBT: <what's needed>` rather than
>    guessing a path.
>
> 3. **One `test()` per CSV row**, named with the CSV's **Test Case Name
>    verbatim** (it's the upsert key for the test-management sync; don't rephrase
>    it). Fill the annotations and `test.step` names straight from that row's CSV
>    columns. This is the artifact seam: the CSV content carries over 1:1.
>
> 4. **Variant/behavior gates go INSIDE the test body**
>    (`test.skip(cond, 'reason')`), never in `beforeAll`/`beforeEach`. Put
>    per-test timeouts in-spec (`test.setTimeout(...)`), never by editing global
>    config.
>
> 5. **Arrange layer: write what you safely can.** If the inputs give you real
>    helpers and the preconditions are seedable, scaffold the Arrange + teardown
>    for real. If not, leave a clearly-labeled `// Arrange: <what to seed>`
>    comment.
>
> 6. **PARK every assertion you can't complete.** If the feature isn't testable
>    yet, end each body with `test.fixme(true, 'blocked on <X>')`. If an entire
>    file is scaffold-only, use `test.describe.skip`. **Never** emit a `test()`
>    whose body has no assertion and no `fixme`. That PASSES green and is
>    recorded as false coverage.
>    **Cases still waiting on a clarification** (their CSV row cites an `Open`
>    ID such as `SD-104-C1`) are always parked with
>    `test.fixme(true, 'blocked on SD-104-C1')`, even when everything else in
>    the file is live. `prep-check --phase 4 --csv <csv> --clarifications <log>`
>    fails any test for a blocked case that is not parked.
>
> 7. **Compile-safety:** the files must typecheck and collect. After writing,
>    report the paths, the test count per file, how many assertions are parked vs.
>    live, and any `IMPORT_DEBT` / `SELECTOR_DEBT` left for the human.
>
> **Do NOT** attempt the body/validate/promote steps: no live selectors beyond
> what's confirmed, no running, no PR. Stop at compiling, parked skeletons.

---

## After the skeleton (handing back to the guide)

1. Write the real **body** with `step5-body-and-validation-PROMPT.md`
   (selectors in page objects; fill the Assert layer when the feature is
   testable). It stops at Gate C (code review) and Gate D (run and error review)
   for every batch.
2. **Validate**: Gate E (3 clean local runs and `prep-check --phase 4 --results`
   GO), then green in CI on the branch.
3. **Promote**: commit + PR → reviewer reviews → reviewer merges to `main`.
4. **Bookkeeping**: coverage-matrix row + tally line in the same commit; cases
   synced to your test-management tool.

---

## Tips

- **The CSV did the hard thinking. Don't redo it.** A good Phase 1 row already
  has the preconditions, steps and expected result; the skeleton just moves them
  in. If a row is thin, fix it in Phase 1, not here.
- **Parked is the whole point pre-feature.** A folder of compiling, parked
  skeletons IS a valid deliverable.
- **Keep the Test Case Name identical** to the CSV / test-management case; a
  rename strands the old case on the next sync.
- **`IMPORT_DEBT` / `SELECTOR_DEBT` are honest markers**, not failures. Better a
  labeled gap the human resolves than a guessed path that silently breaks.
