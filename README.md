# WebXR Floor Placement

Local Android WebXR app for placing `trellis-2-4b-fast-output.glb` on the floor and transforming it in AR.

## Requirements

- Samsung Galaxy S25 Ultra.
- Chrome on Android.
- Google Play Services for AR installed and updated.
- Node.js on this computer.
- Android Platform Tools for `adb`.

## Install

```powershell
npm install
```

## Run Locally

Create a local environment file when you want the app to load the GLB from Cloudflare:

```powershell
Copy-Item .env.example .env.local
```

`.env.example` already points to the Cloudflare Pages-hosted model at `https://web-ar-model-assets.pages.dev/models/trellis-2-4b-fast-output.glb`. If `VITE_MODEL_URL` is not set, the app falls back to `public/models/trellis-2-4b-fast-output.glb`.

Start the Vite server on this computer:

```powershell
npm run dev -- --host 127.0.0.1 --port 5173
```

Connect the phone by USB, accept the debugging prompt, then forward the port:

```powershell
adb devices
adb reverse tcp:5173 tcp:5173
```

Open Chrome on the S25 Ultra:

```text
http://localhost:5173
```

## Controls

- Move the phone slowly until the floor ring appears.
- Tap `Place` or tap the AR view to place the model.
- Drag with one finger to move the model on the detected floor plane.
- Pinch with two fingers to scale the model.
- Twist with two fingers to rotate the model.
- Use `-15 deg`, `+15 deg`, `Scale 1x`, and `Reset` for precise adjustments.

## Notes

This app targets Android Chrome WebXR. It is local-only and tested through USB port forwarding. Full semantic floor meshing is not guaranteed by browser WebXR; the app uses hit testing as the reliable floor-placement baseline and plane detection when available.

For GitHub Pages deployments, the repository variable `CLOUDFLARE_MODEL_URL` should be set to `https://web-ar-model-assets.pages.dev/models/trellis-2-4b-fast-output.glb`. The workflow passes it into Vite as `VITE_MODEL_URL` during the production build.

If `adb` is not recognized, install Android Platform Tools and add that folder to `PATH`, then open a new PowerShell session.
