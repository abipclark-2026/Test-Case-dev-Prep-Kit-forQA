# SD-102 — Coverage questions (Phase 1, Gate 0 + Gate A)

> This is a **sample**. The "answers" below were written for the demo to show
> what the gates look like; they are not from a real project.

## Scope (Gate 0)

- **Inputs check:** Preconditions and AC pasted verbatim for SD-102. The assistant
  echoed back **14 AC lines** (A1, A2, A3, A3a, A3b, A4, A4a, A4b, A5, A6, A7, A8,
  A8a, A9) and the first line of each. Confirmed: that is the whole story.
- **Scope:** `[Answer]: C` — one story, SD-102.
- **Who owns the rest:** SD-101, SD-103, SD-104: `[Answer]:` unassigned (demo).
- **Shared AC:** the cart badge also appears in SD-103 (A3). `[Answer]: A` — I own
  the inventory-side badge cases; SD-103 references them.
- **Output:** one CSV per story.

## Ambiguity pass (before any case)

| AC | Vague or missing | Becomes |
|---|---|---|
| A3 | "immediately" is not measurable | Q2 |
| A3b | no tie-break rule; two products cost $15.99 | Q1 |
| A2 / A6 | silent on whether the sort survives navigation | Q3 |
| A9 | "responsive" has no pass criterion beyond a width | triage → manual |

## Variant matrix (Gate A)

| Variant | Proposed call | Reason |
|---|---|---|
| standard_user | Covered | The AC are written for this user. |
| locked_out_user | N/A | Cannot log in; never reaches the inventory page (SD-101). |
| problem_user | Unsure → Deferred | May behave differently on this page; needs a ruling. |
| performance_glitch_user | N/A (guess) | Assumed same as standard_user once logged in; re-check live. |
| error_user | Unsure → Deferred | May behave differently; needs a ruling. |
| visual_user | Unsure → Deferred | Visual differences are a manual check. |

## Edge-case candidates

| Category | Edge | Call |
|---|---|---|
| boundary | badge at 6 (all products added) | planned |
| boundary | badge after last removal (empty) | planned |
| boundary | two products with the same price | planned |
| empty-or-invalid-input | no free-text input on this page | skipped (no such input) |
| role-or-permission | logged-out direct access | planned |
| state-or-timing | cart across detail navigation | planned |
| state-or-timing | sort state after navigation (**not in the AC**) | planned |
| interaction | sorting with items already in the cart | planned |

## Questions

1. Prices tie at $15.99. In a price sort, how should equal prices be ordered?
   A) Name (A to Z)  B) Stable, whatever the previous order was  C) Not defined,
   don't assert  X) Other. `[Answer]: A`
2. What does "immediately" mean for A3? A) In place, no page reload  B) Within a
   set time (give it)  C) Don't know, flag it. `[Answer]: A`
3. After Price (high to low) → detail page → Back to products, which sort is
   selected? A) Still Price (high to low)  B) Resets to Name (A to Z)  C) Don't
   know. `[Answer]: C`, then clarified in Phase 3 (log Q3).
4. Should problem_user, error_user and visual_user be covered in this story? A)
   Yes, separate cases  B) No, one shared case  C) Defer to a separate story.
   `[Answer]: C` → SD-110.
