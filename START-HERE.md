# START HERE

New to the QA Sprint Prep Cycle? Open **`QA-sprint-prep-cycle.md`**: that's the
standard. Its "START HERE" box tells you your first three actions when a story
is assigned to you. For a finished worked example, open `examples/saucedemo/`.

This folder is a self-contained kit. Keep everything in it together:

- `QA-sprint-prep-cycle.md`: the standard (the map; read this first)
- `Phase 1 - Test Case Development/`: Phase 1 prompt
- `Phase 2 - AC Traceability Mapping/`: Phase 2 prompt
- `Phase 3 - Spec Clarification & Refinement/`: Phase 3 prompt
- `Phase 4 - Automation Skeletons/`: Phase 4 skeleton prompt + `automation-in-execution.md` (the Phase 4 guide)
- `tools/prep-check.mjs`: exit-gate checker for Phases 1–3. Needs Node 18+, no install:
  `node tools/prep-check.mjs --phase 1 --csv <cases.csv>`
  (Phases 2 and 3 also take `--trace <story>-traceability.json`.)
- `examples/saucedemo/`: one full sample run against the public SauceDemo site
- `LESSONS.md`: running log of what each story taught you
