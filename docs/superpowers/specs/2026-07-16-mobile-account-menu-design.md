# Mobile Account Menu and Signed-In Feedback Design

## Goal

Make authentication state immediately understandable and ensure every signed-in action is reachable on mobile and desktop.

## Confirmed Problems

- A successful direct login can leave the user looking at the login page, so the state change is easy to miss.
- The mobile top bar always says **Account**, even after authentication.
- **Admin** and **Log out** are only present in the desktop account area, which is hidden below the desktop breakpoint.
- The home page contains a second set of authentication controls, creating different account behavior depending on the current page.
- The desktop shell identifies the user by email instead of the available display name.

## Recommended Interaction

### Signed-out state

- The top-right shell action says **Account**.
- Activating it navigates to the existing login page.
- The home page no longer presents a competing account-action row.

### Signed-in state

- The top-right shell action changes to **Hi, Name**.
- `name` is preferred when present. If it is missing, the readable part of the email before `@` is used.
- Activating **Hi, Name** opens one account menu shared by mobile and desktop.
- The menu contains:
  - the user’s full name or fallback label;
  - the email address;
  - an **Admin dashboard** action for active administrators only;
  - a **Log out** action for every signed-in user.
- The trigger exposes `aria-expanded` and `aria-controls`.
- The menu uses `role="menu"`, focuses its first action when opened, closes with Escape or an outside click, and restores focus to the trigger.

## Login Completion

- A successful direct login returns the user to Home.
- If login was required by a protected destination, successful login resumes that original destination.
- The destination displays a short, non-blocking confirmation: **Welcome back, Name.**
- The updated **Hi, Name** trigger remains visible after the confirmation disappears, providing persistent proof that the user is signed in.
- Logout clears the user state, closes the menu, returns Home, and restores the shell action to **Account**.

## Responsive Layout

### Mobile and tablet

- **Hi, Name** remains in the top-right position and truncates safely without pushing the centered page title.
- The account menu opens below the mobile top bar as a compact full-width sheet with safe horizontal margins.
- Menu actions use at least 44 px touch targets.
- Admin and Log out are never dependent on home-page content or desktop-only controls.

### Desktop

- The separate email label and Account/Admin/Log out buttons are replaced by one **Hi, Name** trigger.
- The account menu is anchored to the top-right header area.
- Existing primary navigation remains unchanged.

## Visual Direction

The menu continues the spatial-workbench theme:

- white surface, deep teal text, and the existing teal focus/accent color;
- Sora for the greeting and Source Sans 3 for account details and actions;
- a restrained status dot beside the greeting as the persistent signed-in signal;
- one quiet elevation layer, using the existing panel radius and shadow tokens.

The status dot is the signature detail: it communicates an active session without adding another badge, banner, or permanent block of copy.

## Component Boundaries

### `ApplicationShell`

Owns:

- signed-in trigger text;
- account-menu rendering and visibility;
- responsive positioning;
- menu keyboard, outside-click, and focus behavior;
- Admin and Log out shell actions.

It receives the current `AuthUser` through the existing `setUser` method and continues to report navigation/logout through existing handlers.

### `ARHud`

Owns:

- passing authentication state to `ApplicationShell`;
- the login page and transient login confirmation;
- protected-route restoration.

The duplicate home authentication action row is removed.

### `WebARApp`

Owns:

- login and logout requests;
- choosing the correct post-login destination through the existing pending-route behavior;
- providing the success message with the display name.

## Error and Edge Cases

- Pending accounts remain on the login page with the existing approval message and never receive signed-in shell controls.
- Failed login keeps the user on the form and displays the existing error.
- Missing or whitespace-only names use the email prefix fallback.
- Long names are truncated visually but remain available through the trigger’s accessible label/title and menu identity block.
- Admin is shown only when `role === "admin"` and `status === "active"`.

## Testing

Automated regression tests will cover:

- **Account** changing to **Hi, Name** after authentication;
- email-prefix fallback when a name is unavailable;
- mobile and desktop triggers opening the same account menu;
- Admin visibility and navigation;
- Log out availability and callback behavior;
- Escape/outside-click dismissal and focus restoration;
- successful direct login returning Home;
- protected-route login resuming the requested page;
- removal of duplicate home authentication controls;
- mobile menu sizing, touch targets, and stacking order.

Browser verification will cover signed-out, signed-in user, and signed-in admin states at mobile and desktop viewport sizes.
