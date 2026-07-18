# Photo to AR Ready Transition

## Problem

Photo to AR starts the WebXR session from the Generate and place tap and navigates to `#/ar` while generation runs. When the generated model becomes ready, the app navigates to `#/ar` again. Because the route is already active, the router does not rerun route preparation, leaving the full-screen generation overlay above the active AR camera and placement controls.

## Design

Keep starting AR synchronously from the Generate and place tap so browser user-gesture requirements continue to be satisfied.

When `showFullFlowReady` receives the generated model:

1. Stop the reconstruction playback.
2. Explicitly hide the full-flow loading overlay.
3. Clear the full-flow and camera presentation classes that normally disappear during route preparation.
4. Keep the current `#/ar` route and reveal the placement controls.
5. Select the newly generated model and display the ready-to-place status.

The transition must work whether `showFullFlowReady` is called while still on the Photo to AR route or after the Generate action has already moved the app to `#/ar`.

## Error Handling

Generation and model-loading failures retain the existing error path. The ready transition runs only after the generated GLB has loaded successfully and the media-operation guard confirms the request is current.

## Verification

- Add a HUD regression test for the exact Photo to AR capture, Generate and place, loading, and ready sequence.
- Assert that the loading overlay is hidden, AR placement controls are visible, the model picker stays hidden, and the generated model is selected.
- Run the focused HUD tests, complete suite, and production build.
- Verify the deployed production flow no longer leaves the loading overlay above the AR camera.

## Out of Scope

- Delaying WebXR startup until asynchronous generation completes.
- Changing router same-route behavior globally.
- Changing generation, segmentation, or model-hosting services.
