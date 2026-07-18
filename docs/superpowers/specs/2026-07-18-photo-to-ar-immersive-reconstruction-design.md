# Photo-to-AR Immersive Reconstruction Design

## Goal

Make Photo-to-AR feel like one continuous immersive workflow. The live camera and captured photo fill the viewport, the detected object animates over the full-screen capture, and the same object continues looping on the generation screen until the 3D model is ready.

## Scope

This change applies to the `full-flow` Photo-to-AR route and its mobile, tablet, and desktop responsive layouts. The existing `dynamic` route may reuse the generation animation when it has a valid segmentation result, but its generation pipeline is otherwise unchanged. Upload, model-management, speech, and standard AR-picker layouts remain unchanged.

## Capture Experience

- The Photo-to-AR camera workspace occupies the full viewport.
- The video uses `object-fit: cover`, preserving its aspect ratio while filling the available space.
- The route exit/progress UI appears as a compact overlay at the top and respects safe-area insets.
- Capture, extraction, target-object, and generation controls appear in a translucent bottom sheet above the camera and respect the bottom safe-area inset.
- After capture, the still image replaces the video without changing layout or dimensions.
- The existing detected-object reconstruction overlay remains aligned to the full-screen captured image.
- Controls remain usable and readable over light or dark camera content.

The fullscreen layout is route-scoped so upload workspaces and other creation routes retain their existing card layouts.

## Generation Experience

After successful segmentation, the HUD retains an in-memory reconstruction payload containing the mask URL and object bounds. It does not send another segmentation request.

If the user starts generation while segmentation is still pending, the in-flight request is allowed to finish against the captured-image snapshot already held by that operation. Generation starts immediately in parallel. The loading screen begins with the spinner, then upgrades to the looping object reconstruction as soon as the successful mask arrives. This transition never issues a second segmentation request.

When the user selects **Generate and place**:

1. Model generation starts immediately; it does not wait for another animation cycle.
2. The AR route opens to preserve the user gesture required for starting an immersive session.
3. The generic loading screen displays a dedicated reconstruction stage.
4. A second `ObjectReconstructionOverlay` instance renders the cached mask in loop mode inside that stage.
5. The loop continues until generation succeeds, fails, or the user leaves the flow.
6. On success, the loop is disposed before placement controls appear.

The loading renderer is separate from the capture renderer because their hosts have different geometry and visibility lifecycles. Both reuse the same drawing implementation and cached mask.

## Reconstruction State and Lifecycle

The HUD stores only the latest successful reconstruction payload. Starting a new capture or leaving the Photo-to-AR experience discards it.

Clearing the currently visible canvas and discarding the cached reconstruction are separate operations. Route changes may cancel a canvas without losing the payload needed by the generation screen. Complete experience reset, disposal, and a new capture discard both.

Loop mode extends the overlay playback contract:

- Standard playback retains the current finite duration.
- Loop playback repeats the progress cycle until explicitly cancelled.
- Reduced-motion mode renders a static outlined object until cancelled.
- Resize and orientation guards continue to keep the canvas aligned.
- Cancellation resolves pending playback and removes canvases, timers, observers, and listeners.

## Fallbacks and Errors

- If segmentation is disabled, fails, or returns no object, the loading screen uses the existing spinner and generation continues normally.
- A loading-animation failure falls back to the spinner and must not fail model generation.
- A model-generation failure stops the animation and displays the existing generation error state.
- Exiting or replacing the capture stops segmentation, camera media, and every reconstruction animation.

## Accessibility

- Status text remains in an `aria-live` region.
- The reconstruction canvas is decorative and remains `aria-hidden`.
- The bottom controls meet existing control-height and contrast requirements.
- Safe-area insets prevent controls from colliding with phone cutouts or browser chrome.
- `prefers-reduced-motion: reduce` displays a static detected-object outline instead of a looping effect.

## Testing

Automated tests will verify:

- finite and loop playback lifecycles, including cancellation and reduced motion;
- cached reconstruction state is reused without a second segmentation request;
- a segmentation request already in flight can upgrade the active generation screen without delaying generation;
- generation loading starts the loop when a mask is available;
- spinner fallback remains when no mask is available;
- success, failure, route exit, new capture, and disposal clean up the loop;
- Photo-to-AR camera and captured-image stages use full-viewport route-scoped styles;
- upload and unrelated creation routes retain their existing responsive layout;
- the full UI suite and production build remain green.

Production verification will use an authenticated phone-sized browser flow to capture a photo, observe the full-screen object animation, select **Generate and place**, and confirm the object continues animating on the loading screen without showing the model picker.
