# Web AR Experience Redesign

Date: 2026-07-16
Status: Approved design direction; awaiting written-spec review

## 1. Product definition

Anima You 3D is a browser-based spatial creation workspace for people who want to generate, manage, and place 3D models without learning a professional 3D tool.

The interface has one primary job: at every route, make it immediately clear where the person is, what they can do, and what will happen next.

This redesign preserves the existing light spatial-grid and teal identity while rebuilding the navigation model, responsive layouts, component consistency, route state handling, accessibility, and interaction feedback.

## 2. Selected direction

### Recommended and approved: evolutionary spatial workbench

Retain the product's recognizable spatial-grid foundation and teal anchor color, then turn it into a deliberate creation-workbench system. Desktop becomes a true multi-panel workspace; mobile becomes a task-first, single-column experience with reachable primary actions.

### Alternatives considered

1. **Full cinematic AR rebrand**
   - Strong visual impact.
   - Higher readability and implementation risk.
   - Would replace too much existing product recognition.

2. **Conservative repair**
   - Lowest implementation cost.
   - Would correct defects but preserve weak desktop hierarchy and inconsistent route identity.

3. **Evolutionary spatial workbench**
   - Preserves brand continuity.
   - Solves navigation and responsive architecture at the system level.
   - Creates a distinctive AR-specific visual language without overwhelming the work.

## 3. Experience principles

1. **Orientation before action**
   - Every page has a stable route title and a clear primary task.
   - Camera-based workflows retain their specific identity instead of all appearing as “Camera.”

2. **One dominant action per region**
   - Primary, secondary, and destructive actions are visually distinct.
   - A primary action never shares equal emphasis with several unrelated controls.

3. **Recognition over recall**
   - Desktop uses labelled global navigation.
   - Mobile uses four stable navigation destinations plus a labelled creation sheet.
   - Icons supplement labels; they do not replace them for important actions.

4. **Progressive disclosure**
   - Advanced and secondary controls remain available without competing with the current task.
   - Mobile moves secondary controls into an expandable sheet whenever more than two secondary actions would otherwise compete with the primary action.

5. **State is local and explicit**
   - Entering a route establishes its title, status, controls, and message.
   - Leaving a route cleans up media, temporary UI, and route-specific state.

6. **Accessibility is a default**
   - Keyboard focus, screen-reader semantics, reduced motion, touch target sizes, and meaningful error messages are part of each component.

## 4. Visual system

### 4.1 Palette

| Token | Value | Purpose |
| --- | --- | --- |
| Canvas | `#F4F8F7` | Application background |
| Surface | `#FFFFFF` | Panels, menus, dialogs, and controls |
| Primary ink | `#102F2F` | Main text and high-contrast controls |
| Secondary ink | `#496664` | Supporting text |
| Spatial teal | `#0B8F87` | Primary actions, focus, and active navigation |
| Deep teal | `#076A65` | Primary hover and pressed states |
| Tracking amber | `#F2A93B` | Tracking, placement, and attention states |
| Error coral | `#D85D4A` | Errors and destructive confirmation |
| Border | `#D5E4E1` | Dividers and control outlines |
| Success | `#2C8B5E` | Completed generation and save states |

Dark overlays remain limited to camera contrast and immersive AR controls. Dark panels are not used as isolated decorative cards inside otherwise light pages.

### 4.2 Typography

- **Display:** Sora, used for route titles, hero statements, and major empty states.
- **Body and controls:** Source Sans 3, used for instructions, fields, buttons, and navigation.
- **Utility:** IBM Plex Mono, used sparingly for tracking state, dimensions, coordinates, and model metadata.

The typefaces will be bundled with the application rather than fetched from a third-party runtime service.

Type scale:

- Display: 40/44 desktop, 30/34 mobile
- Page title: 28/34 desktop, 24/29 mobile
- Section title: 20/26
- Body: 16/24
- Compact body: 14/20
- Utility label: 12/16 with modest letter spacing

All interface copy uses sentence case.

### 4.3 Spacing, shape, and elevation

- Spacing scale: 4, 8, 12, 16, 24, 32, 48, and 64px.
- Interactive control height: 48px by default; 44px is the absolute compact minimum.
- Standard panel radius: 16px.
- Control radius: 10px.
- Pills are reserved for statuses, filters, and compact metadata.
- Shadows remain subtle and indicate layering, not decoration.

### 4.4 Signature element: Spatial Calibration Frame

The product-specific visual signature is a restrained calibration frame: corner brackets, a short coordinate rail, and a utility label placed around active workspaces and major route headings.

It appears on:

- the home creation preview;
- camera and upload workspaces;
- model preview;
- AR placement surfaces;
- the active route heading on larger screens.

It does not surround every card. One strong use per view is the target.

### 4.5 Motion

- One coordinated route-entry transition: a short fade and 8px rise.
- Active tracking and generation states use one restrained pulse; reduced-motion mode replaces it with a static state indicator.
- Hover motion is limited to subtle elevation or border changes.
- `prefers-reduced-motion` removes nonessential animation.

## 5. Navigation architecture

### 5.1 Central route configuration

Route metadata will live in one configuration instead of being scattered through UI methods. Each route declares:

- hash path;
- human-readable title;
- navigation section;
- parent/fallback route;
- authentication requirement;
- administrator requirement;
- whether the route is immersive;
- the route-specific initial status;
- desktop and mobile shell behavior.

Existing access permissions remain intact; the redesign centralizes their enforcement.

### 5.2 Navigation semantics

- Forward navigation pushes one history entry.
- Redirects replace the current entry.
- Internal Back returns to the previous in-app route when one exists.
- A direct-entry route without in-app history falls back to its configured parent without creating a loop.
- Browser Back and internal Back produce compatible results.
- Refreshing or directly entering any supported hash route restores that route.

### 5.3 Authentication restoration

Route evaluation waits until stored-session restoration has resolved.

- A valid authenticated deep link remains on its requested route.
- An unauthenticated protected route stores the intended destination and redirects to Login.
- Successful login replaces Login with the intended route.
- Logout clears the intended route and returns to Home.
- Administrator routes retain their existing role guard.

### 5.4 Route lifecycle

Every route has explicit enter and exit behavior.

On enter:

- set route title and context;
- set route-specific status and instructions;
- set visible actions;
- restore selection only for routes whose metadata explicitly marks selection as persistent;
- start route-owned media only when needed.

On exit:

- stop route-owned camera or speech resources when required;
- close temporary menus and sheets;
- clear stale generated messages and errors;
- remove route-only listeners;
- restore the global shell.

This prevents Upload messages and controls from leaking into Camera or other workflows.

## 6. Responsive application shell

### 6.1 Desktop, 1024px and wider

```text
┌ Brand ─ Create ▼ ─ Models ─ Place in AR ─ Multi-object ─ Account ┐
├ Back  /  ROUTE TITLE                                  Route state ┤
│                                                                  │
│ Primary workspace: 8 columns │ Guidance/actions: 4 columns       │
│                              │                                   │
└──────────────────────────────────────────────────────────────────┘
```

- Maximum content width: 1280px.
- A twelve-column grid supports 8/4, 7/5, and full-width route layouts.
- The global header remains stable on standard pages.
- Create opens a labelled menu for Camera, Image Upload, Photo to AR, AI Photo to AR, Speech, and Model Upload.
- A live Camera or AR session hides the global header and standard navigation while retaining the route title, current status, and Exit.

### 6.2 Mobile, below 768px

```text
┌ Back            Current task                    Account ┐
│                                                         │
│ Single-column task workspace                            │
│                                                         │
├ Sticky contextual primary action                        ┤
└ Home ─ Create ─ Models ─ AR ────────────────────────────┘
```

- The top bar identifies the current task and provides Back or Exit.
- A four-destination bottom navigation provides Home, Create, Models, and AR.
- Create opens a compact bottom sheet of creation methods.
- The primary action is sticky above the safe area when that improves completion.
- Secondary controls move into a sheet or stacked secondary section.
- Immersive routes temporarily hide normal bottom navigation.

### 6.3 Intermediate widths

Widths from 768px through 1023px use the mobile navigation model with a wider content column and selected two-column components. There is no compressed desktop navigation.

## 7. Shared component architecture

The current UI remains framework-free. The redesign introduces focused TypeScript view units and CSS layers rather than migrating frameworks.

### 7.1 Core units

1. **Hash router**
   - Owns route parsing, history behavior, fallbacks, and auth-aware redirects.
   - Depends on route configuration and resolved authentication state.

2. **Application shell**
   - Owns desktop header, mobile top bar, bottom navigation, route heading, and content mount point.
   - Receives route metadata and user identity.

3. **Create workspace**
   - Shared layout for Camera, Image Upload, Photo to AR, AI Photo to AR, Speech, and Model Upload.
   - Owns workspace, guidance, status, and action slots without forcing every route into the same geometry.

4. **Action components**
   - Primary button, secondary button, quiet button, icon button, and destructive button.
   - Share sizing, typography, focus treatment, disabled states, and loading behavior.

5. **Field components**
   - Text input, textarea, select, file drop zone, field label, hint, and field error.
   - Native controls remain accessible and are styled consistently.

6. **Feedback components**
   - Inline status, progress state, empty state, error notice, and toast.
   - Status vocabulary remains consistent across generation workflows.

7. **Dialog**
   - Provides `role="dialog"`, `aria-modal`, labelled title, Escape handling, focus trapping, and focus restoration.
   - Used by model preview, model editing, and destructive confirmation.

8. **Model collection**
   - Provides library list/card presentation, filters, row actions, selection, and empty states.
   - Updates only when model data actually changes, preserving focus and selection.

9. **Immersive control layer**
   - Provides camera/AR route title, tracking status, model rail, contextual actions, and Exit.
   - Uses dark contrast surfaces only over live visual content.

### 7.2 CSS structure

Styles are reorganized into predictable layers:

1. tokens and font declarations;
2. reset and global accessibility rules;
3. application shell and layout;
4. reusable controls and feedback;
5. route-specific workspaces;
6. responsive adaptations;
7. reduced-motion and high-contrast accommodations.

A global `[hidden] { display: none !important; }` rule ensures semantic hidden states cannot be overridden by component display declarations.

## 8. Route designs

### 8.1 Home

Desktop:

- Two-column opening with a concise product thesis and spatial preview.
- The primary creation launcher is visible without scrolling.
- Supporting process information follows below the first viewport.

Mobile:

- Shorter opening statement and one dominant Create action.
- The preview is reduced in height.
- Protected creation options do not sit below a long decorative introduction.

### 8.2 Model Library

- Full-width desktop workspace with search, ownership filters, and stable row/card actions.
- Mobile uses readable cards or rows with overflow actions when six simultaneous icons become too dense.
- Empty, loading, and failed-load states explain the next action.
- Refreshes do not replace unchanged interactive DOM.

### 8.3 Model Preview

- Uses an accessible modal with a clear title, metadata, Close, and the relevant primary action.
- Supports Escape, focus trap, and focus restoration.
- Mobile preserves the current strong visual preview while improving semantics.

### 8.4 Camera

- Route title remains “Camera capture.”
- Desktop prioritizes a large camera preview with guidance and capture actions in the adjacent panel.
- Mobile uses a full-height preview and reachable bottom controls.
- Camera entry resets all prior upload or generation messages.

### 8.5 Image Upload

- Uses a compact drop zone instead of stretching a file input through the available viewport.
- Desktop places preview/upload on the left and requirements/actions on the right.
- Mobile stacks the drop zone, preview, guidance, and a full-width sticky Generate action.
- The route title and Back control never overlap.

### 8.6 Model Upload

- Uses the same field and drop-zone language as Image Upload.
- Clearly distinguishes uploading an existing model from generating one.
- Validation names supported formats and corrective action.

### 8.7 Photo to AR and AI Photo to AR

- Retain distinct route titles and instructions throughout capture, generation, and placement.
- Real sequence stages are shown as Capture, Generate, and Place.
- Progress is displayed because order materially affects completion.

### 8.8 Speech to 3D

Desktop:

- A 7/5 layout provides a full-width prompt composer and a generation/options panel.
- Four actions use a deliberate primary/secondary hierarchy rather than an accidental wrapped grid.

Mobile:

- Textarea fills the content width and grows within a defined range.
- Secondary actions stack below the primary Generate action.
- Content remains readable without a fixed narrow desktop column.

### 8.9 Place in AR

- Adds a visible route title and one-sentence instruction.
- Desktop uses the model collection plus a selection/action panel.
- Mobile retains a compact two-column model grid and sticky “Place selected model” action.
- Selection state is visible through more than color alone.

### 8.10 Multi-object AR

- Desktop uses the available canvas with one aligned action row and an inspector/status panel.
- Mobile keeps the canvas primary, with a model rail and expandable inspector.
- The current isolated dark status card is replaced by the immersive control system.
- Delete is visually destructive and applies only to the selected object.

### 8.11 Login

- Uses a focused authentication card with consistent field and button styling.
- Login mode fully hides the Name field.
- Registration exposes Name only when required.
- Authentication errors identify the failed action and next step.

### 8.12 Admin

- Desktop uses separate Accounts and Generation Jobs regions in a two-column or master-detail layout.
- Mobile stacks sections and moves lower-priority actions into overflow controls.
- Email, roles, and actions no longer compete in one cramped row.

## 9. Interface language

Actions use consistent verbs:

- “Create model”
- “Generate model”
- “Upload model”
- “Place in AR”
- “Add model”
- “Save changes”
- “Delete selected”
- “Try again”

Status progression uses consistent terms:

- Ready
- Uploading
- Generating
- Model ready
- Placing
- Saved
- Action failed

Errors state what failed and how to recover. Empty states invite a relevant next action. Generic labels such as “Submit” and route-inaccurate labels such as “Camera” inside other workflows are removed.

## 10. Error, loading, and empty-state behavior

- Loading states preserve layout dimensions to prevent jumping.
- Buttons show an inline busy state and cannot trigger duplicate work.
- Failed model refreshes preserve the last successfully loaded collection.
- Media permission errors explain how to enable camera or microphone access.
- Unsupported files identify allowed formats and limits.
- Network and generation failures retain user input where safe.
- Empty model libraries offer Create model or Upload model according to access.
- Destructive actions require confirmation when recovery is not available.

## 11. Accessibility

- All interactive controls are keyboard reachable.
- Every control has a visible, high-contrast `:focus-visible` treatment.
- Dialogs trap and restore focus.
- Menus, sheets, tabs, and status messages expose appropriate ARIA semantics.
- Live generation and tracking messages use restrained live regions.
- Color is never the only selection, error, or success indicator.
- Text and control contrast meet WCAG AA.
- Touch targets are at least 44px.
- Safe-area insets are respected on mobile.
- Zoom and text reflow remain usable.
- Reduced-motion preferences are honored.

## 12. Implementation boundaries

Included:

- navigation and auth-route fixes;
- route lifecycle and state reset;
- desktop and mobile shells;
- design tokens and typography;
- shared controls, fields, feedback, and dialogs;
- responsive redesign of all existing routes;
- model refresh stability;
- accessibility and interaction-state fixes;
- tests for the corrected behavior.

Not included:

- replacing the underlying rendering or WebXR engine;
- changing model-generation APIs;
- changing account roles or backend authorization policy;
- adding new creation methods;
- migrating to a frontend framework;
- redesigning unrelated worker internals.

The existing `ARHud` responsibilities will be reduced only where necessary to establish the router, shell, reusable components, and clear route lifecycle. Unrelated application logic remains in place.

## 13. Verification strategy

### 13.1 Automated unit and DOM tests

Add or update tests for:

- route parsing and route metadata;
- internal Back and browser history behavior;
- direct-entry fallback behavior;
- authenticated deep-link restoration;
- post-login intended-route restoration;
- route enter/exit state reset;
- Camera status after visiting Image Upload;
- Login and registration Name-field visibility;
- stable model updates without unnecessary rerender;
- dialog Escape, focus trap, and focus restoration;
- action labels and visibility by route;
- reduced-motion CSS and DOM behavior.

### 13.2 Browser tests

Run route coverage at:

- 390×844 mobile;
- 768×1024 intermediate/tablet;
- 1440×1000 desktop.

Verify:

- every route is reachable from the application UI;
- Browser Back and internal Back do not loop;
- direct protected links work before and after authentication;
- no horizontal overflow;
- route titles remain correct;
- primary actions remain reachable;
- camera/upload/speech layouts do not stretch or wrap incorrectly;
- dialogs work with keyboard-only interaction;
- mobile safe-area controls do not overlap content;
- unchanged model refreshes do not detach active controls.

### 13.3 Regression gate

- All existing tests must continue to pass.
- New navigation, lifecycle, and accessibility tests must pass.
- Production build must complete successfully.
- Desktop and mobile screenshots must be inspected for every route.
- No production errors or unhandled promise rejections appear during the route audit.

## 14. Acceptance criteria

The redesign is complete when:

1. Every existing route is reachable from the application UI for a user with the required permissions and provides a reliable route back.
2. Internal Back never creates a history loop.
3. Authenticated deep links do not flash or remain on Login.
4. A protected route resumes after successful login.
5. Route-specific status and controls never leak to another route.
6. Desktop routes use the available viewport according to their task.
7. Mobile routes use task-first layouts with reachable primary actions.
8. Buttons, fields, headings, status messages, spacing, and alignment follow one shared system.
9. Camera, Image Upload, Photo to AR, and AI Photo to AR remain clearly distinguishable.
10. Speech input fills its intended layout and actions do not wrap accidentally.
11. Upload fields remain compact and primary actions use the intended width.
12. Model preview and edit dialogs have complete keyboard semantics.
13. Model refreshes preserve active focus and selection when data is unchanged.
14. No supported viewport has unintended horizontal overflow.
15. Existing and newly added tests pass, the production build succeeds, and the complete desktop/mobile visual audit is clean.
