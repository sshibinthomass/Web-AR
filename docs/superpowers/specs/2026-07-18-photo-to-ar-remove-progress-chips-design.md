# Photo to AR Progress Chip Removal

## Goal

Remove the Capture, Generate, and Place progress chips from the immersive Photo to AR camera interface. Keep the Capture and Generate and place action buttons unchanged.

## Design

Hide `.creation-step-list` only when its camera workspace has the `.photo-to-ar-immersive` route class. Use CSS rather than changing the shared HUD markup so other creation routes can continue using the progress list.

The existing bottom guidance panel will reflow naturally after the list is hidden. Camera status, generated-model status, target-object input after capture, and both action buttons retain their current behavior.

## Verification

- Add a stylesheet contract test requiring the Photo to AR progress list to use `display: none`.
- Run the focused stylesheet tests, complete test suite, and production build.
- Verify the deployed mobile Photo to AR page contains only the two action buttons in the bottom controls.

## Out of Scope

- Changing action button labels, sizes, or behavior.
- Removing progress indicators from other routes.
- Changing the object reconstruction loading animation.
