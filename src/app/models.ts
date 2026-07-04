export type ModelOption = {
  id: string;
  label: string;
  url: string;
  previewUrl?: string;
  source?: 'uploaded';
};

const CLOUDFLARE_ASSET_ORIGIN = 'https://web-ar-model-assets.pages.dev';

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'trellis-fast-output',
    label: 'Fast output',
    url: `${CLOUDFLARE_ASSET_ORIGIN}/models/trellis-2-4b-fast-output.glb`,
  },
  {
    id: 'img4-output',
    label: 'Image 4 output',
    url: `${CLOUDFLARE_ASSET_ORIGIN}/models/img4_20260628_153027.glb`,
  },
  {
    id: 'img-fast-output',
    label: 'Image fast output',
    url: `${CLOUDFLARE_ASSET_ORIGIN}/models/img_fast_20260628_124313.glb`,
  },
];
