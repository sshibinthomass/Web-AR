import { describe, expect, it, vi } from 'vitest';
import type { RecordedAudio } from '../../src/capture/audioCapture';

vi.mock('../../src/services/generatedModelClient', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/generatedModelClient')>(
    '../../src/services/generatedModelClient',
  );
  return {
    ...actual,
    generateModelFromSpeech: vi.fn(),
  };
});

import { DEFAULT_GENERATE_MODEL_API_URL } from '../../src/app/config';
import { WebARApp } from '../../src/app/WebARApp';
import { generateModelFromSpeech } from '../../src/services/generatedModelClient';

describe('WebARApp speech to 3D', () => {
  it('generates a 3D model from recorded speech and opens it for AR placement', async () => {
    vi.mocked(generateModelFromSpeech).mockResolvedValue({
      modelUrl: 'https://assets.example/models/generated/speech.glb',
      objectKey: 'models/generated/speech.glb',
      bytes: 4,
      transcript: 'a red modern chair',
      prompt: 'single red modern chair, centered, white background, 3D mesh friendly',
    });

    const app = new WebARApp(document.createElement('div')) as unknown as {
      authToken: string | null;
      speechAudio: RecordedAudio | null;
      hud: {
        showAuthMessage: ReturnType<typeof vi.fn>;
        showSpeechGenerating: ReturnType<typeof vi.fn>;
        showSpeechDetected: ReturnType<typeof vi.fn>;
        showSpeechError: ReturnType<typeof vi.fn>;
        showFullFlowReady: ReturnType<typeof vi.fn>;
      };
      loadModelFromUrl: ReturnType<typeof vi.fn>;
      refreshGeneratedModels: ReturnType<typeof vi.fn>;
      generateSpeechModel(): Promise<void>;
    };

    app.authToken = 'signed-token';
    app.speechAudio = {
      audioBase64: 'YXVkaW8=',
      audioMimeType: 'audio/webm',
      blob: new Blob(['audio'], { type: 'audio/webm' }),
    };
    app.hud = {
      showAuthMessage: vi.fn(),
      showSpeechGenerating: vi.fn(),
      showSpeechDetected: vi.fn(),
      showSpeechError: vi.fn(),
      showFullFlowReady: vi.fn(),
    };
    app.loadModelFromUrl = vi.fn().mockResolvedValue(undefined);
    app.refreshGeneratedModels = vi.fn().mockResolvedValue(undefined);

    await app.generateSpeechModel();

    expect(generateModelFromSpeech).toHaveBeenCalledWith({
      apiUrl: DEFAULT_GENERATE_MODEL_API_URL,
      audioBase64: 'YXVkaW8=',
      audioMimeType: 'audio/webm',
      authToken: 'signed-token',
    });
    expect(app.hud.showSpeechGenerating).toHaveBeenCalledWith();
    expect(app.hud.showSpeechDetected).toHaveBeenCalledWith('a red modern chair');
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
      'Speech-generated object is ready. Scan the floor, then tap Place.',
      {
        id: 'speech-generated-object',
        label: 'a red modern chair',
        url: 'https://assets.example/models/generated/speech.glb',
      },
    );
    expect(app.refreshGeneratedModels).toHaveBeenCalledOnce();
  });
});
