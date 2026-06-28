export interface MediaDevicesProvider {
  mediaDevices: Pick<MediaDevices, 'getUserMedia'>;
}

export interface CapturedImage {
  imageBase64: string;
  imageMimeType: string;
  blob: Blob;
}

export async function startCameraPreview(
  video: HTMLVideoElement,
  provider: MediaDevicesProvider = navigator,
): Promise<MediaStream> {
  const stream = await provider.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
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
  imageMimeType = 'image/jpeg',
  quality = 0.9,
): Promise<CapturedImage> {
  const width = video.videoWidth || video.clientWidth;
  const height = video.videoHeight || video.clientHeight;

  if (width <= 0 || height <= 0) {
    throw new Error('Camera preview is not ready yet.');
  }

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
