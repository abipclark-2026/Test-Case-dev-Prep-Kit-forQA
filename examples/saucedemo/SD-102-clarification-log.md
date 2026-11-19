# SD-102 — Clarification log (Phase 3)

> **Sample.** The spec-author answers are invented for the demo to show how the
> log, the routing and the ambiguity pass work.

| # | Question | Raised in | Who answered | Answer | Route | What changed |
|---|---|---|---|---|---|---|
| Q1 | How are equal prices ordered in a price sort? | Phase 1, Gate A | Spec author (sample) | "Fall back to Name (A to Z), in both price directions." | add/remove a case | Added case 7 (tie order); updated cases 5 and 6 expected prices to show the tie pair; "confirm with spec author" note closed. |
| Q2 | What does "immediately" mean in A3? | Phase 1, ambiguity pass | Spec author (sample) | "The list reorders in place. No page navigation." | add/remove a case | Added case 8 (reorder without leaving the page). A3 wording unchanged. |
| Q3 | Does the sort option survive a trip to a detail page? | Phase 1, Gate A | Spec author (sample) | First answer: "Probably resets, I think." **Ambiguity pass hit:** "probably", "I think". Follow-up sent: "Please confirm: is Name (A to Z) selected after Back to products?" Second answer: "Yes. It always returns to Name (A to Z)." | add/remove a case | Added case 20 (sort resets after detail → back). |
| Q4 | Should problem_user, error_user, visual_user be covered here? | Phase 1, Gate A | Product owner (sample) | "Not in this story. Track as SD-110." | no change | Variant decisions recorded as Deferred → SD-110. |
| Q5 | Is cart persistence across logout in scope (A6)? | Phase 3 | Spec author (sample) | "No. A6 is only about moving between the inventory and detail pages." | wording | No case added; A6 stays as written. |

## Routing summary

- **Wording only:** 1 (Q5)
- **Add/remove a case (Phase 1 work inside Phase 3):** 3 (Q1, Q2, Q3)
- **Behavior or AC change (needs a Phase 2 re-map):** 0
- **Waived AC lines:** A9 (visual layout check; manual sibling filed)

## Renames

None. Test Case Names are unchanged since the Phase 1 CSV.

## Lessons to consider (copy into LESSONS.md if you agree)

- Boundary rules on a screen that sorts (ties) are rarely in the AC. Ask in Gate A.
- A first answer that contains "probably" is a prompt for a follow-up, not a close.
