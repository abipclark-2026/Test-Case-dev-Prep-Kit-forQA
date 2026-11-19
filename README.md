# QA Sprint Prep Cycle Kit

A set of reusable AI prompts and a small checker script that turn a user story's
acceptance criteria into reviewed test cases, a list of spec gaps and
clarification questions, and a short list of automation candidates.

The worked example uses the public demo shop [SauceDemo](https://www.saucedemo.com/).

## The problem it solves

Test cases written straight from a ticket tend to have the same problems:

- **Coverage is a guess.** Nobody can say which acceptance-criteria line a case
  proves, or which lines have no case at all.
- **Spec gaps surface late.** Vague wording ("immediately", "as appropriate") and
  missing rules (what happens on a price tie?) are found during execution, when
  they are expensive to fix.
- **Automation starts from nothing.** Engineers re-derive the preconditions,
  steps and expected results that the manual cases already contain, or they
  automate everything and end up with a flaky suite.
- **"Done" is subjective.** There is no checkable gate between drafting cases and
  using them.

This kit puts a fixed workflow, explicit review gates and a mechanical checker
around that process. You still make the judgment calls; the kit makes sure they
are made, written down and checkable.

## How it works

```
Acceptance criteria
        │
        ▼
Phase 0  Entry check ─ is the story testable and the AC stable?
        │
        ▼
Phase 1  Test cases ─── 7-column CSV, one case per AC line + boundaries/negatives/variants
        │                (stops for your answers at Gate 0, Gate A, Gate B)
        ▼
Phase 2  Traceability ─ every case ↔ AC line, ranked gap table      ◄─ gaps loop back to Phase 1
        │
        ▼
Phase 3  Clarification ─ spec questions answered and logged, gaps filled or waived with a reason
        │                                                           ◄─ behavior changes loop back to Phase 2
        ▼
Phase 4  Automation ─── triage (what NOT to automate) → parked skeleton specs → PR
```

- **Acceptance criteria → test cases:** Phase 1. An AI assistant drafts cases
  from your pasted AC, but only after you confirm scope (Gate 0), coverage
  decisions (Gate A) and the drafted cases themselves (Gate B).
- **Test cases → spec gaps and clarification questions:** Phases 2 and 3. Every
  AC line is mapped to cases; unmapped lines become ranked gaps. Vague wording is
  caught by an "ambiguity pass" and becomes a logged clarification question.
- **Spec gaps → automation candidates:** Phase 4. A four-gate triage decides what
  is worth automating; survivors become compiling Playwright skeletons whose
  unfinished assertions are parked with `test.fixme`, never left blank.
- **`tools/prep-check.mjs`** checks the mechanical half of each gate (CSV shape,
  duplicate names, AC coverage, a decision for every variant and edge category,
  no bare waivers). It prints GO or NO-GO.

## How to use it

You need Node 18+ (for the checker) and any AI assistant that accepts a pasted
prompt. Playwright is only needed if you carry on to Phase 4.

1. **Read** `START-HERE.md`, then `QA-sprint-prep-cycle.md` (the map).
2. **Phase 0.** Answer the four showstopper questions in the checklist.
3. **Phase 1.** Open `Phase 1 - Test Case Development/…-PROMPT.md`. Paste the
   "Prompt to give the agent" into your assistant and fill the placeholders,
   pasting your acceptance criteria **verbatim**. Answer the three stop-and-ask
   gates. Save the CSV, then run:
   `node tools/prep-check.mjs --phase 1 --csv <cases.csv>`
4. **Phase 2.** Use the Phase 2 prompt with the CSV and the AC. It produces a
   coverage map and `<STORY>-traceability.json`. Run:
   `node tools/prep-check.mjs --phase 2 --csv <cases.csv> --trace <traceability.json>`
   Send any gaps back to Phase 1.
5. **Phase 3.** Raise the spec questions with whoever owns the spec, then use the
   Phase 3 prompt to apply the answers, fill or waive gaps and write the
   clarification log. Run `--phase 3` until it prints GO. This gate refuses open
   gaps, bare waivers and unresolved "confirm with spec author" notes.
6. **Phase 4.** Triage with `automation-in-execution.md`, then use the skeleton
   prompt for the cases you chose to automate.
7. **Log what you learned** in `LESSONS.md`.

`prep-check` defaults to SauceDemo's six user types as the "variants" every story
must make a decision about. For your own product, pass your list:
`--variants admin,editor,viewer`.

## Team setup: one shared home, no single machine

The kit is meant to run as a team process, so nothing should live only on one
person's laptop. It uses two repos:

| Repo | Holds | CI check |
|---|---|---|
| **This kit repo** | Prompts, checker, and every story's Phase 1–3 output in `stories/<STORY-ID>/` | `prep-check` workflow: every story folder must pass the gate its `story.json` names |
| **Your Playwright test repo** | Specs, page objects, `COVERAGE.md` | `playwright` workflow: type check + full suite on a clean machine |

How a story moves through it:

1. Copy `templates/story.json` into `stories/<STORY-ID>/`, work the phases, and
   save every artifact there. Open a PR; CI runs
   `node tools/check-all.mjs` and blocks the merge on NO-GO.
2. Phase 4 specs go to the test repo on a branch. Copy
   `templates/test-repo/.github/` into that repo once: it adds the CI workflow
   and a PR checklist. Copy `templates/coverage-matrix.md` in as `COVERAGE.md`.
3. Protect `main` in both repos (require a PR, one approval and a passing check).
   That turns "a reviewer merges, never self-merge" from a rule into a setting.

Anyone can pick up anyone's story, because the CSV, traceability file and
clarification log are all in the shared repo with their history.

## Example: SauceDemo

The full sample run is in [`examples/saucedemo/`](examples/saucedemo/). It
processes one story, **SD-102 Browse and sort the product inventory**, through
every phase. Input for the other three areas (login, cart, checkout) is also
provided.

> **Honesty note.** The acceptance criteria and the "spec author" answers were
> written for this demo. The expected results follow SauceDemo's publicly
> documented behavior but **have not been executed** against the live site, and
> the Phase 4 skeleton has not been run. Confirm them on the site before relying
> on them.

### Example input

From [`00-input-acceptance-criteria.md`](examples/saucedemo/00-input-acceptance-criteria.md):

```
SD-102: Browse and sort the product inventory
Preconditions: logged in as standard_user; inventory page displayed.

A2. A sort control offers four options: Name (A to Z), Name (Z to A),
    Price (low to high), Price (high to low). The default is Name (A to Z).
A3. Selecting a sort option reorders the product list immediately.
  A3a. The two Name options order products alphabetically by product name.
  A3b. The two Price options order products numerically by price.
A4. Clicking "Add to cart" changes that button to "Remove" and increases the
    cart badge count by 1.
  A4b. When the cart is empty, no badge is shown on the cart icon.
… (14 AC lines in total)
```

### Example output

| File | What it shows |
|---|---|
| [`SD-102-coverage-questions.md`](examples/saucedemo/SD-102-coverage-questions.md) | Gates 0 and A: scope, ambiguity pass, variant matrix, edge candidates |
| [`SD-102-inventory-test-cases.csv`](examples/saucedemo/SD-102-inventory-test-cases.csv) | 20 test cases in the 7-column format |
| [`SD-102-testcase-to-AC-map.md`](examples/saucedemo/SD-102-testcase-to-AC-map.md) | Case ↔ AC map, the two gaps Phase 2 found, grouping |
| [`SD-102-traceability.json`](examples/saucedemo/SD-102-traceability.json) | Machine-checked twin of the map, with variant and edge decisions |
| [`SD-102-clarification-log.md`](examples/saucedemo/SD-102-clarification-log.md) | Five spec questions, how each was routed, one vague answer caught |
| [`SD-102-readiness-report.md`](examples/saucedemo/SD-102-readiness-report.md) | GO verdict plus the real `prep-check` output |
| [`skeleton/inventory.spec.ts`](examples/saucedemo/skeleton/inventory.spec.ts) | Four parked Playwright skeletons built from the CSV |

One case row from the CSV:

```
SD-100 SauceDemo Shopping Flow,
SD-102: Verify products with equal prices fall back to Name (A to Z) order (boundary - price tie),
  Preconditions: 1. Public demo site, logged in as standard_user…  2. Inventory page displayed.
                 3. Two products share the price $15.99: Bolt T-Shirt and Test.allTheThings() T-Shirt (Red).
  Steps:         1. Select Price (low to high).  2. Note the order of the two $15.99 products.
                 3. Select Price (high to low).  4. Note the order of the two $15.99 products again.
  Expected:      1. List reorders.
                 2. Bolt T-Shirt appears before Test.allTheThings() T-Shirt (Name A to Z fallback).
                 3. List reorders.
                 4. Bolt T-Shirt still appears before Test.allTheThings() T-Shirt.
  Spec:          https://www.saucedemo.com/inventory.html     Time: 0:10
```

What the run produced, in numbers: 20 cases for 14 AC lines (13 covered, 1 waived
with a reason); Phase 2 found 2 high-priority gaps in a 15-case draft (the
empty-cart badge and logged-out access); 3 more cases came from clarification
answers; all three `prep-check` gates print GO.

## Impact

Built for and used by a QA team during sprint prep:

- **Test case development went from 2–3 days to about 2 hours per cycle**
- Every acceptance criterion maps to at least one test case or a documented waiver, so coverage can be checked instead of guessed
- Spec gaps and vague wording are caught and logged as clarification questions before development starts, not mid-sprint
- Automation candidates go through a triage step, so only stable, high-value cases get automated

## Repository layout

```
README.md                         this file
START-HERE.md                     orientation
QA-sprint-prep-cycle.md           the standard: phases, gates, guardrails
Phase 1 - Test Case Development/  Phase 1 prompt
Phase 2 - AC Traceability Mapping/ Phase 2 prompt
Phase 3 - Spec Clarification & Refinement/ Phase 3 prompt
Phase 4 - Automation Skeletons/   skeleton prompt + automation guide
tools/prep-check.mjs              GO / NO-GO checker (Node 18+, no dependencies)
tools/check-all.mjs               runs prep-check on every story folder (used by CI)
stories/                          one folder per story: the team's shared prep work
templates/                        story.json, coverage matrix, test-repo CI + PR checklist
.github/workflows/prep-check.yml  CI: blocks a PR when any story is NO-GO
examples/saucedemo/               input and a full sample run
LESSONS.md                        lessons log template
```
