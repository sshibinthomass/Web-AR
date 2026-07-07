import { describe, expect, it, vi } from 'vitest';
import type { RecordedAudio } from '../../src/capture/audioCapture';
import type { GeneratedModelJobStatus, StartSpeechModelJobResult } from '../../src/services/generatedModelClient';

vi.mock('../../src/services/generatedModelClient', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/generatedModelClient')>(
    '../../src/services/generatedModelClient',
  );
  return {
    ...actual,
    getGeneratedModelJobStatus: vi.fn(),
    startSpeechModelJob: vi.fn(),
    startTextModelJob: vi.fn(),
  };
});

import { DEFAULT_GENERATE_MODEL_API_URL } from '../../src/app/config';
import { WebARApp } from '../../src/app/WebARApp';
import { getGeneratedModelJobStatus, startSpeechModelJob, startTextModelJob } from '../../src/services/generatedModelClient';

function recordedAudio(): RecordedAudio {
  return {
    audioBase64: 'YXVkaW8=',
    audioMimeType: 'audio/webm',
    blob: new Blob(['audio'], { type: 'audio/webm' }),
  };
}

describe('WebARApp speech to 3D', () => {
  it('starts a durable speech-to-3D job and tells the user it can finish in the background', async () => {
    const job: StartSpeechModelJobResult = {
      id: 'speech-20260707-abc123',
      label: 'Speech object - 2026-07-07 08:30:00 UTC',
      status: 'running',
      stage: 'detecting_speech',
      statusUrl: 'https://worker.example/generate-3d/jobs/speech-20260707-abc123',
    };
    vi.mocked(startSpeechModelJob).mockResolvedValue(job);

    const app = new WebARApp(document.createElement('div')) as unknown as {
      authToken: string | null;
      speechAudio: RecordedAudio | null;
      hud: {
        showAuthMessage: ReturnType<typeof vi.fn>;
        showSpeechDetecting: ReturnType<typeof vi.fn>;
        showSpeechBackgroundJob: ReturnType<typeof vi.fn>;
        showSpeechError: ReturnType<typeof vi.fn>;
      };
      watchSpeechGenerationJob: ReturnType<typeof vi.fn>;
      refreshGeneratedModels: ReturnType<typeof vi.fn>;
      generateSpeechModel(): Promise<void>;
    };

    app.authToken = 'signed-token';
    app.speechAudio = recordedAudio();
    app.hud = {
      showAuthMessage: vi.fn(),
      showSpeechDetecting: vi.fn(),
      showSpeechBackgroundJob: vi.fn(),
      showSpeechError: vi.fn(),
    };
    app.watchSpeechGenerationJob = vi.fn();
    app.refreshGeneratedModels = vi.fn().mockResolvedValue(undefined);

    await app.generateSpeechModel();

    expect(startSpeechModelJob).toHaveBeenCalledWith({
      apiUrl: DEFAULT_GENERATE_MODEL_API_URL,
      audioBase64: 'YXVkaW8=',
      audioMimeType: 'audio/webm',
      authToken: 'signed-token',
    });
    expect(app.hud.showSpeechDetecting).toHaveBeenCalledOnce();
    expect(app.hud.showSpeechBackgroundJob).toHaveBeenCalledWith({
      id: 'speech-20260707-abc123',
      label: 'Speech object - 2026-07-07 08:30:00 UTC',
      status: 'running',
      stage: 'detecting_speech',
      statusUrl: 'https://worker.example/generate-3d/jobs/speech-20260707-abc123',
    });
    expect(app.watchSpeechGenerationJob).toHaveBeenCalledWith(job);
    expect(app.refreshGeneratedModels).toHaveBeenCalledOnce();
  });

  it('starts a durable text-to-3D job through the same background watcher', async () => {
    const job: StartSpeechModelJobResult = {
      id: 'text-20260707-abc123',
      label: 'Text object - 2026-07-07 08:30:00 UTC',
      status: 'running',
      stage: 'detecting_speech',
      transcript: 'a compact wooden desk',
      statusUrl: 'https://worker.example/generate-3d/jobs/text-20260707-abc123',
    };
    vi.mocked(startTextModelJob).mockResolvedValue(job);

    const app = new WebARApp(document.createElement('div')) as unknown as {
      authToken: string | null;
      hud: {
        showAuthMessage: ReturnType<typeof vi.fn>;
        showSpeechDetecting: ReturnType<typeof vi.fn>;
        showSpeechBackgroundJob: ReturnType<typeof vi.fn>;
        showSpeechError: ReturnType<typeof vi.fn>;
      };
      watchSpeechGenerationJob: ReturnType<typeof vi.fn>;
      refreshGeneratedModels: ReturnType<typeof vi.fn>;
      generateTextModel(text: string): Promise<void>;
    };

    app.authToken = 'signed-token';
    app.hud = {
      showAuthMessage: vi.fn(),
      showSpeechDetecting: vi.fn(),
      showSpeechBackgroundJob: vi.fn(),
      showSpeechError: vi.fn(),
    };
    app.watchSpeechGenerationJob = vi.fn();
    app.refreshGeneratedModels = vi.fn().mockResolvedValue(undefined);

    await app.generateTextModel(' a compact wooden desk ');

    expect(startTextModelJob).toHaveBeenCalledWith({
      apiUrl: DEFAULT_GENERATE_MODEL_API_URL,
      text: 'a compact wooden desk',
      authToken: 'signed-token',
    });
    expect(app.hud.showSpeechDetecting).toHaveBeenCalledWith('a compact wooden desk');
    expect(app.hud.showSpeechBackgroundJob).toHaveBeenCalledWith(job);
    expect(app.watchSpeechGenerationJob).toHaveBeenCalledWith(job);
    expect(app.refreshGeneratedModels).toHaveBeenCalledOnce();
  });

  it('loads a completed speech job into AR placement and asks the HUD to start AR camera', async () => {
    const completedStatus: GeneratedModelJobStatus = {
      id: 'speech-20260707-abc123',
      label: 'red modern chair - 2026-07-07 08:30:00 UTC',
      status: 'completed',
      stage: 'completed',
      transcript: 'make a red modern chair',
      modelUrl: 'https://assets.example/models/generated/speech.glb',
      objectKey: 'models/generated/speech.glb',
      bytes: 4,
    };
    vi.mocked(getGeneratedModelJobStatus).mockResolvedValue(completedStatus);

    const app = new WebARApp(document.createElement('div')) as unknown as {
      authToken: string | null;
      hud: {
        showSpeechCompleted: ReturnType<typeof vi.fn>;
        showSpeechGeneratingImage: ReturnType<typeof vi.fn>;
        showSpeechBackgroundJob: ReturnType<typeof vi.fn>;
        showSpeechError: ReturnType<typeof vi.fn>;
        showFullFlowReady: ReturnType<typeof vi.fn>;
        startARCamera: ReturnType<typeof vi.fn>;
      };
      loadModelFromUrl: ReturnType<typeof vi.fn>;
      refreshGeneratedModels: ReturnType<typeof vi.fn>;
      watchSpeechGenerationJob(job: StartSpeechModelJobResult): Promise<void>;
    };

    app.authToken = 'signed-token';
    app.hud = {
      showSpeechCompleted: vi.fn(),
      showSpeechGeneratingImage: vi.fn(),
      showSpeechBackgroundJob: vi.fn(),
      showSpeechError: vi.fn(),
      showFullFlowReady: vi.fn(),
      startARCamera: vi.fn(),
    };
    app.loadModelFromUrl = vi.fn().mockResolvedValue(undefined);
    app.refreshGeneratedModels = vi.fn().mockResolvedValue(undefined);

    await app.watchSpeechGenerationJob({
      id: 'speech-20260707-abc123',
      label: 'Speech object - 2026-07-07 08:30:00 UTC',
      status: 'running',
      stage: 'generating_3d',
      statusUrl: 'https://worker.example/generate-3d/jobs/speech-20260707-abc123',
    });

    expect(getGeneratedModelJobStatus).toHaveBeenCalledWith({
      statusUrl: 'https://worker.example/generate-3d/jobs/speech-20260707-abc123',
      authToken: 'signed-token',
    });
    expect(app.hud.showSpeechCompleted).toHaveBeenCalledWith(completedStatus);
    expect(app.loadModelFromUrl).toHaveBeenCalledWith(
      'https://assets.example/models/generated/speech.glb',
      'Speech object',
      {
        loadingMessage: 'Loading speech-generated object into AR...',
        successMessage: 'Speech-generated object loaded.',
        sourceMessage: 'Generated from speech',
      },
    );
    expect(app.hud.showFullFlowReady).toHaveBeenCalledWith(
      'Speech-generated object is ready. Opening AR camera.',
      {
        id: 'speech-20260707-abc123',
        label: 'red modern chair - 2026-07-07 08:30:00 UTC',
        url: 'https://assets.example/models/generated/speech.glb',
      },
    );
    expect(app.hud.startARCamera).toHaveBeenCalledOnce();
    expect(app.refreshGeneratedModels).toHaveBeenCalledOnce();
  });
});
