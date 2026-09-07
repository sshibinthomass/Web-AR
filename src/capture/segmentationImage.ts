import { encodeDownscaledImage, type EncodeImageOptions } from './encodeDownscaledImage';

export interface PreparedSegmentationImage {
  imageBase64: string;
  imageMimeType: string;
  width: number;
  height: number;
  bytes: number;
}

export type SegmentationImageOptions = EncodeImageOptions;

export const DEFAULT_SEGMENTATION_MAX_DIMENSION = 1024;
export const DEFAULT_SEGMENTATION_IMAGE_MIME_TYPE = 'image/webp';

export async function prepareSegmentationImage(
  blob: Blob,
  options: SegmentationImageOptions = {},
): Promise<PreparedSegmentationImage> {
  const encoded = await encodeDownscaledImage(blob, {
    ...options,
    maxDimension: options.maxDimension ?? DEFAULT_SEGMENTATION_MAX_DIMENSION,
    outputMimeType: options.outputMimeType ?? DEFAULT_SEGMENTATION_IMAGE_MIME_TYPE,
    quality: options.quality ?? 0.82,
  });

  return {
    imageBase64: encoded.base64,
    imageMimeType: encoded.mimeType,
    width: encoded.width,
    height: encoded.height,
    bytes: encoded.bytes,
  };
}
