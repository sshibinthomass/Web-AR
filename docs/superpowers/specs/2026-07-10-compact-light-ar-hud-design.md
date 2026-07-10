# Compact Light AR HUD Design

## Goal

Prevent the Animation control from overlapping the horizontal model rail on mobile, reduce the visual footprint of model cards and action buttons, and give every bottom AR control the same light translucent surface.

## Scope

This change is limited to the placed-object AR HUD. It preserves the existing model-selection, animation-selection, rotation, placement, scaling, and reset behavior.

## Layout

- Keep the model rail horizontally scrollable.
- Use the existing compact rail position when the Animation control is hidden.
- Add an explicit rail state when multiple animation clips make the Animation control visible.
- In that state, raise the rail enough to clear Animation, Rotate, and the action-button row with a small visual gap.
- Do not reserve the extra vertical space for static or single-animation models.

The HUD will toggle the rail state in the same method that shows or hides the Animation control. This avoids relying on `:has()` and remains compatible with older Android Chromium versions.

## Compact Sizing

- Reduce mobile rail cards to approximately 76 pixels wide.
- Reduce rail thumbnails to approximately 48 pixels high.
- Reduce rail labels to 10 pixels while preserving the two-line clamp.
- Reduce Place, 1x, and Reset to approximately 38 pixels high with 12-pixel text and tighter horizontal padding.
- Keep touch targets usable and retain the existing accessible labels.

## Color Treatment

- Use one translucent white surface for model cards, Animation, Rotate, Place, 1x, and Reset.
- Use dark teal text on every light control.
- Use turquoise only for selected-card emphasis, active borders, the primary action accent, and the range-slider accent.
- Give the Animation select the same light surface rather than the current dark nested field.
- Keep disabled controls visibly muted without returning to the dark theme.

## Implementation Boundaries

- `src/ui/ARHud.ts` will toggle the rail's animation-visible state.
- `src/styles.css` will own spacing, compact dimensions, and the shared light surfaces.
- `tests/ui/ARHud.test.ts` will verify that animation options toggle the rail state.
- `tests/ui/styles.test.ts` will verify the compact dimensions, dynamic rail offset, and light control styling.
- Existing unrelated local changes will not be staged or altered as part of this feature.

## Verification

1. Run the focused HUD and style tests.
2. Run the full test suite.
3. Run the normal and GitHub Pages production builds.
4. Verify a mobile viewport with a multi-animation model:
   - the rail does not overlap Animation;
   - the rail remains horizontally scrollable;
   - cards, thumbnails, labels, and buttons are smaller;
   - Animation, Rotate, and buttons use the same light surface;
   - Place, rotation, scaling, reset, and animation selection remain usable.
