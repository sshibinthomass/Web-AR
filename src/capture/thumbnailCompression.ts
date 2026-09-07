import { encodeDownscaledImage, type EncodeImageOptions } from './encodeDownscaledImage';

export interface CompressedThumbnail {
  base64: string;
  bytes: number;
  height: number;
  mimeType: string;
  width: number;
}

export async function compressThumbnailImage(
  file: File,
  options: EncodeImageOptions = {},
): Promise<CompressedThumbnail> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file for the thumbnail.');
  }

  return encodeDownscaledImage(file, {
    ...options,
    maxDimension: options.maxDimension ?? 512,
    outputMimeType: options.outputMimeType ?? 'image/webp',
    quality: options.quality ?? 0.72,
  });
}
