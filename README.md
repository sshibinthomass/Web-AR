# Anima You 3D

Local Android WebXR app for creating, managing, and placing 3D models in AR.

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

To enable image-to-3D generation, create a local Vite env file:

```powershell
Copy-Item .env.example .env.local
```

Set:

```text
VITE_GENERATE_MODEL_API_URL=http://127.0.0.1:8787/generate-3d
```

Then run the Worker in a second terminal:

```powershell
npm run worker:dev
```

## Controls

- Move the phone slowly until the floor ring appears.
- Choose a model from the `Model` selector. Models are downloaded from Cloudflare only after selection.
- Use `Start camera`, `Capture`, and `Generate 3D` to create a model through the Cloudflare Worker and Modal. The generated GLB is saved to Cloudflare storage, then loaded into the AR scene.
- Tap `Place` or tap the AR view to place the model.
- Choose another model any time to switch the loaded object.
- Drag with one finger to move the model on the detected floor plane.
- Pinch with two fingers to scale the model.
- Twist with two fingers to rotate the model.
- Use `Scale 1x` and `Reset` for quick corrections.

## Notes

This app targets Android Chrome WebXR. It is local-only and tested through USB port forwarding. Full semantic floor meshing is not guaranteed by browser WebXR; the app uses hit testing as the reliable floor-placement baseline and plane detection when available.

The app ships without built-in GLB models. Generated and uploaded models are stored in Cloudflare R2 and served through the Worker; GLB files are not committed to GitHub.

## Cloudflare Worker Setup

The Worker keeps Modal credentials out of browser JavaScript:

```text
Browser capture -> Cloudflare Worker -> Modal REST API -> Cloudflare R2 -> public GLB URL -> WebXR app
```

Create or reuse an R2 bucket for generated models, then update `wrangler.jsonc` if the bucket name differs from this branch:

```jsonc
"r2_buckets": [
  {
    "binding": "MODEL_BUCKET",
    "bucket_name": "web-ar-model-assets"
  }
]
```

Configure Worker secrets:

```powershell
npx wrangler secret put MODAL_KEY
npx wrangler secret put MODAL_SECRET
```

The Modal endpoint is a Worker var in `wrangler.jsonc`. `PUBLIC_MODEL_ORIGIN` is optional; when it is blank, the Worker returns its own `/models/generated/...` URL and serves generated GLBs from R2.

```jsonc
"MODAL_IMAGE_TO_3D_URL": "https://sshibinthomass--image-to-3d-imageto3d-generate-api.modal.run",
"PUBLIC_MODEL_ORIGIN": ""
```

Deploy the Worker:

```powershell
npm run worker:deploy
```

After deployment, set the web app's `VITE_GENERATE_MODEL_API_URL` to the deployed Worker `/generate-3d` URL before building the app.

## Automatic Photo-to-AR Object Reconstruction

Photo to AR and AI Photo to AR can optionally segment the primary captured object for a decorative reconstruction transition. It uses the pinned `ZhengPeng7/BiRefNet_lite` model revision `7838f1c3472f827cd8ce13ab5ccc2ce48077360f`. Enable the browser integration only with the exact frontend flag:

```text
VITE_OBJECT_SEGMENTATION_ENABLED=true
```

The Worker requires `MODAL_OBJECT_SEGMENTATION_URL` to contain the deployed, proxy-authenticated Modal endpoint. Nothing for this segmentation feature is currently deployed: populate that variable from the Modal deployment output before deploying the Worker. Keep Modal proxy authentication credentials in Worker secrets; set `MODAL_KEY` and `MODAL_SECRET` interactively, never in source control or browser configuration.

Segmentation data is transient and in memory only. The source photo and returned mask are not persisted to R2. The client accepts a mask only at confidence `0.65` or higher; low-confidence, unavailable, or invalid results safely fall back to the ordinary captured preview without a full-frame effect.

Deploy only after separately authorizing the external deployment:

```powershell
cd D:\Github-Projects\Modal-Apps
uv run --frozen --with scipy python -m modal deploy llm-hosting/object-segmentation-birefnet-lite.py

cd D:\Github-Projects\Web-AR
npx wrangler secret put MODAL_KEY
npx wrangler secret put MODAL_SECRET
npx wrangler deploy
```

If `adb` is not recognized, install Android Platform Tools and add that folder to `PATH`, then open a new PowerShell session.
