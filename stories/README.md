# stories/

One folder per story. This is the team's shared home for prep work: everything
Phases 1–3 produce lives here and goes through a pull request, like code.

```
stories/
  SD-201/
    story.json                      which gate the story must pass right now
    SD-201-acceptance-criteria.md   the AC exactly as pasted (Phase 1)
    SD-201-test-cases.csv           Phase 1
    SD-201-traceability.json        Phase 2 (finished in Phase 3)
    SD-201-coverage-questions.md    Phase 1 Gates 0 and A
    SD-201-testcase-to-AC-map.md    Phase 2
    SD-201-clarification-log.md     Phase 3
    SD-201-readiness-report.md      Phase 3
```

## Starting a story

1. Copy `templates/story.json` into `stories/<STORY-ID>/` and fill it in.
2. Work through the phases. Save each output into the story folder, not on your
   own machine.
3. As you finish each phase, raise `"phase"` in `story.json` to that number and
   open (or update) a PR.

## What CI does

Every PR runs `node tools/check-all.mjs`. It finds each folder with a
`story.json` and runs `prep-check` at the phase that file names. A NO-GO story
fails the check, so the PR can't merge until the gap is filled or waived with a
reason. You can run the same command locally before you push.

The worked example lives in `examples/saucedemo/` and is checked the same way.
