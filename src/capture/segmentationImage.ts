export interface PreparedSegmentationImage {
  imageBase64: string;
  imageMimeType: string;
  width: number;
  height: number;
  bytes: number;
}

export interface SegmentationImageOptions {
  createCanvas?: () => HTMLCanvasElement;
  createImageBitmapImpl?: (blob: Blob) => Promise<{ width: number; height: number; close?: () => void }>;
  maxDimension?: number;
  outputMimeType?: string;
  quality?: number;
}

export const DEFAULT_SEGMENTATION_MAX_DIMENSION = 1024;
export const DEFAULT_SEGMENTATION_IMAGE_MIME_TYPE = 'image/webp';

export async function prepareSegmentationImage(
  blob: Blob,
  options: SegmentationImageOptions = {},
): Promise<PreparedSegmentationImage> {
  const maxDimension = options.maxDimension ?? DEFAULT_SEGMENTATION_MAX_DIMENSION;
  const outputMimeType = options.outputMimeType ?? DEFAULT_SEGMENTATION_IMAGE_MIME_TYPE;
  const quality = options.quality ?? 0.82;
  const source = await createImageSource(blob, options.createImageBitmapImpl);
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = options.createCanvas?.() ?? document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  try {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not prepare segmentation image canvas.');
    }

    context.drawImage(source.image, 0, 0, width, height);
    const encoded =
      (await canvasToBlob(canvas, outputMimeType, quality)) ??
      (outputMimeType === DEFAULT_SEGMENTATION_IMAGE_MIME_TYPE
        ? await canvasToBlob(canvas, 'image/jpeg', quality)
        : null);
    if (!encoded) {
      throw new Error('Could not compress segmentation image.');
    }

    return {
      imageBase64: arrayBufferToBase64(await encoded.arrayBuffer()),
      imageMimeType: encoded.type || outputMimeType,
      width,
      height,
      bytes: encoded.size,
    };
  } finally {
    source.close?.();
  }
}

async function createImageSource(
  blob: Blob,
  createImageBitmapImpl?: (blob: Blob) => Promise<{ width: number; height: number; close?: () => void }>,
): Promise<{ close?: () => void; height: number; image: CanvasImageSource; width: number }> {
  const createBitmap = createImageBitmapImpl ?? globalThis.createImageBitmap?.bind(globalThis);
  if (createBitmap) {
    const bitmap = await createBitmap(blob);
    return {
      close: bitmap.close?.bind(bitmap),
      height: bitmap.height,
      image: bitmap as CanvasImageSource,
      width: bitmap.width,
    };
  }

  const image = new Image();
  const objectUrl = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not read segmentation image.'));
    image.src = objectUrl;
  });
  return {
    close: () => URL.revokeObjectURL(objectUrl),
    height: image.naturalHeight || image.height,
    image,
    width: image.naturalWidth || image.width,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}
