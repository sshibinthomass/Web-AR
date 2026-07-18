# Remove “Keep this page open” from generation messages

## Goal

Remove the phrase “Keep this page open” from every user-facing generation/loading message while preserving the useful description of the operation in progress.

## Scope

- Photo-to-AR model generation
- Speech-to-3D generation
- Dynamic-image and model generation
- Full-flow loading messages rendered by the AR HUD

Existing error messages, status behavior, loading visuals, cancellation behavior, and generation workflow remain unchanged.

## UI copy

- “Building your 3D object in Modal. Keep this page open.” becomes “Building your 3D object in Modal.”
- “Generating a dynamic image, then building your 3D object in Modal. Keep this page open.” becomes “Generating a dynamic image, then building your 3D object in Modal.”
- “Generating a 3D-ready image and model from speech. Keep this page open.” becomes “Generating a 3D-ready image and model from speech.”

## Testing

Update the AR HUD tests to assert that loading content does not contain “Keep this page open” and still contains the operation-specific generation message. Run the focused HUD tests, full test suite, and production build before publishing.
