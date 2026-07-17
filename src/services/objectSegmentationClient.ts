export const OBJECT_SEGMENTATION_CONFIDENCE_THRESHOLD = 0.65;

export interface ObjectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SegmentObjectInput {
  apiUrl: string;
  imageBase64: string;
  imageMimeType: string;
  authToken?: string | null;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export type ObjectSegmentationResult =
  | { detected: false; confidence: number }
  | {
      detected: true;
      confidence: number;
      maskBase64: string;
      maskMimeType: 'image/png';
      bounds: ObjectBounds;
    };

export async function segmentObject({
  apiUrl,
  imageBase64,
  imageMimeType,
  authToken,
  signal,
  fetchImpl = fetch,
}: SegmentObjectInput): Promise<ObjectSegmentationResult> {
  if (!apiUrl) {
    throw new Error('Worker API URL is not configured.');
  }

  const response = await fetchImpl(toSegmentationUrl(apiUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ image_base64: imageBase64, image_mime_type: imageMimeType }),
    signal,
  });
  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(
      typeof body.error === 'string'
        ? body.error
        : `Object segmentation failed with HTTP ${response.status}.`,
    );
  }

  const confidence = body.confidence;
  if (!isConfidence(confidence)) {
    throw new Error('Worker returned an invalid segmentation confidence.');
  }
  if (body.detected === false || confidence < OBJECT_SEGMENTATION_CONFIDENCE_THRESHOLD) {
    return { detected: false, confidence };
  }
  if (
    body.detected !== true ||
    typeof body.mask_base64 !== 'string' ||
    !body.mask_base64 ||
    body.mask_mime_type !== 'image/png' ||
    !isObjectBounds(body.bounds)
  ) {
    throw new Error('Worker returned an invalid object segmentation mask.');
  }

  return {
    detected: true,
    confidence,
    maskBase64: body.mask_base64,
    maskMimeType: 'image/png',
    bounds: body.bounds,
  };
}

function toSegmentationUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '').replace(/\/generate-3d$/, '/segment-image');
}

async function readResponseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function isConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isObjectBounds(value: unknown): value is ObjectBounds {
  if (!isRecord(value)) {
    return false;
  }

  const { x, y, width, height } = value;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(width) || !isFiniteNumber(height)) {
    return false;
  }
  return (
    x >= 0 &&
    y >= 0 &&
    width > 0 &&
    height > 0 &&
    x + width <= 1 &&
    y + height <= 1
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}
