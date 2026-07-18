# AR Error-Only Status

## Goal

Remove the large status card from normal single-object AR placement while preserving visible feedback for genuine errors.

## Design

Use the existing `AppMode` value passed to `ARHud.update` as the source of truth. Mark the shared status panel with an error-state class only when the mode is `unsupported`, which is the existing mode used after `AppState.setError`.

On the single-object `ar` route while the status panel is an immersive inspector:

- Hide the panel in normal modes: scanning, ready to place, placed, and editing.
- Show the panel only in error mode.
- Position the error panel as a compact notification at the top center of the viewport.
- Use a translucent background and light blur so the AR camera remains visible.
- Show only the main error message; hide the Status label and model-source line.

Status behavior on camera capture, generation, model selection, speech, administration, and Multi-object AR remains unchanged.

## State Flow

`ARHud.update(mode, message)` toggles the status panel error marker before updating controls. A later non-error mode removes the marker automatically, so recovered sessions return to a clean camera view.

## Verification

- Add HUD tests proving normal single-object AR placement hides the inspector and error mode marks it as visible error feedback.
- Add stylesheet tests for route-specific normal hiding and compact transparent error styling.
- Run focused HUD/style tests, the complete test suite, and the production build.
- Verify the deployed AR route does not show a normal status card.

## Out of Scope

- Replacing all application errors with a new toast system.
- Changing Multi-object AR status behavior.
- Changing AR placement, model selection, or generation behavior.
