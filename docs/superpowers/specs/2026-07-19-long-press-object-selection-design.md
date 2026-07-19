# Long-Press Object Selection and Movement Design

## Goal

Require an intentional long press before a placed model can be moved. The interaction applies to every placed model in both the standard single-object AR flow and Multi Object mode. A successful long press visibly confirms selection, and the user can continue holding the same touch to drag the model without lifting their finger.

## Interaction

- A one-finger touch that begins over a placed model starts a 450 ms long-press timer.
- The hold is cancelled if the finger moves 12 px or more before the timer completes, a second touch begins, the touch ends, or the touch is cancelled.
- When the timer completes, the touched model becomes the active selection and selection feedback begins.
- While the same touch remains down, subsequent movement drags the selected model across its existing locked floor plane.
- Releasing the touch finishes the drag and queues the existing WebXR re-anchoring flow.
- A short tap on an already placed model does not select or move it.
- Tapping while the app is scanning or ready to place continues to place the pending model as it does today.
- Pinch, Rotate, Reset, and Delete continue to operate on the active selected model. They do not bypass the long-press requirement for starting a drag.

## Selection Feedback

Successful selection produces a brief, approximately 250 ms gold pulse around the model and a subtle scale pop. The feedback is attached to the selected 3D object so it remains aligned in AR rather than appearing as a fixed screen overlay.

The pulse must not participate in raycasting, cast a shadow, or alter the model's saved/exported transform. Its scale animation is applied to the feedback element rather than the model group, preventing visual feedback from changing the user's chosen model scale.

When `prefers-reduced-motion: reduce` is active, selection uses a short static gold highlight without the scale animation.

## Architecture

### Gesture recognition

`GestureController` owns touch timing and movement tolerance. Its gesture state distinguishes a pending hold from an activated long press. It reports long-press activation separately from ordinary gesture start, tap, drag, pinch, and gesture end.

The controller receives the hold duration and movement tolerance as defaults that can be overridden in tests. Timer cleanup occurs on movement cancellation, multi-touch transition, touch end, touch cancel, and disconnect.

### Object hit testing and drag authorization

`WebARApp` hit-tests the initial touch against placed model geometry without changing selection. If the hold activates, the app selects that exact model, starts feedback, and authorizes dragging for the remainder of the current gesture.

In Multi Object mode, `LayoutSceneManager` exposes hit testing separately from selection so touching an object does not immediately mutate selection. In single-object mode, the same screen-space raycast checks the visible placed model root. Touches that begin outside model geometry cannot activate dragging.

Existing floor projection, motion smoothing, anchor deletion, and re-anchor queuing remain responsible for moving the authorized target. The long press changes only when a drag is allowed to begin.

### Selection feedback

A small scene helper creates and controls the non-interactive gold selection pulse. It is reusable for single- and multi-object groups, removes or hides previous feedback before selecting another object, and disposes its temporary Three.js resources during scene teardown.

## State and Data Flow

1. A touch begins and `WebARApp` records the placed object under the touch, if any.
2. `GestureController` starts the 450 ms hold timer.
3. Early movement, multi-touch, release, or cancellation clears the pending candidate.
4. On timer completion, `GestureController` reports long-press activation at the original point.
5. `WebARApp` selects the recorded candidate, shows feedback, and marks that target as drag-authorized.
6. Later move events from the same held touch project onto the target's floor plane and update the existing motion controller.
7. Touch release finishes motion, queues re-anchoring when movement occurred, and clears gesture-only state.

## Error and Edge Handling

- If the candidate model is deleted, hidden, or replaced before activation, the hold does nothing.
- If no usable canvas bounds, camera ray, floor height, or floor projection is available, selection may still be confirmed but movement is skipped safely.
- A second finger cancels pending long-press activation and hands control to the existing pinch behavior.
- A long press does not create duplicate anchor work when the model was selected but never moved.
- Disconnecting or leaving AR clears timers and removes temporary feedback resources.

## Testing

Focused automated tests cover:

- Long press activates after 450 ms and reports the original touch point.
- Movement at or beyond 12 px before activation cancels the hold.
- Touch end, touch cancel, multi-touch, and disconnect cancel the timer.
- No tap is emitted after a successful long press.
- Drag callbacks continue during the same held touch after activation.
- Object hit testing can identify a model without selecting it.
- Standard single-object and Multi Object flows require long-press authorization before moving.
- Selection feedback attaches to the correct group, ignores raycasts, does not modify the model transform, and respects reduced-motion preferences.
- Re-anchoring occurs after an actual long-press drag but not after selection alone.

Run focused tests throughout implementation, then run the complete `npm test` and `npm run build` checks before completion.

## Out of Scope

- Mouse or desktop pointer long-press support.
- Changing pinch, rotation, reset, delete, placement, or model-loading semantics.
- Persistent selection across AR sessions.
- Adding selection handles, bounding boxes, transform gizmos, or haptic feedback.
