# SauceDemo — example input (acceptance criteria)

Epic: **SD-100 SauceDemo Shopping Flow**
Target: the public demo shop at https://www.saucedemo.com/

These stories and acceptance criteria were **written for this demo**. They
describe the publicly documented behavior of the demo shop; they are not copied
from any real project. The IDs (`SD-1xx`) are made up. The sample run in this
folder processes **SD-102** end to end; the other three are provided as ready
inputs so you can run the kit on them yourself.

---

## SD-101: Log in to the shop

**Preconditions**
- The login page is displayed.
- The demo site lists accepted usernames and one shared password on the login page.

**Acceptance criteria**
- A1. The login page shows a Username field, a Password field and a Login button.
- A2. A valid username and password take the user to the inventory page.
- A3. Submitting with an empty Username shows the error "Epic sadface: Username is required".
- A4. Submitting with a Username but an empty Password shows the error "Epic sadface: Password is required".
- A5. A wrong username or password shows the error "Epic sadface: Username and password do not match any user in this service".
- A6. The user `locked_out_user` cannot log in and sees the error "Epic sadface: Sorry, this user has been locked out."
- A7. The error banner can be dismissed with its close (x) button.

---

## SD-102: Browse and sort the product inventory  ← used in the sample run

**Preconditions**
- The user is logged in as `standard_user`.
- The inventory page is displayed.

**Acceptance criteria**
- A1. The inventory page shows the title "Products" and 6 products. Each product shows an image, a name, a description, a price and an "Add to cart" button.
- A2. A sort control offers four options: Name (A to Z), Name (Z to A), Price (low to high), Price (high to low). The default is Name (A to Z).
- A3. Selecting a sort option reorders the product list immediately.
  - A3a. The two Name options order products alphabetically by product name.
  - A3b. The two Price options order products numerically by price.
- A4. Clicking "Add to cart" on a product changes that button to "Remove" and increases the cart badge count by 1.
  - A4a. Clicking "Remove" changes the button back to "Add to cart" and decreases the cart badge count by 1.
  - A4b. When the cart is empty, no badge is shown on the cart icon.
- A5. Clicking a product name opens that product's detail page, showing its name, description and price. "Back to products" returns to the inventory page.
- A6. Cart contents persist while the user moves between the inventory page and product detail pages.
- A7. Clicking the cart icon opens the cart page.
- A8. Choosing Logout from the menu returns the user to the login page.
  - A8a. A logged-out user who opens the inventory page address directly stays on the login page and sees an error that the page can only be accessed when logged in.
- A9. The inventory page layout is responsive down to a 375px-wide viewport.

---

## SD-103: Manage the shopping cart

**Preconditions**
- The user is logged in as `standard_user`.

**Acceptance criteria**
- A1. The cart page lists each added item with its name, description, price and quantity.
- A2. The quantity of an item added from the inventory page is 1.
- A3. Clicking "Remove" on a cart item removes it from the list and decreases the cart badge by 1.
- A4. Clicking "Continue Shopping" returns the user to the inventory page with the cart unchanged.
- A5. Clicking "Checkout" with at least one item opens checkout step one.
- A6. With an empty cart the cart page shows no items.

---

## SD-104: Check out

**Preconditions**
- The user is logged in as `standard_user` with at least one item in the cart.

**Acceptance criteria**
- A1. Checkout step one asks for First Name, Last Name and Zip/Postal Code.
- A2. Submitting step one with an empty First Name shows "Error: First Name is required".
- A3. Submitting step one with an empty Last Name shows "Error: Last Name is required".
- A4. Submitting step one with an empty Zip/Postal Code shows "Error: Postal Code is required".
- A5. Valid step-one details open the checkout overview (step two), listing the items in the cart.
- A6. The overview shows an Item total equal to the sum of the item prices, a separate Tax line, and a Total equal to Item total plus Tax.
- A7. Clicking "Finish" opens the confirmation page with the message "Thank you for your order!" and the cart badge disappears.
- A8. Clicking "Cancel" on either checkout step returns the user to the cart page (step one) or the inventory page (step two).
