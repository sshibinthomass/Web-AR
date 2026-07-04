export interface CompressedThumbnail {
  base64: string;
  bytes: number;
  height: number;
  mimeType: string;
  width: number;
}

interface ThumbnailCompressionOptions {
  createCanvas?: () => HTMLCanvasElement;
  createImageBitmapImpl?: (blob: Blob) => Promise<{ width: number; height: number; close?: () => void }>;
  maxDimension?: number;
  outputMimeType?: string;
  quality?: number;
}

export async function compressThumbnailImage(
  file: File,
  options: ThumbnailCompressionOptions = {},
): Promise<CompressedThumbnail> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file for the thumbnail.');
  }

  const maxDimension = options.maxDimension ?? 512;
  const quality = options.quality ?? 0.72;
  const outputMimeType = options.outputMimeType ?? 'image/webp';
  const source = await createImageSource(file, options.createImageBitmapImpl);
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = options.createCanvas?.() ?? document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  try {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not prepare thumbnail canvas.');
    }

    context.drawImage(source.image, 0, 0, width, height);
    const blob =
      (await canvasToBlob(canvas, outputMimeType, quality)) ??
      (outputMimeType === 'image/webp' ? await canvasToBlob(canvas, 'image/jpeg', quality) : null);
    if (!blob) {
      throw new Error('Could not compress thumbnail image.');
    }

    return {
      base64: arrayBufferToBase64(await blob.arrayBuffer()),
      bytes: blob.size,
      height,
      mimeType: blob.type || outputMimeType,
      width,
    };
  } finally {
    source.close?.();
  }
}

async function createImageSource(
  file: File,
  createImageBitmapImpl?: (blob: Blob) => Promise<{ width: number; height: number; close?: () => void }>,
): Promise<{ close?: () => void; height: number; image: CanvasImageSource; width: number }> {
  const createBitmap = createImageBitmapImpl ?? globalThis.createImageBitmap?.bind(globalThis);
  if (createBitmap) {
    const bitmap = await createBitmap(file);
    return {
      close: bitmap.close?.bind(bitmap),
      height: bitmap.height,
      image: bitmap as CanvasImageSource,
      width: bitmap.width,
    };
  }

  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not read thumbnail image.'));
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
