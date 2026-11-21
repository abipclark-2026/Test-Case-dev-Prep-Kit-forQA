# SD-102 — Test Case → Acceptance Criteria Map

**Story:** SD-102 Browse and sort the product inventory  ·  **Epic:** SD-100 SauceDemo Shopping Flow
**Phase 2 output.** 20 cases, 14 AC lines, 13 covered, 1 waived, 0 open gaps (after the loop-back below).

## What this story is

The first screen after login. A user sees six products, can sort them four
ways, and can add or remove items from a cart that shows a count badge. It is a
**UI/workflow story** with one small calculation-like rule (price sorting is
numeric, not alphabetic). Login (SD-101), the cart page (SD-103) and checkout
(SD-104) are sibling stories; this map only covers the inventory page.

## The one decision flow

```
logged in as standard_user ──► inventory page (Name A→Z by default)
        │
        ├─ choose sort option ──► list reorders in place (A3)
        │       ├─ Name options  → alphabetical by name (A3a)
        │       └─ Price options → numeric by price; ties → Name A→Z (A3b, SD-102-C1)
        │
        ├─ Add to cart ──► button → "Remove", badge +1 (A4)
        │       └─ Remove ──► button → "Add to cart", badge −1 (A4a)
        │             └─ cart now empty → no badge at all (A4b)
        │
        ├─ click product name ──► detail page ──► Back to products (A5)
        │       └─ cart kept; sort resets to default (A6, SD-102-C3)
        │
        ├─ cart icon ──► cart page (A7)
        └─ menu → Logout ──► login page (A8)
                └─ open /inventory.html while logged out ──► login page + error (A8a)
```

## Acceptance criteria (numbered)

| ID | Text |
|---|---|
| A1 | Inventory page shows title "Products" and 6 products; each has image, name, description, price, "Add to cart". |
| A2 | Sort control offers Name (A to Z), Name (Z to A), Price (low to high), Price (high to low); default Name (A to Z). |
| A3 | Selecting a sort option reorders the list immediately. |
| A3a | Name options order alphabetically by product name. |
| A3b | Price options order numerically by price. |
| A4 | "Add to cart" turns the button into "Remove" and increases the badge by 1. |
| A4a | "Remove" restores "Add to cart" and decreases the badge by 1. |
| A4b | Empty cart → no badge on the cart icon. |
| A5 | Product name opens its detail page (name, description, price); "Back to products" returns. |
| A6 | Cart contents persist between inventory and detail pages. |
| A7 | Cart icon opens the cart page. |
| A8 | Logout from the menu returns to the login page. |
| A8a | Logged-out direct access to the inventory address stays on login with an access error. |
| A9 | Layout is responsive down to a 375px viewport. |

## Test Case Mapping (CSV order)

| # | Test case (short name) | AC line(s) | What it proves |
|---|---|---|---|
| 1 | Verify inventory page shows title and six products with image, name, description, price… | A1 | Page content and product count |
| 2 | Verify sort control lists four options and defaults to Name (A to Z) | A2 | Sort options and default |
| 3 | Verify Name (A to Z) orders products alphabetically | A3, A3a | Name ascending |
| 4 | Verify Name (Z to A) orders products reverse alphabetically | A3, A3a | Name descending |
| 5 | Verify Price (low to high) orders products by ascending price | A3, A3b | Price ascending (numeric, not text) |
| 6 | Verify Price (high to low) orders products by descending price | A3, A3b | Price descending |
| 7 | Verify products with equal prices fall back to Name (A to Z) order (boundary - price tie) | A3b | Tie-break rule (answer in clarification SD-102-C1) |
| 8 | Verify selecting a sort option reorders the list without leaving the page | A3 | "Immediately" made testable |
| 9 | Verify Add to cart changes the button to Remove and shows a cart badge of 1 | A4 | Add flow |
| 10 | Verify cart badge counts up to 6 when all products are added (boundary - maximum) | A4 | Badge at the maximum |
| 11 | Verify Remove changes the button back to Add to cart and decreases the badge | A4, A4a | Remove flow |
| 12 | Verify no cart badge is shown after the last item is removed (boundary - empty cart) | A4b | Empty-cart badge (gap found in Phase 2) |
| 13 | Verify clicking a product name opens its detail page with name, description and price | A5 | Detail navigation |
| 14 | Verify Back to products returns to the inventory page | A5 | Back navigation |
| 15 | Verify cart contents persist between inventory and product detail pages | A6 | Cart persistence while navigating |
| 16 | Verify clicking the cart icon opens the cart page | A7 | Cart navigation |
| 17 | Verify Logout returns the user to the login page | A8 | Logout |
| 18 | Verify a logged-out user cannot open the inventory page directly (Negative) | A8a | Access control (gap found in Phase 2) |
| 19 | Verify sorting keeps the Remove state of items already in the cart (interaction) | A3, A4 | Sort does not disturb cart state |
| 20 | Verify the sort option resets to Name (A to Z) after returning from a product detail page (state) | A2, A3 | Sort state after navigation |

Every case cites at least one AC line. No stray cases.

## Coverage Gaps

**First pass (Phase 2):** the Phase 1 draft had 15 cases. The two-way check found:

| AC | What was missing | Priority | Resolution |
|---|---|---|---|
| A4b | No case for the empty-cart badge | HIGH (conditional/boundary rule) | Looped back to Phase 1 → case 12 |
| A8a | No negative case for logged-out direct access | HIGH (access control) | Looped back to Phase 1 → case 18 |
| A9 | Responsive layout is a visual judgment | LOW | **Waived** with reason (fails the triage gate "deterministic outcome"); filed as `MANUAL — SD-102: Verify inventory layout at 375px width` |

**After the loop-back:** 0 open gaps. Cases 8 and 20 were added later in Phase 3
from clarification answers (see `SD-102-clarification-log.md`); the map above is
the re-mapped final version.

## Flags for the spec author (flag, don't fix)

- **A3 "immediately"** is not testable as written. → Q2.
- **A3b** does not say what happens when two products share a price (two do, at $15.99). → Q1.
- **A2 / A6** do not say whether the sort choice survives a trip to a detail page. → Q3.

## How to step through any case

1. Which user type? (Only `standard_user` is in scope here; see the variant decisions.)
2. Is the user logged in? If not, expect the login page (A8a).
3. What is the current sort option and cart state before the action?
4. Perform the action; compare the list order, the button label and the badge.
5. Assert exactly the visible outcome in the Expected Result, nothing more.

## Grouping

| Concept | Cases |
|---|---|
| Page content and defaults | 1, 2 |
| Sorting by name | 3, 4 |
| Sorting by price (incl. ties) | 5, 6, 7 |
| Sort behavior and state | 8, 19, 20 |
| Cart add / remove / badge | 9, 10, 11, 12 |
| Navigation (detail, back, cart) | 13, 14, 15, 16 |
| Session (logout, access control) | 17, 18 |
