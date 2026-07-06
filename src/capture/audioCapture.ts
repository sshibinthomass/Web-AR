import { blobToBase64, type MediaDevicesProvider } from './cameraCapture';

export interface RecordedAudio {
  audioBase64: string;
  audioMimeType: string;
  blob: Blob;
}

export interface AudioRecordingSession {
  readonly mimeType: string;
  stop(): Promise<RecordedAudio>;
  cancel(): void;
}

type AudioRecorder = Pick<MediaRecorder, 'addEventListener' | 'start' | 'stop' | 'state'> & {
  readonly mimeType?: string;
};

type AudioRecorderConstructor = {
  new (stream: MediaStream, options?: MediaRecorderOptions): AudioRecorder;
  isTypeSupported?: (mimeType: string) => boolean;
};

const DEFAULT_AUDIO_MIME_TYPE = 'audio/webm';
const AUDIO_MIME_TYPE_CANDIDATES = ['audio/webm;codecs=opus', DEFAULT_AUDIO_MIME_TYPE, 'audio/mp4'];

export async function startAudioRecording(
  provider: MediaDevicesProvider = navigator,
  RecorderCtor: AudioRecorderConstructor | undefined = globalThis.MediaRecorder,
): Promise<AudioRecordingSession> {
  if (!RecorderCtor) {
    throw new Error('Browser audio recording is not supported.');
  }

  const stream = await provider.mediaDevices.getUserMedia({ audio: true, video: false });
  const mimeType = preferredAudioMimeType(RecorderCtor);
  const recorder = new RecorderCtor(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  let stopped = false;

  recorder.addEventListener('dataavailable', (event) => {
    const data = (event as BlobEvent).data;
    if (data?.size) {
      chunks.push(data);
    }
  });

  recorder.start();

  return {
    mimeType: recorder.mimeType || mimeType || DEFAULT_AUDIO_MIME_TYPE,
    stop: () => stopRecorder(recorder, chunks, stream, () => {
      stopped = true;
    }),
    cancel: () => {
      if (stopped) {
        return;
      }
      stopped = true;
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // Best effort: the important cleanup is stopping the stream tracks below.
        }
      }
      stopAudioStream(stream);
    },
  };
}

function stopRecorder(
  recorder: AudioRecorder,
  chunks: Blob[],
  stream: MediaStream,
  onStopped: () => void,
): Promise<RecordedAudio> {
  return new Promise((resolve, reject) => {
    const finish = (): void => {
      void encodeAudio(chunks, recorder.mimeType || DEFAULT_AUDIO_MIME_TYPE)
        .then((recording) => {
          onStopped();
          stopAudioStream(stream);
          resolve(recording);
        })
        .catch((error: unknown) => {
          onStopped();
          stopAudioStream(stream);
          reject(error);
        });
    };

    recorder.addEventListener('stop', finish, { once: true });
    recorder.addEventListener(
      'error',
      () => {
        onStopped();
        stopAudioStream(stream);
        reject(new Error('Could not record microphone audio.'));
      },
      { once: true },
    );

    if (recorder.state === 'inactive') {
      finish();
      return;
    }

    recorder.stop();
  });
}

async function encodeAudio(chunks: Blob[], mimeType: string): Promise<RecordedAudio> {
  const blob = new Blob(chunks, { type: mimeType || DEFAULT_AUDIO_MIME_TYPE });
  if (blob.size <= 0) {
    throw new Error('Record speech before generating a 3D model.');
  }

  return {
    audioBase64: await blobToBase64(blob),
    audioMimeType: blob.type || DEFAULT_AUDIO_MIME_TYPE,
    blob,
  };
}

function stopAudioStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

function preferredAudioMimeType(RecorderCtor: AudioRecorderConstructor): string {
  return (
    AUDIO_MIME_TYPE_CANDIDATES.find((mimeType) => RecorderCtor.isTypeSupported?.(mimeType) ?? true) ??
    DEFAULT_AUDIO_MIME_TYPE
  );
}
