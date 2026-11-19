# Coverage matrix

Copy this file into your **test repo** as `COVERAGE.md`. It is the team's single
list of what is automated, what is parked, and what stays manual.

**Rule:** a spec and its matrix row go in the **same commit**. A PR that adds or
changes a spec without updating this file is not ready for review.

## Tally

| Area | Automated | Parked (`fixme`) | Backlog | Manual |
|---|---|---|---|---|
| <Area> | 0 | 0 | 0 | 0 |
| **Total** | **0** | **0** | **0** | **0** |

## Matrix

Status values: `Automated` (merged, passing) · `Parked` (skeleton, assertion
parked with `test.fixme`) · `Backlog` (passed triage, needs plumbing first) ·
`Manual` (failed a triage gate; filed with the `MANUAL — ` prefix).

Example rows from the SauceDemo run:

| Story | Test Case Name (exact, from the CSV) | Status | Spec file | Reason / blocker | Owner |
|---|---|---|---|---|---|
| SD-102 | SD-102: Verify Price (low to high) orders products by ascending price | Parked | `tests/inventory/inventory.spec.ts` | Assertions not written yet | |
| SD-102 | MANUAL — SD-102: Verify inventory layout at 375px width | Manual | — | Visual judgment: fails "deterministic outcome" | |
