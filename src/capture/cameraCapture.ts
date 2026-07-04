export interface MediaDevicesProvider {
  mediaDevices: Pick<MediaDevices, 'getUserMedia'>;
}

export interface CapturedImage {
  imageBase64: string;
  imageMimeType: string;
  blob: Blob;
}

export const DEFAULT_CAPTURE_MAX_DIMENSION = 1536;
export const DEFAULT_CAPTURE_IMAGE_MIME_TYPE = 'image/png';

export async function startCameraPreview(
  video: HTMLVideoElement,
  provider: MediaDevicesProvider = navigator,
): Promise<MediaStream> {
  const stream = await provider.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  });

  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  await video.play().catch(() => undefined);
  return stream;
}

export function stopCameraPreview(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function captureVideoFrame(
  video: HTMLVideoElement,
  imageMimeType = DEFAULT_CAPTURE_IMAGE_MIME_TYPE,
  quality = 0.9,
  maxDimension = DEFAULT_CAPTURE_MAX_DIMENSION,
): Promise<CapturedImage> {
  const sourceWidth = video.videoWidth || video.clientWidth;
  const sourceHeight = video.videoHeight || video.clientHeight;

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('Camera preview is not ready yet.');
  }

  const { width, height } = getCaptureDimensions(sourceWidth, sourceHeight, maxDimension);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create image capture canvas.');
  }

  context.drawImage(video, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, imageMimeType, quality);

  return {
    imageBase64: await blobToBase64(blob),
    imageMimeType: blob.type || imageMimeType,
    blob,
  };
}

export async function imageFileToCapturedImage(file: File): Promise<CapturedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file before generating a 3D model.');
  }

  return {
    imageBase64: await blobToBase64(file),
    imageMimeType: file.type || DEFAULT_CAPTURE_IMAGE_MIME_TYPE,
    blob: file,
  };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.slice(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export function getCaptureDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number,
): { width: number; height: number } {
  const largestDimension = Math.max(sourceWidth, sourceHeight);
  if (largestDimension <= maxDimension) {
    return {
      width: roundDownToMultipleOf16(sourceWidth),
      height: roundDownToMultipleOf16(sourceHeight),
    };
  }

  const scale = maxDimension / largestDimension;
  return {
    width: roundDownToMultipleOf16(Math.round(sourceWidth * scale)),
    height: roundDownToMultipleOf16(Math.round(sourceHeight * scale)),
  };
}

function roundDownToMultipleOf16(value: number): number {
  return Math.max(16, value - (value % 16));
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not capture image from camera preview.'));
          return;
        }

        resolve(blob);
      },
      type,
      quality,
    );
  });
}
