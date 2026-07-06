import { describe, expect, it, vi } from 'vitest';
import { startAudioRecording } from '../../src/capture/audioCapture';

class FakeMediaRecorder {
  static isTypeSupported = vi.fn((mimeType: string) => mimeType === 'audio/webm');

  readonly mimeType = 'audio/webm';
  state: RecordingState = 'inactive';
  private readonly listeners = new Map<string, EventListener[]>();

  constructor(
    readonly stream: MediaStream,
    readonly options?: MediaRecorderOptions,
  ) {}

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  start(): void {
    this.state = 'recording';
  }

  stop(): void {
    this.state = 'inactive';
    this.emit('dataavailable', {
      data: new Blob(['audio'], { type: 'audio/webm' }),
    } as BlobEvent);
    this.emit('stop', new Event('stop'));
  }

  private emit(type: string, event: Event): void {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

describe('audioCapture', () => {
  it('records microphone audio, encodes it, and stops every stream track', async () => {
    const stop = vi.fn();
    const stream = {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);

    const session = await startAudioRecording(
      { mediaDevices: { getUserMedia } },
      FakeMediaRecorder,
    );
    const recording = await session.stop();

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    expect(FakeMediaRecorder.isTypeSupported).toHaveBeenCalledWith('audio/webm;codecs=opus');
    expect(recording).toEqual({
      audioBase64: 'YXVkaW8=',
      audioMimeType: 'audio/webm',
      blob: expect.any(Blob),
    });
    expect(stop).toHaveBeenCalledOnce();
  });

  it('explains when the browser cannot record microphone audio', async () => {
    const getUserMedia = vi.fn();

    await expect(
      startAudioRecording({ mediaDevices: { getUserMedia } }, undefined),
    ).rejects.toThrow('Browser audio recording is not supported.');
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
