# WebXR Floor Placement

Local Android WebXR app for selecting a Cloudflare-hosted GLB model, placing it on the floor, and transforming it in AR.

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
- Choose a model from the `Model` selector. Models are downloaded from Cloudflare only after selection.
- Tap `Place` or tap the AR view to place the model.
- Choose another model any time to switch the loaded object.
- Drag with one finger to move the model on the detected floor plane.
- Pinch with two fingers to scale the model.
- Twist with two fingers to rotate the model.
- Use `Scale 1x` and `Reset` for quick corrections.

## Notes

This app targets Android Chrome WebXR. It is local-only and tested through USB port forwarding. Full semantic floor meshing is not guaranteed by browser WebXR; the app uses hit testing as the reliable floor-placement baseline and plane detection when available.

Model files are hosted in the Cloudflare Pages project `web-ar-model-assets`. The app does not commit GLB files to GitHub and does not use a local model fallback.

If `adb` is not recognized, install Android Platform Tools and add that folder to `PATH`, then open a new PowerShell session.
