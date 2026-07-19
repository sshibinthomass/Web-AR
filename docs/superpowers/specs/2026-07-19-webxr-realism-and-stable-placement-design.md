# WebXR Realism and Stable Placement Design

**Date:** 2026-07-19

## Goal

Make Android Chrome placement feel grounded and responsive like a polished native ARCore experience while preserving the browser-based WebXR architecture. Remove the visible square floor grid, keep the turquoise placement ring, reduce pose jitter, anchor placed content, ease placement and drag motion, and integrate virtual objects with the room's lighting.

## Current Behavior and Root Cause

The scene creates a two-meter `THREE.GridHelper`, and `PlaneTrackingManager.update()` makes that grid visible whenever plane detection or a fallback floor height is available. Although placement calls `hide()`, the next XR frame calls `update()` and shows the grid again. The grid therefore remains visible as transparent squares across the camera view.

The app requests the optional `anchors` and `light-estimation` WebXR features but does not use them. Hit-test matrices are copied directly into the reticle and object transforms. Dragging also applies the newest hit point immediately. These raw updates cause abrupt placement, visible jitter, and motion that feels less grounded than native ARCore examples.

## Scope

### Included

- Remove the square floor grid from the immersive AR scene.
- Preserve the existing turquoise placement ring and its visual style.
- Stabilize hit-test poses before presenting them as placeable targets.
- Animate object placement with a short, restrained settle transition.
- Smooth floor-constrained dragging and settle the object on release.
- Create and follow WebXR anchors when supported.
- Apply WebXR lighting estimation when supported, with current scene lights as fallback.
- Add a soft contact shadow beneath placed single objects and layout objects.
- Preserve current placement, editing, reset, rotation, scaling, animation, and multi-object behavior.
- Add automated tests for deterministic logic and perform physical-device verification on Android Chrome.

### Excluded

- A native Android or Unity rebuild.
- Geospatial or persistent cloud anchors.
- Full scene meshing, semantic understanding, or guaranteed real-world occlusion.
- Changing the turquoise ring's shape, color, or size.
- Unrelated HUD or model-generation changes.

## Architecture

### Scene Composition

`createScene()` will stop creating and exposing `floorGrid`. `PlaneTrackingManager` will become a data-only optional plane tracker or be removed from the render path if none of its plane metadata is consumed. No grid, polygon, or other square floor visualization will be rendered.

The scene will retain the existing turquoise hit-test reticle. It will add a reusable transparent shadow receiver associated with each placeable object root. The receiver will remain hidden until its object is placed and will follow that object's floor position and footprint.

### Stabilized Hit Testing

`HitTestManager` will separate raw XR hit poses from the pose presented to the rest of the app. It will maintain a small bounded sample window and reject samples that represent implausibly large one-frame jumps. Valid samples will produce a smoothed position and orientation using frame-rate-independent damping.

The manager will expose whether the target is stable enough for placement. Stability will require several consecutive valid frames within a small movement tolerance. A temporary loss of a hit will hide the ring and clear placement readiness without immediately discarding the last stable pose used by an already placed object.

The smoothing parameters will favor responsiveness over cinematic lag. The ring must track deliberate phone movement promptly while suppressing small tracking noise.

### Placement Motion

Placement will use the latest stable hit pose. The object's world position will be correct immediately for tracking purposes, while its visible content performs a short settle animation: a small upward offset and slightly reduced scale ease to the final transform while opacity fades to full. The transition will be subtle and will respect model-specific scale.

Starting another placement, resetting, switching models, or ending the XR session will cancel any active transition cleanly. Animation timing will use the render-loop delta rather than timers so it pauses and resumes consistently with rendering.

### Anchoring

The latest hit-test result and its corresponding stable pose will be retained long enough to create an anchor at placement time. When the browser supports anchors, placement will create an `XRAnchor` and associate it with the placed object. On each XR frame, the app will obtain the anchor-space pose and update the object's tracked root as ARCore refines its environmental map.

If anchor creation fails or is unavailable, the object will retain the stable world transform. Replacing, resetting, deleting, or ending a session will delete the old anchor. Multi-object mode will maintain one optional anchor per placed layout object rather than sharing one global anchor.

### Dragging

Drag hit points will update a target floor position rather than directly setting the object on every pointer event. The render loop will damp the visible object toward that target while preserving its locked floor height. Releasing the gesture will complete a short settle to the final target.

Dragging will temporarily detach or replace the object's previous anchor because an anchor represents a fixed real-world pose. When the drag finishes, the app will create a new anchor at the final stable floor pose when supported. If no fresh hit exists, the object will remain at its last valid position.

### Environmental Lighting and Shadows

The scene will integrate Three.js `XREstimatedLight`. When WebXR provides lighting estimates, estimated ambient, directional, and environment lighting will replace or modulate the fixed fallback lights. When estimation is unavailable or ends, the current hemisphere and directional lights will remain active.

Placed models will cast onto a soft, transparent contact-shadow receiver aligned to the placement floor. Shadow opacity will remain restrained so it grounds the object without painting an obvious artificial disc onto the camera feed. The receiver will not intercept hit tests or gestures.

## Data Flow

1. WebXR supplies raw hit-test results each frame.
2. `HitTestManager` validates and smooths raw poses, updates the ring, and reports stability.
3. The app enables placement only when a stable pose exists.
4. Placement assigns the stable world pose, starts the visual settle transition, and requests an anchor.
5. The render loop follows an anchor pose when available, advances transitions, updates drag damping, applies estimated lighting, and renders the scene.
6. Dragging updates a floor target; gesture release creates a replacement anchor at the settled pose.
7. Session cleanup cancels hit-test sources, transitions, anchors, estimated lighting, and shadow resources.

## Failure and Fallback Behavior

- Missing plane detection: hit testing continues normally, with no floor visualization.
- Missing anchors: placed objects use stable WebXR world transforms.
- Anchor creation failure: placement succeeds and records no anchor.
- Missing lighting estimation: fixed scene lights remain active.
- Brief hit-test loss: the ring hides and placement readiness returns to scanning; placed objects remain visible.
- No stable hit when Place is requested: placement does not use a noisy or stale raw pose.
- XR session end: all anchors and XR-only resources are released, and scene state returns to the existing non-session state.
- Reduced-motion preference: placement and drag settle durations are minimized while spatial accuracy behavior remains enabled.

## Testing

Automated tests will cover:

- The immersive scene contains no `GridHelper` and retains the turquoise reticle.
- Hit-test stability does not become ready before the required valid-frame threshold.
- Small pose noise is smoothed, large discontinuities are rejected, and reset clears stability.
- Placement uses only a stable pose.
- Placement transitions converge to the exact final transform and cancel correctly.
- Drag damping preserves floor height and converges to the final target.
- Anchor success, unsupported fallback, replacement after drag, and cleanup behavior.
- Estimated-light activation and fixed-light fallback.
- Contact shadows are hidden before placement and visible afterward without altering gesture behavior.
- Single-object and multi-object flows retain their existing controls.

Physical-device verification on the target Samsung Galaxy S25 Ultra with current Chrome and Google Play Services for AR will confirm:

- No transparent square grid appears while scanning, placing, dragging, or editing.
- The turquoise ring remains visible and recognizable.
- The ring remains responsive while showing less jitter.
- Placement and dragging settle smoothly without overshoot or floor-height drift.
- A placed object remains stable while the user walks around it.
- Lighting and contact shadows improve grounding in bright and dim rooms.
- Unsupported optional features fall back without errors.

## Success Criteria

- The square grid is absent for the entire immersive session.
- The existing ring remains unchanged visually.
- Placement is prevented until a stable hit target exists.
- Objects do not visibly snap or jitter during ordinary placement and dragging.
- Supported devices use anchors and estimated lighting; unsupported devices retain functional placement.
- Placed objects remain floor-locked and visually grounded.
- All automated tests and the production build pass.
