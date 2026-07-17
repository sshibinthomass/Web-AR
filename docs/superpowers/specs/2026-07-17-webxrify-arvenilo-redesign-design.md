# WebXRify by Arvenilo Redesign

**Date:** 2026-07-17

**Status:** Approved for implementation

**Scope:** Presentation-only redesign of the existing Web AR application

**Brand source of truth:** `Arvenilo-Design-Handoff/`

## 1. Product definition

The product is **WebXRify by Arvenilo**. Arvenilo is the parent company and endorsement brand. The application helps people create 3D models from camera images, uploaded images, uploaded GLB files, text, or voice, then manage and place those models through browser-based AR workflows.

The redesign must remove the obsolete **Anima You 3D**, **Arvenilo Agent**, and **WebXRify Agent** product identities from visible interface copy, document metadata, accessible labels, and user-facing status messages. The endorsed name is always written as:

- `WebXRify` when space is limited or the product is already established;
- `WebXRify by Arvenilo` in the primary header identity, browser metadata, authentication context, and other first-contact surfaces.

## 2. Non-negotiable functional boundary

This is a design-only change. The following behavior must remain unchanged:

- all twelve routes and their hashes;
- public, authenticated, and administrator access rules;
- hash navigation, Back behavior, and intended-route restoration after login;
- account creation, login, logout, account approval, and administrator actions;
- camera permissions, capture, retake, image upload, and GLB upload;
- text and voice recording, generation, and background progress behavior;
- image-to-model, photo-to-AR, and AI-enhanced photo-to-AR workflows;
- model search, filtering, preview, download, favorite, edit, visibility, and deletion;
- single-object and multi-object WebXR placement;
- model selection, placement, transform, rotation, and immersive-session controls;
- service clients, API calls, worker contracts, Cloudflare storage, and generated-model data;
- dialog focus trapping, Escape handling, and focus restoration;
- route lifecycle and AR cleanup behavior.

TypeScript changes are limited to presentational markup, product copy, accessibility labels, class names where required by the design, and approved asset references. Event-handler intent and service/data flow must not change.

## 3. Selected direction

The approved direction is **Precision Spatial product system**: the application adopts the Arvenilo handoff completely while retaining its current product architecture.

The interface combines:

- editorial light surfaces for navigation, forms, model management, account, and administration;
- dark product-demonstration surfaces for camera, 3D preview, and live WebXR;
- one spatial focus per screen;
- deliberate semantic color roles;
- responsive layouts designed from `320px` upward;
- calm, technical copy rather than marketing spectacle.

The alternative token-only reskin was rejected because it would preserve the current layout weaknesses. A predominantly dark cinematic interface was rejected because it would reduce legibility and conflict with the handoff's recommended light/dark balance.

## 4. Identity and logo use

### 4.1 Approved identity

Use the approved Arvenilo master Spatial Aperture artwork from:

- `Arvenilo-Design-Handoff/03-Logos/Transparent-PNG/00-arvenilo-master-transparent-logo.png` for compact digital placement;
- `Arvenilo-Design-Handoff/03-Logos/Transparent-PNG/00-arvenilo-master-transparent.png` for the full parent-company lockup.

The obsolete Arvenilo Agents lockup must not be used because the product is no longer named Arvenilo Agents. There is no approved WebXRify logo asset, so the interface must not invent, redraw, trace, recolor, or fuse a new mark. The compact master aperture and the following live-text endorsement form the product identity:

```text
[Arvenilo aperture]  WebXRify
                     by Arvenilo
```

The artwork remains unchanged and keeps its original proportions, internal colors, and clear space. The symbol is never shown below `18px`, and the full lockup is never shown below `92px` wide.

### 4.2 Identity placements

- Desktop header: compact aperture plus live `WebXRify` and `by Arvenilo` text.
- Mobile header: compact aperture, with the route title centered independently.
- Home hero: product name and `AVAILABLE NOW` status expressed in text.
- Account screen: `WebXRify by Arvenilo` endorsement beside the form.
- Footer/about treatment on Home: full Arvenilo master lockup and `Where Intelligence Meets Reality.`
- Browser title and application metadata: `WebXRify by Arvenilo`.
- Favicon or application icon: the unchanged compact master aperture where the platform supports the supplied PNG.

## 5. Visual system

### 5.1 Color tokens

The handoff token values are authoritative:

| Role | Token | Value | Use |
|---|---|---:|---|
| Deepest stage | Spatial Void | `#020A0C` | Live immersive background |
| Primary dark | Spatial Ink | `#081D21` | Text, header details, dark stages |
| Dark surface | Spatial Surface | `#0D2A2E` | Dark panels and HUD controls |
| Raised dark surface | Spatial Surface Raised | `#12363A` | Dark hover and selected surfaces |
| Primary canvas | Reality Mist | `#F4FBFA` | Application background |
| Card surface | Interface White | `#FFFFFF` | Light cards and forms |
| Primary action | Signal Mint | `#5EEAD4` | Primary controls, active states, success |
| Agentic state | Digital Violet | `#7456F1` | AI, voice, generation, future capability |
| Spatial focus | Anchor Gold | `#F4B942` | One selected target or anchor per screen |
| Secondary text | Context Slate | `#4D6265` | Supporting copy and utility information |
| Dark secondary text | Mist Slate | `#A8B9BB` | Supporting copy on dark surfaces |
| Dark border | Dark Border | `#1D454A` | Dark grid and panel boundaries |
| Light border | Light Border | `#C9DADA` | Light card and field boundaries |
| Mint surface | Mint Wash | `#D8F8F2` | Active light surfaces and subtle success |
| Violet surface | Violet Wash | `#E9E5FF` | Agentic progress surfaces |
| Gold surface | Gold Wash | `#FFF1CF` | Selected-location explanation |
| Error on light | Error Dark | `#B83E4B` | Destructive controls and failures |
| Error on dark | Error Light | `#FF9099` | Failures on immersive surfaces |

Color semantics must remain stable across all routes. Gold is not a normal call-to-action color. Violet is not a general decoration color. Gradients, when required for depth, remain atmospheric and below roughly ten percent visual opacity.

### 5.2 Typography

Self-host the supplied Latin webfonts without changing their files:

- Sora Variable, weights `600-700`, for display and route titles;
- Inter Variable, weights `400-600`, for interface text, forms, and actions;
- IBM Plex Mono, weights `400-500`, for short status, category, stage, and technical labels.

Headings use Sora at approximately `1.08` line height and `-0.035em` tracking. Body copy uses Inter at `1.6-1.7` line height and is limited to `66ch`. Uppercase IBM Plex Mono is reserved for short, real labels such as `AVAILABLE NOW`, `GENERATING MODEL`, and `WEBXR READY`.

### 5.3 Shape, borders, and elevation

- Controls: `10px` radius and at least `44px` touch target.
- Cards: `16px` radius, one-pixel cool border, and solid surface.
- Spatial stages: `24px` radius.
- Status labels: pill shape only when they express state or compact metadata.
- Borders and surface contrast establish hierarchy before shadows.
- Shadows are restrained and reserved for modal separation or meaningful elevation.
- Nested cards and decorative floating panels are avoided.

## 6. Signature element: WebXR Aperture Stage

The redesign's single aesthetic risk is the **WebXR Aperture Stage**. It is a dark spatial viewport with a restrained calibration grid, converging perspective paths, and one Anchor Gold signal point. It makes the application's idea-to-object-to-reality workflow visible without adding fictional telemetry.

The stage has three uses:

1. a dominant, non-interactive product thesis in the Home hero;
2. a restrained frame around real camera, 3D preview, and WebXR surfaces;
3. a compact loading or empty-state frame when a spatial workspace does not yet contain media.

Only one aperture stage or equivalent dominant spatial frame appears per route. Secondary cards remain quiet. The supplied logo is never modified to create the stage.

## 7. Shared application shell

### 7.1 Desktop, `1024px` and wider

```text
[Aperture | WebXRify / by Arvenilo] [Home Create Models Place in AR Multi-object] [Account]

[SPATIAL WORKSPACE] Route title

[ Primary task or hero copy: 7 columns ] [ WebXR Aperture Stage: 5 columns ]
[ Supporting workspace aligned to the same 12-column grid                  ]
```

The shell is capped at `1600px`, with a normal product width of `1200-1440px`. Gutter size increases on wide screens instead of scaling all controls indefinitely. The product identity, navigation, route location, and account action are visually distinct.

The Create control opens the existing shared creation menu as a bordered desktop popover. Its actions retain their existing route targets and labels, with sentence-case typography and clear supporting grouping.

### 7.2 Tablet, `768-1023px`

The header collapses before labels crowd. Two-column workspaces remain only when both columns can preserve readable controls and copy. Model cards use two columns where content length permits. Hover is never the only way to discover an action.

### 7.3 Mobile, `320-767px`

```text
[Aperture]              [Route title]              [Account]
[Primary task]
[WebXR Aperture Stage]
[Controls and content in one readable column]

[Home]              [Create]              [Models]              [AR]
```

The existing bottom navigation remains functionally unchanged and respects the bottom safe area. The Create menu becomes a structured mobile sheet. Content uses a single column, `20px` side gutters, `44px` minimum targets, and no fixed child width capable of creating horizontal overflow. Primary actions may become full width. DOM order matches visual order.

### 7.4 Immersive shell

Camera, photo-to-AR, AI photo-to-AR, and active AR sessions suppress the standard navigation exactly as they do now. The immersive header uses Spatial Ink/Spatial Void, visible Exit action, current route title, and short text status. Status and actions stay outside the live camera/3D canvas whenever practical.

## 8. Route designs

### 8.1 Home

Home is the product thesis. The hero introduces `WebXRify by Arvenilo`, the `AVAILABLE NOW` status, and a direct outcome statement about creating a model and placing it in the user's space. The left side contains the current primary Create action; the right side contains the WebXR Aperture Stage.

Below the hero, the existing route groups remain:

- `Explore in AR`: single-object AR, model library, and multi-object AR;
- `Create a model`: camera, image, GLB upload, text or voice, photo to AR, and AI-enhanced photo to AR.

The actions become consistent bordered destination rows/cards rather than generic floating boxes. Each action keeps the existing route and handler.

### 8.2 Models

The existing search and View filter form a compact control bar. Model rows become responsive spatial collection cards with:

- thumbnail or purposeful placeholder;
- model name as the dominant text;
- source, visibility, ownership, download state, and size in a stable metadata order;
- Preview, Download, Favorite, Edit, Visibility, and Delete actions displayed according to their current permissions and availability.

Desktop can use a dense two-column collection when card content remains readable. Mobile uses one column and keeps action buttons at least `44px`. Selected and focused states are explicit in text and border treatment.

### 8.3 Model preview and dialogs

Model Preview uses a dark WebXR Aperture Stage with a light or dark control bar selected for contrast. Animation, lighting, and direction controls retain their current values and handlers. Close remains plainly labelled.

Preview, edit, and deletion confirmation use one modal language: strong title, short consequence or status, clear primary/secondary action order, visible focus, Escape support, focus trap, and return-focus behavior.

### 8.4 Place in AR

Before an immersive session, Place in AR is an editorial-light model-selection workspace with clear search/filter, one selected card, and one mint `Place in AR` action. Anchor Gold marks the selected model or spatial target, never the ordinary action.

After the existing WebXR session begins, the interface transitions to the dark immersive shell. Model rail, inspector, placement guidance, transform controls, status, and Exit behavior remain functionally unchanged.

### 8.5 Multi-object AR

Multi-object AR uses the immersive shell. Desktop separates the live stage, model rail, inspector, and actions into distinct regions. Mobile prioritizes the live stage and moves secondary controls into reachable lower regions without obscuring the primary spatial target. Every existing add, select, transform, reset, and session action remains available.

### 8.6 Camera, Photo to AR, and AI photo to AR

These routes share a dark capture stage. Real video or selected media is the focus. Camera permission guidance, capture/retake, progress, generation, and placement states stay outside the media when possible.

Photo to AR and AI photo to AR keep the existing ordered `Capture -> Generate -> Place` sequence. Completed, active, and pending stages use text plus semantic color. AI enhancement uses violet; the current spatial target uses gold.

### 8.7 Image to 3D and Upload model

These routes use editorial-light workspaces. The primary region accepts and previews the file. The supporting region explains current state, constraints, and the next action. Native inputs, selected filenames, upload status, retry behavior, and generation handlers remain unchanged.

### 8.8 Text or voice to 3D

The composer remains the primary region. A violet-accented progress path shows input, request preparation, image generation, and model generation using the existing stage data. Record, stop, generate-from-recording, and generate-from-text controls retain their current availability rules and handlers. The background-generation note remains visible when applicable.

### 8.9 Account

The Account route uses a focused split composition on desktop: WebXRify endorsement and trust/context on one side, form on the other. Mobile shows the form immediately after a compact endorsement. Email, password, conditional name field, login/create-account mode, approval messaging, entered values, and intended-route restoration remain unchanged.

### 8.10 Admin

The Admin route uses two clear management regions: Accounts and Generation jobs. Rows are compact and scannable, with IBM Plex Mono for real status/data and Inter for actions. Approve, Remove, Refresh, Retry, and cleanup behavior is unchanged. Error text is readable and not truncated into decorative status pills.

## 9. Components and state language

### 9.1 Buttons

- Primary: Signal Mint with Spatial Ink text.
- Secondary: solid or transparent surface with visible border.
- Inverse: Spatial Surface with white text.
- Quiet: text-led navigation with clear hover/focus feedback.
- Danger: explicit Error Dark/Error Light treatment and destructive label.

Each decision group has at most one primary action. Existing action names remain specific and consistent with the resulting status messages.

### 9.2 Forms

Labels remain above inputs. Placeholder text never replaces a label. Focus, filled, disabled, validation, loading, saved, failure, and retry states are visually distinct. Recoverable errors preserve entered data and selected files wherever the current behavior already does so.

### 9.3 Status and feedback

Every important status combines readable text with color and, where useful, a simple icon. Status language is concise and operational. Errors state what happened and the available recovery action. Empty states explain how to add, generate, upload, or change a filter rather than presenting decorative filler.

## 10. Motion

Motion is restrained and purposeful:

- route entry or stage changes: approximately `220-320ms`;
- button and control feedback: approximately `120-180ms`;
- the Home aperture may perform one short convergence sequence on initial entry;
- generation progress moves only when it reflects real processing state;
- no endless decorative floating, pulsing, or parallax is added.

`prefers-reduced-motion: reduce` removes non-essential transitions and the Home convergence sequence while preserving state changes.

## 11. Accessibility

- Preserve semantic headings, landmarks, form labels, menu roles, and live regions.
- Preserve current dialog focus management and return-focus behavior.
- Maintain visible `:focus-visible` treatment on light and dark surfaces.
- Maintain at least `44px` targets and readable text at `200%` zoom.
- Keep status and selection understandable without color.
- Keep mobile visual order aligned with DOM order.
- Ensure all approved foreground/background combinations meet WCAG AA for their text size and state.
- Avoid horizontal overflow at `320px`, including model names, metadata, action groups, and account identity.
- Respect safe areas and on-screen keyboards.

## 12. Implementation architecture

The redesign follows existing application boundaries:

- `src/ui/ApplicationShell.ts`: product identity, shared standard/immersive shell markup, navigation, account, and accessible labels;
- `src/ui/ARHud.ts`: route-specific presentational markup and copy while preserving all handlers and state transitions;
- `src/ui/routes.ts`: existing route identities and access rules; only user-facing presentation strings may change where approved;
- `src/styles.css`: Arvenilo tokens, font faces, component styles, responsive layouts, immersive themes, focus, and reduced motion;
- `index.html`: WebXRify metadata and favicon reference;
- approved local assets: copied unchanged from the design handoff into a runtime asset location;
- tests: updated brand/style assertions plus existing behavior coverage.

No new UI framework, CSS framework, icon package, runtime font dependency, routing system, or state-management library is introduced.

## 13. Verification strategy

### 13.1 Automated verification

- Run the complete existing Vitest suite.
- Run the production TypeScript/Vite build.
- Add or update DOM tests for the WebXRify identity, master aperture asset, route labels, and unchanged navigation/menu behavior.
- Update style tests to assert the exact Arvenilo tokens, supplied font faces, responsive breakpoints, focus treatment, reduced motion, and safe-area behavior.
- Preserve tests for auth, account menus, dialogs, model operations, capture, speech, WebXR routing, and worker behavior.

### 13.2 Browser verification

Audit all twelve routes at representative widths:

- desktop: `1440 x 1000`;
- tablet: `834 x 1112`;
- mobile: `390 x 844`;
- minimum mobile: `320 x 720`.

For each route, verify:

- product identity and route location are clear;
- content remains inside the viewport with no horizontal overflow;
- the primary task is visible before supporting explanation on mobile;
- one spatial focus is dominant;
- controls remain reachable and correctly labelled;
- menus, account state, dialogs, and browser Back behave as before;
- dark immersive surfaces do not leak into editorial routes;
- focus and reduced-motion behavior remain complete.

Exercise representative functional flows without altering their outcome:

- Home -> Create menu -> protected route -> Account -> intended-route restoration;
- Models -> search/filter -> Preview -> Close/Escape -> focus restoration;
- Models -> download/favorite and authorized edit/visibility/delete controls;
- Place in AR -> select model -> begin/exit supported session or receive explicit unsupported guidance;
- camera/image/text/voice route transitions and progress presentation;
- administrator account and job actions with the same permission rules.

## 14. Acceptance criteria

The redesign is complete when:

1. every visible obsolete product-name reference is replaced with the approved WebXRify naming;
2. the approved Arvenilo master aperture is used unchanged and the Agents lockup is absent;
3. the supplied Sora, Inter, and IBM Plex Mono files are self-hosted with their licenses retained in the handoff;
4. every route uses the approved Arvenilo tokens and Precision Spatial composition;
5. all existing routes, controls, state transitions, API operations, auth rules, model workflows, and WebXR behavior remain functional;
6. standard routes use editorial-light surfaces and real immersive stages use deliberate dark surfaces;
7. semantic status colors and one-focus behavior are consistent;
8. desktop, tablet, and mobile layouts have no horizontal overflow down to `320px`;
9. keyboard, focus, dialogs, safe areas, reduced motion, and readable status text pass the stated checks;
10. the complete test suite and production build pass after the final visual audit.
