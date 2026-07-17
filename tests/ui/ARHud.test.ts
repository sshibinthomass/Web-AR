import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ARHud } from '../../src/ui/ARHud';

const reconstructionOverlay = vi.hoisted(() => ({
  cancel: vi.fn((..._args: unknown[]) => undefined),
  construct: vi.fn((..._args: unknown[]) => undefined),
  dispose: vi.fn((..._args: unknown[]) => undefined),
  play: vi.fn((..._args: unknown[]) => Promise.resolve()),
}));

vi.mock('../../src/ui/ObjectReconstructionOverlay', () => ({
  ObjectReconstructionOverlay: class {
    constructor(...args: unknown[]) {
      reconstructionOverlay.construct(...args);
    }

    play(...args: unknown[]) {
      return reconstructionOverlay.play(...args);
    }

    cancel(...args: unknown[]) {
      return reconstructionOverlay.cancel(...args);
    }

    dispose(...args: unknown[]) {
      return reconstructionOverlay.dispose(...args);
    }
  },
}));

const modelOptions = [
  {
    id: 'built-in-alpha',
    label: 'Built-in alpha',
    url: 'https://assets.example/models/built-in-alpha.glb',
  },
  {
    id: 'built-in-beta',
    label: 'Built-in beta',
    url: 'https://assets.example/models/built-in-beta.glb',
  },
];

function createHandlers(overrides: Partial<ConstructorParameters<typeof ARHud>[2]> = {}) {
  return {
    onPlace: vi.fn(),
    onEdit: vi.fn(),
    onReset: vi.fn(),
    onResetScale: vi.fn(),
    onRotate: vi.fn(),
    onModelSelect: vi.fn(),
    onStartCamera: vi.fn(),
    onCaptureImage: vi.fn(),
    onUploadImage: vi.fn(),
    onUploadModel: vi.fn(),
    onSubmitTarget: vi.fn(),
    onGenerateModel: vi.fn(),
    onFullFlowCapture: vi.fn(),
    onDynamicFlowCapture: vi.fn(),
    onStoreUploadedModel: vi.fn(),
    onRenameGeneratedModel: vi.fn(),
    onDeleteGeneratedModel: vi.fn(),
    onToggleGeneratedModelVisibility: vi.fn(),
    onDeleteUploadedModel: vi.fn(),
    onPreviewModel: vi.fn(),
    onCloseModelPreview: vi.fn(),
    onPreviewLightingChange: vi.fn(),
    onPreviewLightDirectionChange: vi.fn(),
    onPreviewAnimationSelect: vi.fn(),
    onUpdateModelThumbnail: vi.fn(),
    onRouteExit: vi.fn(),
    onLogin: vi.fn(),
    onSignup: vi.fn(),
    onLogout: vi.fn(),
    onApproveAccount: vi.fn(),
    onRemoveAccount: vi.fn(),
    onRefreshAdminAccounts: vi.fn(),
    onRefreshAdminJobs: vi.fn(),
    onRetryAdminJob: vi.fn(),
    onCleanupFailedJobArtifacts: vi.fn(),
    onStartSpeechRecording: vi.fn(),
    onStopSpeechRecording: vi.fn(),
    onGenerateSpeechModel: vi.fn(),
    onGenerateTextModel: vi.fn(),
    onAnimationSelect: vi.fn(),
    onStartMultiObject: vi.fn(),
    onAddLayoutObject: vi.fn(),
    onDeleteLayoutObject: vi.fn(),
    ...overrides,
  };
}

const activeUser = {
  email: 'maker@example.com',
  name: 'Maya Stone',
  role: 'user' as const,
  status: 'active' as const,
};

const adminUser = {
  email: 'sshibinthomass@gmail.com',
  role: 'admin' as const,
  status: 'active' as const,
};

describe('ARHud', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
    document.body.replaceChildren();
    reconstructionOverlay.cancel.mockClear();
    reconstructionOverlay.construct.mockClear();
    reconstructionOverlay.dispose.mockClear();
    reconstructionOverlay.play.mockReset();
    reconstructionOverlay.play.mockResolvedValue(undefined);
  });

  it('passes the active capture route and defaults defensively to camera', () => {
    const root = document.createElement('div');
    const onCaptureImage = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onCaptureImage }));

    root.querySelector<HTMLButtonElement>('.camera-actions button')?.click();
    hud.updateAuthState(activeUser);
    for (const route of ['camera', 'full-flow', 'dynamic'] as const) {
      root.querySelector<HTMLButtonElement>(`[data-nav-route="${route}"]`)?.click();
      [...root.querySelectorAll<HTMLButtonElement>('.camera-actions button')]
        .find((button) => button.textContent === 'Capture')
        ?.click();
    }

    expect(onCaptureImage.mock.calls.map(([route]) => route)).toEqual([
      'camera',
      'camera',
      'full-flow',
      'dynamic',
    ]);
  });

  it('owns one reconstruction overlay in a media layer shared by both camera previews', () => {
    const root = document.createElement('div');
    new ARHud(root, modelOptions, createHandlers());

    const stage = root.querySelector<HTMLElement>('.creation-stage')!;
    const mediaLayer = stage.querySelector<HTMLElement>(':scope > .camera-media-layer')!;
    const previewImage = mediaLayer.querySelector<HTMLImageElement>('img.camera-preview')!;

    expect(mediaLayer).not.toBeNull();
    expect(mediaLayer.querySelector('video.camera-preview')).not.toBeNull();
    expect(previewImage).not.toBeNull();
    expect(stage.querySelector('.upload-image-field')?.parentElement).toBe(stage);
    expect(stage.querySelector('.upload-model-field')?.parentElement).toBe(stage);
    expect(reconstructionOverlay.construct).toHaveBeenCalledOnce();
    expect(reconstructionOverlay.construct).toHaveBeenCalledWith(mediaLayer, previewImage);
  });

  it('shows non-blocking object segmentation and restores ready copy when playback starts', async () => {
    let finishPlayback: (() => void) | undefined;
    reconstructionOverlay.play.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishPlayback = resolve;
    }));
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);
    root.querySelector<HTMLButtonElement>('[data-nav-route="full-flow"]')?.click();
    hud.showCapturedImagePreview('blob:captured-image');

    hud.showObjectSegmentationPending();

    const generateButton = [...root.querySelectorAll<HTMLButtonElement>('.camera-actions button')]
      .find((button) => button.textContent === 'Generate and place')!;
    const mediaLayer = root.querySelector<HTMLElement>('.camera-media-layer')!;
    expect(root.querySelector('.camera-status')?.textContent).toBe('Finding the main object…');
    expect(mediaLayer.classList.contains('is-object-segmentation-pending')).toBe(true);
    expect(generateButton.disabled).toBe(false);

    const playback = hud.playObjectReconstruction('data:image/png;base64,bWFzaw==', {
      x: 0.1,
      y: 0.2,
      width: 0.5,
      height: 0.6,
    });

    expect(reconstructionOverlay.play).toHaveBeenCalledWith({
      maskUrl: 'data:image/png;base64,bWFzaw==',
      bounds: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
      durationMs: 2500,
    });
    expect(root.querySelector('.camera-status')?.textContent).toBe(
      'Image captured. Submit to GPT or generate a 3D model directly.',
    );
    expect(mediaLayer.classList.contains('is-object-segmentation-pending')).toBe(false);
    expect(generateButton.disabled).toBe(false);

    finishPlayback?.();
    await playback;
  });

  it('keeps captured-ready copy after rejected playback so orchestration can fall back', async () => {
    reconstructionOverlay.play.mockRejectedValueOnce(new Error('canvas failed'));
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.showCapturedImagePreview('blob:captured-image');
    hud.showObjectSegmentationPending();

    await expect(hud.playObjectReconstruction('data:image/png;base64,bWFzaw==', {
      x: 0.1,
      y: 0.2,
      width: 0.5,
      height: 0.6,
    })).rejects.toThrow('canvas failed');

    expect(root.querySelector('.camera-status')?.textContent).toBe(
      'Image captured. Submit to GPT or generate a 3D model directly.',
    );
  });

  it('falls back to dynamic captured-ready state without animating', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);
    root.querySelector<HTMLButtonElement>('[data-nav-route="dynamic"]')?.click();
    hud.showCapturedImagePreview('blob:dynamic-image');
    reconstructionOverlay.cancel.mockClear();
    reconstructionOverlay.play.mockClear();

    hud.showObjectSegmentationPending();
    reconstructionOverlay.cancel.mockClear();
    hud.showObjectSegmentationFallback();

    expect(root.querySelector('.camera-status')?.textContent).toBe(
      'Image captured. Generate a dynamic image, then place the 3D model.',
    );
    expect(root.querySelector('.camera-media-layer')?.classList.contains('is-object-segmentation-pending')).toBe(false);
    expect(reconstructionOverlay.cancel).toHaveBeenCalledOnce();
    expect(reconstructionOverlay.play).not.toHaveBeenCalled();
  });

  it('clears reconstruction on preview replacement, extraction, loading, route exit, and disposal', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);
    root.querySelector<HTMLButtonElement>('[data-nav-route="full-flow"]')?.click();
    reconstructionOverlay.cancel.mockClear();

    const expectCancellation = (action: () => void) => {
      const before = reconstructionOverlay.cancel.mock.calls.length;
      action();
      expect(reconstructionOverlay.cancel).toHaveBeenCalledTimes(before + 1);
    };

    expectCancellation(() => hud.showLiveCameraPreview('full-flow'));
    expectCancellation(() => hud.showCapturedImagePreview('blob:first-capture'));
    expectCancellation(() => hud.showCapturedImagePreview('blob:replacement-capture'));
    expectCancellation(() => hud.showExtractedImageReady('blob:extracted-image'));
    expectCancellation(() => hud.showFullFlowLoading('Building your 3D object in Modal...'));
    expectCancellation(() => root.querySelector<HTMLButtonElement>('[data-nav-route="models"]')?.click());

    hud.dispose();
    expect(reconstructionOverlay.dispose).toHaveBeenCalledOnce();
  });

  it('starts on a branded first screen with public and login-required actions grouped', () => {
    const root = document.createElement('div');
    new ARHud(root, modelOptions, createHandlers());

    const choiceButtons = [...root.querySelectorAll('.mode-action button')].map(
      (button) => button.textContent,
    );
    const statusPanel = root.querySelector('.status-panel');
    const cameraPanel = root.querySelector('.camera-panel');
    const hudActions = root.querySelector('.hud-actions');

    expect(root.querySelector('.landing h1')?.textContent).toBe('Make it real. Place it here.');
    expect(root.querySelector('.landing-preview')?.classList.contains('calibration-frame')).toBe(true);
    expect(root.textContent).toContain('Explore in AR');
    expect(root.textContent).toContain('Create a model');
    expect(root.querySelector('.landing-preview')).not.toBeNull();
    expect(choiceButtons).toEqual([
      'Single-Object AR',
      'Model Library',
      'Multi-Object AR',
      'Camera to 3D',
      'Image to 3D',
      'Upload 3D Model',
      'Text or Voice to 3D',
      'Photo to AR',
      'AI-Enhanced Photo to AR',
    ]);
    const modeGroups = [...root.querySelectorAll('.mode-group')];
    expect([...modeGroups[0].querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      'Single-Object AR',
      'Model Library',
      'Multi-Object AR',
    ]);
    expect([...modeGroups[1].querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      'Camera to 3D',
      'Image to 3D',
      'Upload 3D Model',
      'Text or Voice to 3D',
      'Photo to AR',
      'AI-Enhanced Photo to AR',
    ]);
    expect(statusPanel?.classList.contains('hidden')).toBe(true);
    expect(cameraPanel?.classList.contains('hidden')).toBe(true);
    expect(hudActions?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.gesture-surface')?.classList.contains('hidden')).toBe(true);
  });

  it('renders a task-first home with one primary create launcher', () => {
    const root = document.createElement('div');
    new ARHud(root, modelOptions, createHandlers());

    expect(root.querySelector('.landing-preview')?.classList.contains('calibration-frame')).toBe(true);
    expect(root.querySelector('.home-primary-action')?.textContent).toBe('Create a model');
    expect(root.querySelector('.landing h1')?.textContent).toBe('Make it real. Place it here.');

    root.querySelector<HTMLButtonElement>('.home-primary-action')?.click();
    expect(root.querySelector<HTMLElement>('.create-menu')?.hidden).toBe(false);
  });

  it('removes duplicate home account actions and redirects an authenticated Login route home', () => {
    window.history.replaceState(null, '', '/#/login');
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());

    expect(root.querySelector('.home-route-groups .auth-actions')).toBeNull();

    hud.updateAuthState(activeUser);

    expect(window.location.hash).toBe('#/');
    expect(root.querySelector('.landing')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.account-trigger-label')?.textContent).toBe('Hi, Maya Stone');
  });

  it('shows a global signed-in notice outside the login panel', () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());

    hud.showSessionNotice('Welcome back, Maya Stone.');

    const notice = root.querySelector<HTMLElement>('.session-notice')!;
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toBe('Welcome back, Maya Stone.');

    vi.advanceTimersByTime(4500);
    expect(notice.hidden).toBe(true);
    vi.useRealTimers();
  });

  it('fully hides the name field in login mode and reveals it in signup mode', () => {
    const root = document.createElement('div');
    new ARHud(root, modelOptions, createHandlers());
    root.querySelector<HTMLButtonElement>('.desktop-account-trigger')?.click();

    const nameLabel = root.querySelector<HTMLInputElement>('input[name="authName"]')?.closest('label');
    expect(nameLabel?.hidden).toBe(true);
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Create account')?.click();
    expect(nameLabel?.hidden).toBe(false);
  });

  it('uses a full-width speech composer and deliberate action hierarchy', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);
    root.querySelector<HTMLButtonElement>('[data-nav-route="speech"]')?.click();

    expect(root.querySelector('.speech-workspace')).not.toBeNull();
    expect(root.querySelector('.speech-text-input')?.getAttribute('aria-describedby')).toBe('speechPromptHint');
    expect(root.querySelector('.speech-actions button.primary')?.textContent).toBe('Generate model');
  });

  it('mounts every route inside one shared responsive application shell', () => {
    window.history.replaceState(null, '', '/#/models');
    const root = document.createElement('div');

    new ARHud(root, modelOptions, createHandlers());

    expect(root.querySelectorAll('.app-shell')).toHaveLength(1);
    expect(root.querySelector('.app-header')).not.toBeNull();
    expect(root.querySelector('.mobile-bottom-nav')).not.toBeNull();
    expect(root.querySelector('.app-route-title')?.textContent).toBe('Models');
    expect(root.querySelector('.model-manager')?.parentElement?.classList.contains('app-page-host')).toBe(true);
    expect(root.querySelector('.xr-overlay')?.parentElement?.classList.contains('app-shell')).toBe(true);
  });

  it('delegates shared Back navigation to browser history', () => {
    const root = document.createElement('div');
    new ARHud(root, modelOptions, createHandlers());
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);

    root.querySelector<HTMLButtonElement>('[data-nav-route="models"]')?.click();
    root.querySelector<HTMLButtonElement>('.route-back')?.click();

    expect(back).toHaveBeenCalledOnce();
    back.mockRestore();
  });

  it('resets upload state when entering camera capture', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);

    root.querySelector<HTMLButtonElement>('[data-nav-route="upload"]')?.click();
    expect(root.querySelector('.camera-status')?.textContent).toContain('Choose an image');

    root.querySelector<HTMLButtonElement>('[data-nav-route="camera"]')?.click();
    expect(root.querySelector('.camera-label')?.textContent).toBe('Camera capture');
    expect(root.querySelector('.camera-status')?.textContent).toBe('Frame one object, then capture an image.');
    expect(root.querySelector('.generated-model-status')?.textContent).toBe('No model generated yet.');
  });

  it('keeps camera-based workflow names distinct', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);

    for (const [route, title] of [
      ['camera', 'Camera capture'],
      ['full-flow', 'Photo to AR'],
      ['dynamic', 'AI photo to AR'],
    ] as const) {
      root.querySelector<HTMLButtonElement>(`[data-nav-route="${route}"]`)?.click();
      expect(root.querySelector('.camera-label')?.textContent).toBe(title);
      expect(root.querySelector('.immersive-title')?.textContent).toBe(title);
    }
  });

  it('notifies the application when leaving a transient route', () => {
    const root = document.createElement('div');
    const onRouteExit = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onRouteExit }));
    hud.updateAuthState(activeUser);

    root.querySelector<HTMLButtonElement>('[data-nav-route="camera"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-nav-route="upload"]')?.click();

    expect(onRouteExit).toHaveBeenCalledWith('camera', 'upload');
  });

  it('prompts guests to sign in for protected actions while leaving AR View, Models, and Multi Object public', () => {
    const root = document.createElement('div');
    const onStartCamera = vi.fn();
    const onStartMultiObject = vi.fn();
    new ARHud(root, modelOptions, createHandlers({ onStartCamera, onStartMultiObject }));

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Camera to 3D')?.click();

    expect(onStartCamera).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/login');
    expect(root.textContent).toContain('Sign in to use Camera.');

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Multi-Object AR')?.click();

    expect(window.location.hash).toBe('#/multi-object');
    expect(onStartMultiObject).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.layout-manager')).toBeNull();

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Single-Object AR')?.click();

    expect(window.location.hash).toBe('#/ar');
    expect(root.querySelector('.ar-model-picker')?.classList.contains('hidden')).toBe(false);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Model Library')?.click();

    expect(window.location.hash).toBe('#/models');
    expect(root.querySelector('.model-manager')?.classList.contains('hidden')).toBe(false);
  });

  it('requires login for Text or Voice to 3D and shows text plus push-to-talk controls to approved users', () => {
    const guestRoot = document.createElement('div');
    new ARHud(guestRoot, modelOptions, createHandlers());

    [...guestRoot.querySelectorAll('button')].find((button) => button.textContent === 'Text or Voice to 3D')?.click();

    expect(window.location.hash).toBe('#/login');
    expect(guestRoot.textContent).toContain('Sign in to use Text or Voice to 3D.');

    const root = document.createElement('div');
    const onStartSpeechRecording = vi.fn();
    const onStopSpeechRecording = vi.fn();
    const onGenerateSpeechModel = vi.fn();
    const onGenerateTextModel = vi.fn();
    const hud = new ARHud(
      root,
      modelOptions,
      createHandlers({ onStartSpeechRecording, onStopSpeechRecording, onGenerateSpeechModel, onGenerateTextModel }),
    );
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Text or Voice to 3D')?.click();

    expect(window.location.hash).toBe('#/speech');
    expect(root.querySelector('.speech-panel')?.classList.contains('hidden')).toBe(false);
    expect(root.textContent).toContain('Type a description or push to talk');

    const textInput = root.querySelector<HTMLTextAreaElement>('.speech-text-input')!;
    const generateTextButton = root.querySelector<HTMLButtonElement>('.speech-actions button.primary')!;
    expect(generateTextButton.disabled).toBe(true);
    textInput.value = 'a red modern chair';
    textInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(generateTextButton.disabled).toBe(false);
    generateTextButton.click();
    expect(onGenerateTextModel).toHaveBeenCalledWith('a red modern chair');

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Record description')?.click();
    expect(onStartSpeechRecording).toHaveBeenCalledTimes(1);

    hud.showSpeechRecording();
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Stop recording')?.click();
    expect(onStopSpeechRecording).toHaveBeenCalledTimes(1);

    hud.showSpeechDetected('a red modern chair');
    const generateButton = [...root.querySelectorAll('button')].find(
      (button) => button.textContent === 'Generate from recording',
    ) as HTMLButtonElement;
    expect(generateButton.disabled).toBe(false);
    generateButton.click();

    expect(onGenerateSpeechModel).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain('a red modern chair');
  });

  it('shows animated speech progress, detected transcript, and background-job guidance', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Text or Voice to 3D')?.click();

    expect(root.textContent).toContain('Input request');
    expect(root.textContent).toContain('Prepare request');
    expect(root.textContent).toContain('Generate image');
    expect(root.textContent).toContain('Generate model');

    hud.showSpeechRecording();
    expect(root.querySelector('.speech-visualizer')?.classList.contains('is-listening')).toBe(true);
    expect(root.querySelector('[data-speech-stage="speech_input"]')?.classList.contains('is-active')).toBe(true);

    hud.showSpeechCaptured();
    expect(root.textContent).toContain('Audio captured. Speech will appear after detection.');
    const generateVoiceButton = [...root.querySelectorAll('button')].find(
      (button) => button.textContent === 'Generate from recording',
    ) as HTMLButtonElement;
    expect(generateVoiceButton.disabled).toBe(false);

    hud.showSpeechDetecting();
    expect(root.querySelector('[data-speech-stage="detecting_speech"]')?.classList.contains('is-active')).toBe(true);

    hud.showSpeechGeneratingImage('make a red modern chair');
    expect(root.textContent).toContain('Request');
    expect(root.textContent).toContain('make a red modern chair');
    expect(root.querySelector('[data-speech-stage="generating_image"]')?.classList.contains('is-active')).toBe(true);

    hud.showSpeechBackgroundJob({
      label: 'red modern chair - 2026-07-07 08:30:00 UTC',
      transcript: 'make a red modern chair',
    });

    expect(root.querySelector('[data-speech-stage="generating_3d"]')?.classList.contains('is-active')).toBe(true);
    expect(root.textContent).toContain('You can leave this page.');
    expect(root.textContent).toContain('appear in Models');
  });

  it('submits login and account creation from the auth screen', () => {
    const root = document.createElement('div');
    const onLogin = vi.fn();
    const onSignup = vi.fn();
    new ARHud(root, modelOptions, createHandlers({ onLogin, onSignup }));
    const nameLabel = (): HTMLLabelElement =>
      root.querySelector<HTMLInputElement>('input[name="authName"]')!.closest('label') as HTMLLabelElement;

    root.querySelector<HTMLButtonElement>('.desktop-account-trigger')?.click();
    const authForm = root.querySelector<HTMLFormElement>('form.auth-panel-inner')!;
    expect(authForm).not.toBeNull();
    expect(root.querySelector('input[name="authPassword"]')?.closest('form')).toBe(authForm);
    expect(nameLabel().hidden).toBe(true);

    root.querySelector<HTMLInputElement>('input[name="authEmail"]')!.value = ' maker@example.com ';
    root.querySelector<HTMLInputElement>('input[name="authPassword"]')!.value = 'maker-password-123';
    authForm.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));

    expect(onLogin).toHaveBeenCalledWith('maker@example.com', 'maker-password-123');

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Create account')?.click();
    expect(onSignup).not.toHaveBeenCalled();
    expect(nameLabel().hidden).toBe(false);

    root.querySelector<HTMLInputElement>('input[name="authName"]')!.value = ' Maker ';
    authForm.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));

    expect(onSignup).toHaveBeenCalledWith('maker@example.com', 'maker-password-123', 'Maker');
  });

  it('shows admin account management for the admin user', () => {
    const root = document.createElement('div');
    const onRefreshAdminAccounts = vi.fn();
    const onApproveAccount = vi.fn();
    const onRemoveAccount = vi.fn();
    const hud = new ARHud(
      root,
      modelOptions,
      createHandlers({ onRefreshAdminAccounts, onApproveAccount, onRemoveAccount }),
    );

    hud.updateAuthState(adminUser);
    root.querySelector<HTMLButtonElement>('.desktop-account-trigger')?.click();
    root.querySelector<HTMLButtonElement>('.account-menu-admin')?.click();
    hud.updateAdminAccounts([
      adminUser,
      { email: 'maker@example.com', name: 'Maker', role: 'user', status: 'pending' },
    ]);

    expect(onRefreshAdminAccounts).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain('maker@example.com');
    expect(root.textContent).toContain('Pending');

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Approve')?.click();
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Remove')?.click();

    expect(onApproveAccount).toHaveBeenCalledWith('maker@example.com');
    expect(onRemoveAccount).toHaveBeenCalledWith('maker@example.com');
  });

  it('opens camera from the first screen as a full-screen capture flow', () => {
    const root = document.createElement('div');
    const onStartCamera = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onStartCamera }));
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Camera to 3D')?.click();

    const landing = root.querySelector('.landing');
    const statusPanel = root.querySelector('.status-panel');
    const cameraPanel = root.querySelector('.camera-panel');
    const hudActions = root.querySelector('.hud-actions');

    expect(onStartCamera).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('#/camera');
    expect(landing?.classList.contains('hidden')).toBe(true);
    expect(statusPanel?.classList.contains('camera-active')).toBe(true);
    expect(cameraPanel?.classList.contains('fullscreen')).toBe(true);
    expect(cameraPanel?.classList.contains('hidden')).toBe(false);
    expect(hudActions?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.gesture-surface')?.classList.contains('hidden')).toBe(true);
  });

  it('opens AR View with a full-page model picker before placement', () => {
    const root = document.createElement('div');
    new ARHud(root, modelOptions, createHandlers());

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Single-Object AR')?.click();

    const landing = root.querySelector('.landing');
    const statusPanel = root.querySelector('.status-panel');
    const cameraPanel = root.querySelector('.camera-panel');
    const hudActions = root.querySelector('.hud-actions');
    const modelPicker = root.querySelector('.model-picker');
    const arModelPicker = root.querySelector('.ar-model-picker');
    const modelRail = root.querySelector('.model-rail');
    const modelCards = [...root.querySelectorAll<HTMLButtonElement>('.ar-model-card')];

    expect(landing?.classList.contains('hidden')).toBe(true);
    expect(window.location.hash).toBe('#/ar');
    expect(statusPanel?.classList.contains('hidden')).toBe(false);
    expect(statusPanel?.classList.contains('ar-picker-active')).toBe(true);
    expect(statusPanel?.classList.contains('camera-active')).toBe(false);
    expect(cameraPanel?.classList.contains('hidden')).toBe(true);
    expect(hudActions?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.gesture-surface')?.classList.contains('hidden')).toBe(true);
    expect(modelPicker?.classList.contains('hidden')).toBe(true);
    expect(arModelPicker?.classList.contains('hidden')).toBe(false);
    expect(modelRail?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.ar-picker-heading h2')?.textContent).toBe('Choose a model');
    expect(root.querySelector('.ar-picker-heading p')?.textContent).toBe(
      'Select one model, then continue to AR placement.',
    );
    expect(modelCards.map((button) => button.dataset.modelId)).toEqual(['built-in-alpha', 'built-in-beta']);
    expect(modelCards.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Select Built-in alpha',
      'Select Built-in beta',
    ]);
    expect(modelCards.map((button) => button.querySelector('.selection-label')?.textContent)).toEqual([
      'Select',
      'Select',
    ]);
  });

  it('opens placement controls and the bottom thumbnail rail after a model is selected and Place AR is clicked', () => {
    const root = document.createElement('div');
    const onModelSelect = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onModelSelect }));
    const startArCamera = vi.fn();
    const arButton = document.createElement('button');
    arButton.textContent = 'Start AR';
    arButton.addEventListener('click', startArCamera);
    hud.attachARButton(arButton);
    expect(root.querySelector('.ar-button-slot')?.classList.contains('hidden')).toBe(true);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Single-Object AR')?.click();
    root.querySelector<HTMLButtonElement>('.ar-model-card[data-model-id="built-in-beta"]')?.click();

    const placeArButton = root.querySelector<HTMLButtonElement>('.ar-model-place-button')!;
    expect(onModelSelect).toHaveBeenCalledWith('built-in-beta');
    expect(root.querySelector('.ar-model-card.is-selected')?.textContent).toContain('Built-in beta');
    expect(root.querySelector('.ar-model-card.is-selected .selection-label')?.textContent).toBe('Selected');
    expect(placeArButton.disabled).toBe(true);

    hud.updateModelReady(true);
    expect(placeArButton.textContent).toBe('Place selected model');
    placeArButton.click();

    expect(startArCamera).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.ar-model-picker')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.model-rail')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.hud-actions')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.gesture-surface')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.model-rail-item.is-selected')?.textContent).toContain('Built-in beta');
    const actionButtons = [...root.querySelectorAll<HTMLButtonElement>('.hud-actions > button')];
    expect(actionButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Place',
      'Scale 1x',
      'Reset',
    ]);
    expect(actionButtons.every((button) => button.classList.contains('hud-action-chip'))).toBe(true);
    expect(actionButtons.every((button) => button.querySelector('svg') === null)).toBe(true);
    expect(root.querySelector<HTMLInputElement>('.rotate-control input[type="range"]')).toBeInstanceOf(HTMLInputElement);
  });

  it('dispatches the visible placed-object action buttons to their handlers', () => {
    const root = document.createElement('div');
    const onPlace = vi.fn();
    const onResetScale = vi.fn();
    const onReset = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onPlace, onResetScale, onReset }));

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'AR View')?.click();
    root.querySelector<HTMLButtonElement>('.ar-model-card[data-model-id="built-in-alpha"]')?.click();
    hud.updateModelReady(true);
    root.querySelector<HTMLButtonElement>('.ar-model-place-button')?.click();
    hud.update('scanning');

    const placeButton = root.querySelector<HTMLButtonElement>('.hud-actions > button[aria-label="Place"]')!;
    const resetScaleButton = root.querySelector<HTMLButtonElement>('.hud-actions > button[aria-label="Scale 1x"]')!;
    const resetButton = root.querySelector<HTMLButtonElement>('.hud-actions > button[aria-label="Reset"]')!;

    expect(root.querySelector('.hud-actions')?.classList.contains('hidden')).toBe(false);
    expect(placeButton.classList.contains('hidden')).toBe(false);
    expect(placeButton.disabled).toBe(false);
    placeButton.click();

    hud.update('placed');

    for (const button of [resetScaleButton, resetButton]) {
      expect(button.classList.contains('hidden')).toBe(false);
      expect(button.disabled).toBe(false);
    }

    resetScaleButton.click();
    resetButton.click();

    expect(onPlace).toHaveBeenCalledTimes(1);
    expect(onResetScale).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('shows an animation selector for models with multiple clips', () => {
    const root = document.createElement('div');
    const onAnimationSelect = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onAnimationSelect }));
    const modelRail = root.querySelector('.model-rail');

    expect(root.querySelector('.animation-control')?.classList.contains('hidden')).toBe(true);
    expect(modelRail?.classList.contains('has-animation-control')).toBe(false);

    hud.updateAnimationOptions([{ index: 0, label: 'Idle' }], 0);

    expect(root.querySelector('.animation-control')?.classList.contains('hidden')).toBe(true);
    expect(modelRail?.classList.contains('has-animation-control')).toBe(false);

    hud.updateAnimationOptions([
      { index: 0, label: 'Idle' },
      { index: 1, label: 'Walk' },
    ], 0);
    expect(modelRail?.classList.contains('has-animation-control')).toBe(true);

    const animationControl = root.querySelector('.animation-control');
    const animationSelect = root.querySelector<HTMLSelectElement>('select[name="animationClip"]')!;
    expect(animationControl?.classList.contains('hidden')).toBe(false);
    expect([...animationSelect.options].map((option) => option.textContent)).toEqual(['Idle', 'Walk']);
    expect(animationSelect.value).toBe('0');

    animationSelect.value = '1';
    animationSelect.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onAnimationSelect).toHaveBeenCalledWith(1);

    hud.updateSelectedAnimation(0);

    expect(animationSelect.value).toBe('0');

    hud.updateAnimationOptions([{ index: 0, label: 'Idle' }], 0);
    expect(modelRail?.classList.contains('has-animation-control')).toBe(false);
  });

  it('opens Full Flow from the first screen as a capture page', () => {
    const root = document.createElement('div');
    const onStartCamera = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onStartCamera }));
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Photo to AR')?.click();

    expect(window.location.hash).toBe('#/full-flow');
    expect(onStartCamera).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.landing')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.camera-panel')?.classList.contains('fullscreen')).toBe(true);
    expect(root.textContent).toContain('Capture');
  });

  it('opens Dynamic from the first screen as a capture page', () => {
    const root = document.createElement('div');
    const onStartCamera = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onStartCamera }));
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'AI-Enhanced Photo to AR')?.click();

    expect(window.location.hash).toBe('#/dynamic');
    expect(onStartCamera).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.landing')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.camera-panel')?.classList.contains('fullscreen')).toBe(true);
    expect(root.textContent).toContain('AI enhancement');
  });

  it('opens Multi Object for guests directly as a fresh AR placement session without saved layouts', () => {
    const root = document.createElement('div');
    const onStartMultiObject = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onStartMultiObject }));
    const startArCamera = vi.fn();
    const arButton = document.createElement('button');
    arButton.textContent = 'Start AR';
    arButton.addEventListener('click', startArCamera);
    hud.attachARButton(arButton);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Multi-Object AR')?.click();

    expect(window.location.hash).toBe('#/multi-object');
    expect(root.querySelector('.landing')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.layout-manager')).toBeNull();
    expect(root.textContent).not.toContain('Save Layout');
    expect(root.querySelector('.layout-row')).toBeNull();
    expect(startArCamera).toHaveBeenCalledTimes(1);
    expect(onStartMultiObject).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.status-panel')?.classList.contains('layout-active')).toBe(true);
  });

  it('presents multi-object AR with one immersive control system', () => {
    const root = document.createElement('div');
    new ARHud(root, modelOptions, createHandlers());

    root.querySelector<HTMLButtonElement>('[data-nav-route="multi-object"]')?.click();

    expect(root.querySelector('.app-shell')?.getAttribute('data-shell')).toBe('immersive');
    expect(root.querySelector('.immersive-title')?.textContent).toBe('Multi-object AR');
    expect(root.querySelector('.status-panel')?.classList.contains('immersive-inspector')).toBe(true);
    expect(root.querySelector('.hud-actions')?.classList.contains('immersive-actions')).toBe(true);
    expect(root.querySelector('.status-panel > .page-back')).toBeNull();
    expect(root.querySelector('.layout-manager')).toBeNull();
  });

  it('switches from the standard AR picker to immersive controls for live placement', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());

    root.querySelector<HTMLButtonElement>('[data-nav-route="ar"]')?.click();
    expect(root.querySelector('.app-shell')?.getAttribute('data-shell')).toBe('standard');

    root.querySelector<HTMLButtonElement>('.ar-model-card[data-model-id="built-in-alpha"]')?.click();
    hud.updateModelReady(true);
    root.querySelector<HTMLButtonElement>('.ar-model-place-button')?.click();

    expect(root.querySelector('.app-shell')?.getAttribute('data-shell')).toBe('immersive');
    expect(root.querySelector('.status-panel')?.classList.contains('immersive-inspector')).toBe(true);
    expect(root.querySelector('.hud-actions')?.classList.contains('immersive-actions')).toBe(true);
  });

  it('keeps delete separate and identifies the selected-object action', () => {
    const root = document.createElement('div');
    new ARHud(root, modelOptions, createHandlers());
    root.querySelector<HTMLButtonElement>('[data-nav-route="multi-object"]')?.click();

    const deleteButton = [...root.querySelectorAll<HTMLButtonElement>('.hud-actions button')]
      .find((button) => button.textContent === 'Delete selected');
    expect(deleteButton?.classList.contains('danger')).toBe(true);
    expect(deleteButton?.getAttribute('aria-label')).toBe('Delete selected');
  });

  it('shows session-only controls for adding multiple objects', () => {
    const root = document.createElement('div');
    const onAddLayoutObject = vi.fn();
    const onDeleteLayoutObject = vi.fn();
    const hud = new ARHud(
      root,
      modelOptions,
      createHandlers({ onAddLayoutObject, onDeleteLayoutObject }),
    );
    hud.updateAuthState(activeUser);

    hud.showMultiObjectEditor();
    [...root.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Add model')?.click();
    [...root.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Delete selected')?.click();

    expect(root.querySelector('.status-panel')?.classList.contains('layout-active')).toBe(true);
    expect(root.querySelector('.hud-actions')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.gesture-surface')?.classList.contains('hidden')).toBe(false);
    const actionButtons = [...root.querySelectorAll<HTMLButtonElement>('.hud-actions > button')];
    expect(actionButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Place',
      'Scale 1x',
      'Reset',
      'Add model',
      'Delete selected',
    ]);
    expect(actionButtons.every((button) => button.classList.contains('hud-action-chip'))).toBe(true);
    expect(actionButtons.every((button) => button.querySelector('svg') === null)).toBe(true);
    expect(root.querySelector<HTMLInputElement>('.rotate-control input[type="range"]')).toBeInstanceOf(HTMLInputElement);
    expect(root.textContent).toContain('Place multiple objects in this session.');
    expect(onAddLayoutObject).toHaveBeenCalledTimes(1);
    expect(onDeleteLayoutObject).toHaveBeenCalledTimes(1);
  });

  it('opens upload image from the first screen without starting the camera', () => {
    const root = document.createElement('div');
    const onStartCamera = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onStartCamera }));
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Image to 3D')?.click();

    const landing = root.querySelector('.landing');
    const statusPanel = root.querySelector('.status-panel');
    const cameraPanel = root.querySelector('.camera-panel');
    const uploadInput = root.querySelector<HTMLInputElement>('input[name="uploadImage"]');
    const captureButton = [...root.querySelectorAll('button')].find((button) => button.textContent === 'Capture');
    const generateButton = [...root.querySelectorAll<HTMLButtonElement>('.camera-actions button')].find(
      (button) => button.textContent === 'Generate model',
    );

    expect(onStartCamera).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/upload');
    expect(landing?.classList.contains('hidden')).toBe(true);
    expect(statusPanel?.classList.contains('camera-active')).toBe(true);
    expect(cameraPanel?.classList.contains('fullscreen')).toBe(true);
    expect(uploadInput).toBeInstanceOf(HTMLInputElement);
    expect(uploadInput?.classList.contains('hidden')).toBe(false);
    expect(captureButton?.classList.contains('hidden')).toBe(true);
    expect((generateButton as HTMLButtonElement).disabled).toBe(true);
    expect(root.textContent).toContain('Choose an image to create a 3D model.');
  });

  it('uses a compact upload drop zone and one full-width primary action', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);
    root.querySelector<HTMLButtonElement>('[data-nav-route="upload"]')?.click();

    expect(root.querySelector('.upload-image-field')?.classList.contains('upload-drop-zone')).toBe(true);
    expect(root.querySelector('.upload-image-field input')?.getAttribute('aria-describedby')).toBe('imageUploadHint');
    expect(root.querySelector('.camera-actions')?.classList.contains('single-primary')).toBe(true);
    expect(root.querySelector('.camera-actions button.primary')?.textContent).toBe('Generate model');
  });

  it('does not replace focused model controls when refresh data is unchanged', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const hud = new ARHud(root, modelOptions, createHandlers());
    const generated = {
      id: 'generated-chair',
      label: 'Generated chair',
      url: 'https://assets.example/generated-chair.glb',
      ownerEmail: activeUser.email,
      visibility: 'private' as const,
    };
    hud.updateAuthState(activeUser);
    hud.updateGeneratedModels([generated]);
    root.querySelector<HTMLButtonElement>('[data-nav-route="models"]')?.click();

    const previewButton = root.querySelector<HTMLButtonElement>(
      '[data-model-id="generated-chair"] [data-action="preview"]',
    )!;
    previewButton.focus();
    hud.updateGeneratedModels([{ ...generated }]);

    expect(document.activeElement).toBe(previewButton);
    expect(root.querySelector('[data-model-id="generated-chair"] [data-action="preview"]')).toBe(previewButton);
    root.remove();
  });

  it('shows real Capture, Generate, Place steps for photo-to-ar routes only', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);

    root.querySelector<HTMLButtonElement>('[data-nav-route="full-flow"]')?.click();
    expect([...root.querySelectorAll('.creation-step-list li')].map((item) => item.textContent?.trim())).toEqual([
      'Capture',
      'Generate',
      'Place',
    ]);

    root.querySelector<HTMLButtonElement>('[data-nav-route="camera"]')?.click();
    expect(root.querySelector('.creation-step-list')?.classList.contains('hidden')).toBe(true);
  });

  it('opens upload model from the first screen with a GLB picker', () => {
    const root = document.createElement('div');
    const onStartCamera = vi.fn();
    const onUploadModel = vi.fn();
    const onStoreUploadedModel = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onStartCamera, onUploadModel, onStoreUploadedModel }));
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Upload 3D Model')?.click();
    const uploadInput = root.querySelector<HTMLInputElement>('input[type="file"][accept=".glb,model/gltf-binary"]')!;
    const storeButton = [...root.querySelectorAll('.camera-actions button')].find(
      (button) => button.textContent === 'Upload model',
    ) as HTMLButtonElement;
    const file = new File(['glb bytes'], 'chair.glb', { type: 'model/gltf-binary' });
    Object.defineProperty(uploadInput, 'files', { value: [file], configurable: true });

    uploadInput.dispatchEvent(new Event('change', { bubbles: true }));
    hud.updateUploadModelStatus('chair.glb ready to store.', true);
    storeButton.click();

    expect(onStartCamera).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/upload-model');
    expect(root.querySelector('.landing')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.status-panel')?.classList.contains('camera-active')).toBe(true);
    expect(root.querySelector('.camera-panel')?.classList.contains('fullscreen')).toBe(true);
    expect(uploadInput).toBeInstanceOf(HTMLInputElement);
    expect(uploadInput.classList.contains('hidden')).toBe(false);
    expect(storeButton).toBeInstanceOf(HTMLButtonElement);
    expect(storeButton.classList.contains('hidden')).toBe(false);
    expect(storeButton.disabled).toBe(false);
    expect(root.textContent).toContain('chair.glb ready to store.');
    expect(onUploadModel).toHaveBeenCalledWith(file);
    expect(onStoreUploadedModel).toHaveBeenCalledTimes(1);
  });

  it('opens a model manager from the first screen with every dropdown model listed', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());

    hud.updateGeneratedModels([
      {
        id: 'generated-fc-123',
        label: 'chair - 2026-07-04 12:00:00 UTC',
        url: 'https://assets.example/generated-chair.glb',
        previewUrl: 'https://assets.example/previews/generated-chair.png',
        ownerEmail: 'maker@example.com',
        visibility: 'private',
      },
    ]);
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Model Library')?.click();

    const manager = root.querySelector('.model-manager');
    const rows = [...root.querySelectorAll('.model-manager-row')];

    expect(window.location.hash).toBe('#/models');
    expect(manager?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.landing')?.classList.contains('hidden')).toBe(true);
    expect(rows.map((row) => (row as HTMLElement).dataset.modelId)).toEqual(['generated-fc-123']);
    expect(manager?.textContent).not.toContain('Built-in alpha');
    expect(manager?.textContent).not.toContain('Built-in beta');
    expect(manager?.textContent).toContain('chair - 2026-07-04 12:00:00 UTC');
    expect(root.querySelector<HTMLImageElement>('.model-manager-thumbnail img')?.src).toBe(
      'https://assets.example/previews/generated-chair.png',
    );
    expect([...root.querySelectorAll('.model-manager-row.is-generated button')].map((button) => button.getAttribute('aria-label'))).toEqual([
      'Preview chair - 2026-07-04 12:00:00 UTC',
      'Download chair - 2026-07-04 12:00:00 UTC',
      'Favorite chair - 2026-07-04 12:00:00 UTC',
    ]);
    expect(manager?.textContent).toContain('Private');
    expect(manager?.textContent).not.toContain('No image');
    expect(manager?.textContent).not.toContain('Built-in');
  });

  it('lets owners manage their models while guests only preview and favorite them', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateGeneratedModels([
      {
        id: 'generated-owned-chair',
        label: 'Chair',
        url: 'https://assets.example/chair.glb',
        ownerEmail: 'maker@example.com',
        visibility: 'private',
      },
      {
        id: 'generated-other-table',
        label: 'Table',
        url: 'https://assets.example/table.glb',
        ownerEmail: 'other@example.com',
        visibility: 'private',
      },
    ]);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Model Library')?.click();

    const guestGeneratedRows = [...root.querySelectorAll('.model-manager-row.is-generated')];
    expect(guestGeneratedRows.map((row) => [...row.querySelectorAll('button')].map((button) => button.getAttribute('data-action')))).toEqual([
      ['preview', 'download', 'favorite'],
      ['preview', 'download', 'favorite'],
    ]);

    hud.updateAuthState(activeUser);

    const ownerRow = root.querySelector<HTMLElement>('.model-manager-row[data-model-id="generated-owned-chair"]')!;
    const otherRow = root.querySelector<HTMLElement>('.model-manager-row[data-model-id="generated-other-table"]')!;

    expect([...ownerRow.querySelectorAll('button')].map((button) => button.getAttribute('data-action'))).toEqual([
      'preview',
      'download',
      'favorite',
      'visibility',
      'edit',
      'delete',
    ]);
    expect([...otherRow.querySelectorAll('button')].map((button) => button.getAttribute('data-action'))).toEqual([
      'preview',
      'download',
      'favorite',
    ]);
    expect(ownerRow.querySelector<HTMLButtonElement>('button[data-action="edit"]')?.getAttribute('aria-label')).toBe('Edit Chair');
    expect(ownerRow.querySelector<HTMLButtonElement>('button[data-action="delete"]')?.getAttribute('aria-label')).toBe('Delete Chair');
  });

  it('does not open preview when model action icons are clicked', () => {
    const root = document.createElement('div');
    const onPreviewModel = vi.fn();
    const onToggleGeneratedModelVisibility = vi.fn();
    const onDeleteGeneratedModel = vi.fn();
    const hud = new ARHud(
      root,
      modelOptions,
      createHandlers({ onPreviewModel, onToggleGeneratedModelVisibility, onDeleteGeneratedModel }),
    );
    hud.updateAuthState(activeUser);
    hud.updateGeneratedModels([
      {
        id: 'generated-owned-chair',
        label: 'Chair',
        url: 'https://assets.example/chair.glb',
        ownerEmail: activeUser.email,
        visibility: 'public',
      },
    ]);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Model Library')?.click();

    const clickIcon = (action: string): void => {
      root
        .querySelector<SVGElement>(`.model-manager-row[data-model-id="generated-owned-chair"] button[data-action="${action}"] svg`)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    };

    clickIcon('favorite');
    clickIcon('visibility');
    clickIcon('edit');
    expect(root.querySelector('.model-edit-dialog')).toBeInstanceOf(HTMLElement);
    root.querySelector<HTMLButtonElement>('.model-edit-dialog [data-action="cancel-edit"]')?.click();
    clickIcon('delete');

    expect(onPreviewModel).not.toHaveBeenCalled();
    expect(onToggleGeneratedModelVisibility).toHaveBeenCalledWith('generated-owned-chair', 'private');
    expect(onDeleteGeneratedModel).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('.confirmation-dialog [data-action="confirm"]')?.click();
    expect(onDeleteGeneratedModel).toHaveBeenCalledWith('generated-owned-chair');
  });

  it('searches, filters, favorites, and recenters the model library and AR picker', () => {
    localStorage.clear();
    const root = document.createElement('div');
    const onModelSelect = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onModelSelect }));
    hud.updateGeneratedModels([
      {
        id: 'generated-chair',
        label: 'Yellow chair',
        url: 'https://assets.example/chair.glb',
        visibility: 'public',
      },
      {
        id: 'generated-laptop',
        label: 'Laptop stand',
        url: 'https://assets.example/laptop.glb',
        visibility: 'public',
      },
    ]);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Model Library')?.click();
    const searchInput = root.querySelector<HTMLInputElement>('input[name="modelSearch"]')!;
    const filterSelect = root.querySelector<HTMLSelectElement>('select[name="modelFilter"]')!;

    searchInput.value = 'chair';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect([...root.querySelectorAll<HTMLElement>('.model-manager-row')].map((row) => row.dataset.modelId)).toEqual([
      'generated-chair',
    ]);

    root.querySelector<HTMLButtonElement>('.model-manager-row[data-model-id="generated-chair"] button[data-action="favorite"]')?.click();
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    filterSelect.value = 'favorites';
    filterSelect.dispatchEvent(new Event('change', { bubbles: true }));

    expect([...root.querySelectorAll<HTMLElement>('.model-manager-row')].map((row) => row.dataset.modelId)).toEqual([
      'generated-chair',
    ]);

    filterSelect.value = 'all';
    filterSelect.dispatchEvent(new Event('change', { bubbles: true }));
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Single-Object AR')?.click();
    const arSearchInput = root.querySelector<HTMLInputElement>('input[name="arModelSearch"]')!;
    arSearchInput.value = 'laptop';
    arSearchInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect([...root.querySelectorAll<HTMLElement>('.ar-model-card')].map((card) => card.dataset.modelId)).toEqual([
      'generated-laptop',
    ]);

    root.querySelector<HTMLButtonElement>('.ar-model-card[data-model-id="generated-laptop"]')?.click();
    expect(onModelSelect).toHaveBeenCalledWith('generated-laptop');

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Model Library')?.click();
    const recentFilter = root.querySelector<HTMLSelectElement>('select[name="modelFilter"]')!;
    recentFilter.value = 'recent';
    recentFilter.dispatchEvent(new Event('change', { bubbles: true }));

    expect([...root.querySelectorAll<HTMLElement>('.model-manager-row')].map((row) => row.dataset.modelId)).toEqual([
      'generated-laptop',
    ]);
  });

  it('opens a non-AR 3D preview when a model row is clicked', () => {
    const root = document.createElement('div');
    const onPreviewModel = vi.fn();
    const onCloseModelPreview = vi.fn();
    const onPreviewLightingChange = vi.fn();
    const onPreviewLightDirectionChange = vi.fn();
    const onPreviewAnimationSelect = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({
      onPreviewModel,
      onCloseModelPreview,
      onPreviewLightingChange,
      onPreviewLightDirectionChange,
      onPreviewAnimationSelect,
    }));
    hud.updateGeneratedModels([
      {
        id: 'generated-preview-chair',
        label: 'Preview chair',
        url: 'https://assets.example/preview-chair.glb',
        visibility: 'public',
      },
    ]);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Model Library')?.click();
    const firstRow = root.querySelector<HTMLElement>('.model-manager-row')!;

    firstRow.click();
    hud.showModelPreviewLoading('Preview chair');
    hud.showModelPreviewReady();

    const preview = root.querySelector('.model-preview');

    expect(onPreviewModel).toHaveBeenCalledWith('generated-preview-chair');
    expect(preview?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.model-preview-title')?.textContent).toBe('Preview chair');
    expect(root.querySelector('.model-preview-status')?.textContent).toBe('Preview ready.');
    const lightingInput = root.querySelector<HTMLInputElement>('.model-preview-lighting-input')!;
    lightingInput.value = '145';
    lightingInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onPreviewLightingChange).toHaveBeenCalledWith(1.45);
    expect(root.querySelector('.model-preview-lighting-value')?.textContent).toBe('145%');
    expect(hud.getModelPreviewLightingIntensity()).toBe(1.45);
    const directionInput = root.querySelector<HTMLInputElement>('.model-preview-direction-input')!;
    directionInput.value = '225';
    directionInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onPreviewLightDirectionChange).toHaveBeenCalledWith(225);
    expect(root.querySelector('.model-preview-direction-value')?.textContent).toBe('225 deg');
    expect(hud.getModelPreviewLightDirectionDegrees()).toBe(225);

    expect(root.querySelector('.model-preview-animation')?.classList.contains('hidden')).toBe(true);

    hud.updateModelPreviewAnimationOptions([
      { index: 0, label: 'Idle' },
      { index: 1, label: 'Walk' },
    ], 0);

    const animationControl = root.querySelector('.model-preview-animation');
    const animationSelect = root.querySelector<HTMLSelectElement>('select[name="modelPreviewAnimation"]')!;
    expect(animationControl?.classList.contains('hidden')).toBe(false);
    expect([...animationSelect.options].map((option) => option.textContent)).toEqual(['Idle', 'Walk']);
    expect(animationSelect.value).toBe('0');

    animationSelect.value = '1';
    animationSelect.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onPreviewAnimationSelect).toHaveBeenCalledWith(1);

    hud.updateSelectedModelPreviewAnimation(0);

    expect(animationSelect.value).toBe('0');

    root.querySelector<HTMLButtonElement>('.model-preview-close')?.click();

    expect(onCloseModelPreview).toHaveBeenCalledTimes(1);
  });

  it('keeps model preview focus inside the labelled dialog and restores the opener on Escape', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    let hud!: ARHud;
    const onCloseModelPreview = vi.fn(() => hud.hideModelPreview());
    hud = new ARHud(root, modelOptions, createHandlers({ onCloseModelPreview }));
    hud.updateGeneratedModels([
      {
        id: 'generated-preview-chair',
        label: 'Preview chair',
        url: 'https://assets.example/preview-chair.glb',
        visibility: 'public',
      },
    ]);
    root.querySelector<HTMLButtonElement>('[data-nav-route="models"]')?.click();

    const opener = root.querySelector<HTMLButtonElement>(
      '[data-model-id="generated-preview-chair"] [data-action="preview"]',
    )!;
    opener.focus();
    opener.click();
    hud.showModelPreviewLoading('Preview chair');

    const preview = root.querySelector<HTMLElement>('.model-preview')!;
    const closeButton = preview.querySelector<HTMLButtonElement>('.model-preview-close')!;
    const lightingInput = preview.querySelector<HTMLInputElement>('.model-preview-lighting-input')!;
    expect(preview.getAttribute('role')).toBe('dialog');
    expect(preview.getAttribute('aria-modal')).toBe('true');
    expect(preview.getAttribute('aria-labelledby')).toBe('modelPreviewTitle');
    expect(preview.querySelector('#modelPreviewTitle')?.textContent).toBe('Preview chair');
    expect(closeButton.textContent).toBe('Close preview');
    expect(document.activeElement).toBe(closeButton);

    closeButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(lightingInput);

    preview.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(onCloseModelPreview).toHaveBeenCalledOnce();
    expect(preview.classList.contains('hidden')).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it('restores preview focus after download state rerenders the opener', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    let hud!: ARHud;
    const modelId = 'generated-preview-chair';
    const onCloseModelPreview = vi.fn(() => hud.hideModelPreview());
    const onPreviewModel = vi.fn(() => {
      hud.showModelPreviewLoading('Preview chair');
      hud.markModelDownloadStarted(modelId);
    });
    hud = new ARHud(
      root,
      modelOptions,
      createHandlers({ onCloseModelPreview, onPreviewModel }),
    );
    hud.updateGeneratedModels([
      {
        id: modelId,
        label: 'Preview chair',
        url: 'https://assets.example/preview-chair.glb',
        visibility: 'public',
      },
    ]);
    root.querySelector<HTMLButtonElement>('[data-nav-route="models"]')?.click();

    const opener = root.querySelector<HTMLButtonElement>(
      `[data-model-id="${modelId}"] [data-action="preview"]`,
    )!;
    opener.focus();
    opener.click();
    expect(opener.isConnected).toBe(false);

    root
      .querySelector<HTMLElement>('.model-preview')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    const replacement = root.querySelector<HTMLButtonElement>(
      `[data-model-id="${modelId}"] [data-action="preview"]`,
    )!;
    expect(onCloseModelPreview).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(replacement);
  });

  it('shows model size, local download state, and animates the model download action', () => {
    const root = document.createElement('div');
    const onModelSelect = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onModelSelect }));
    hud.updateGeneratedModels([
      {
        id: 'generated-fc-123',
        label: 'Generated chair',
        url: 'https://assets.example/generated-chair.glb',
        bytes: 12_399_224,
        visibility: 'public',
      },
    ]);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Model Library')?.click();

    const generatedRow = root.querySelector<HTMLElement>('.model-manager-row[data-model-id="generated-fc-123"]')!;
    const downloadButton = generatedRow.querySelector<HTMLButtonElement>('button[data-action="download"]')!;

    expect(generatedRow.classList.contains('is-not-downloaded')).toBe(true);
    expect(generatedRow.textContent).toContain('Not downloaded');
    expect(generatedRow.textContent).toContain('11.8 MB');
    expect(downloadButton).not.toBeNull();

    downloadButton.click();

    expect(onModelSelect).toHaveBeenCalledWith('generated-fc-123');
    const downloadingRow = root.querySelector<HTMLElement>('.model-manager-row[data-model-id="generated-fc-123"]')!;
    const downloadingButton = downloadingRow.querySelector<HTMLButtonElement>('button[data-action="download"]')!;
    expect(downloadingButton.classList.contains('is-downloading')).toBe(true);
    expect(downloadingRow.textContent).toContain('Downloading');

    hud.markModelDownloaded('generated-fc-123');

    const downloadedRow = root.querySelector<HTMLElement>('.model-manager-row[data-model-id="generated-fc-123"]')!;
    const downloadedButton = downloadedRow.querySelector<HTMLButtonElement>('button[data-action="download"]')!;
    expect(downloadedRow.classList.contains('is-downloaded')).toBe(true);
    expect(downloadedRow.textContent).toContain('Downloaded');
    expect(downloadedButton.classList.contains('is-complete')).toBe(true);
    expect(downloadedButton.disabled).toBe(true);

    onModelSelect.mockClear();
    downloadedButton.click();

    expect(onModelSelect).not.toHaveBeenCalled();
  });

  it('shows persisted uploaded models in the full-page AR picker and post-placement rail', () => {
    const root = document.createElement('div');
    const onModelSelect = vi.fn();
    const onDeleteGeneratedModel = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onModelSelect, onDeleteGeneratedModel }));

    hud.updateGeneratedModels([
      {
        id: 'generated-fc-123',
        label: 'chair - 2026-07-04 12:00:00 UTC',
        url: 'https://assets.example/generated-chair.glb',
        previewUrl: 'https://assets.example/previews/generated-chair.png',
        ownerEmail: 'maker@example.com',
        visibility: 'private',
      },
      {
        id: 'generated-upload-123-chair',
        label: 'chair',
        url: 'https://assets.example/uploaded-chair.glb',
        source: 'uploaded',
        ownerEmail: 'maker@example.com',
        visibility: 'private',
      },
    ]);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Single-Object AR')?.click();
    const modelCards = [...root.querySelectorAll<HTMLButtonElement>('.ar-model-card')];
    expect(modelCards.map((button) => button.dataset.modelId)).toEqual([
      'built-in-alpha',
      'built-in-beta',
      'generated-fc-123',
      'generated-upload-123-chair',
    ]);
    expect(root.querySelector<HTMLImageElement>('.ar-model-card[data-model-id="generated-fc-123"] img')?.src).toBe(
      'https://assets.example/previews/generated-chair.png',
    );

    root.querySelector<HTMLButtonElement>('.ar-model-card[data-model-id="generated-upload-123-chair"]')?.click();
    expect(onModelSelect).toHaveBeenCalledWith('generated-upload-123-chair');

    hud.updateModelReady(true);
    root.querySelector<HTMLButtonElement>('.ar-model-place-button')?.click();
    const railItems = [...root.querySelectorAll<HTMLButtonElement>('.model-rail-item')];
    expect(railItems.map((button) => button.dataset.modelId)).toEqual([
      'built-in-alpha',
      'built-in-beta',
      'generated-fc-123',
      'generated-upload-123-chair',
    ]);
    expect(root.querySelector<HTMLImageElement>('.model-rail-item[data-model-id="generated-fc-123"] img')?.src).toBe(
      'https://assets.example/previews/generated-chair.png',
    );

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Model Library')?.click();
    const uploadedRow = root.querySelector<HTMLElement>('.model-manager-row.is-uploaded')!;

    expect(uploadedRow).toBeInstanceOf(HTMLElement);
    expect(uploadedRow.textContent).toContain('Uploaded');
    expect(uploadedRow.textContent).toContain('chair');
    expect(uploadedRow.querySelector('.model-manager-thumbnail')?.textContent).toBe('GLB');
    expect([...uploadedRow.querySelectorAll('button')].map((button) => button.getAttribute('data-action'))).toEqual([
      'preview',
      'download',
      'favorite',
    ]);
    expect(onDeleteGeneratedModel).not.toHaveBeenCalled();
  });

  it('opens an edit dialog to update a generated model name and thumbnail', () => {
    const root = document.createElement('div');
    const onRenameGeneratedModel = vi.fn();
    const onUpdateModelThumbnail = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onRenameGeneratedModel, onUpdateModelThumbnail }));
    hud.updateAuthState(activeUser);

    hud.updateGeneratedModels([
      {
        id: 'generated-fc-123',
        label: 'chair - 2026-07-04 12:00:00 UTC',
        url: 'https://assets.example/generated-chair.glb',
        previewUrl: 'https://assets.example/previews/generated-chair.png',
        ownerEmail: activeUser.email,
        visibility: 'private',
      },
    ]);
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Model Library')?.click();

    const generatedRow = root.querySelector('.model-manager-row.is-generated')!;
    generatedRow.querySelector<HTMLButtonElement>('button[data-action="edit"]')?.click();

    const dialog = root.querySelector<HTMLElement>('.model-edit-dialog')!;
    const nameInput = dialog.querySelector<HTMLInputElement>('input[name="modelLabel"]')!;
    const thumbnailInput = dialog.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]')!;
    const file = new File(['image bytes'], 'chair.png', { type: 'image/png' });
    nameInput.value = '  Living room chair  ';
    Object.defineProperty(thumbnailInput, 'files', { value: [file], configurable: true });

    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('modelEditTitle');
    expect(dialog.querySelector('#modelEditTitle')?.textContent).toBe('Edit model');

    dialog.querySelector<HTMLButtonElement>('button[data-action="save-edit"]')?.click();

    expect(dialog.classList.contains('hidden')).toBe(true);
    expect(onRenameGeneratedModel).toHaveBeenCalledWith('generated-fc-123', 'Living room chair');
    expect(onUpdateModelThumbnail).toHaveBeenCalledWith('generated-fc-123', file);
  });

  it('preserves the selected thumbnail when models refresh after the file picker closes', () => {
    const root = document.createElement('div');
    const onUpdateModelThumbnail = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onUpdateModelThumbnail }));
    hud.updateAuthState(activeUser);
    const generatedModel = {
      id: 'generated-fc-123',
      label: 'chair',
      url: 'https://assets.example/generated-chair.glb',
      ownerEmail: activeUser.email,
      visibility: 'private' as const,
    };
    hud.updateGeneratedModels([generatedModel]);
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Model Library')?.click();

    root
      .querySelector('.model-manager-row.is-generated button[data-action="edit"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const dialog = root.querySelector<HTMLElement>('.model-edit-dialog')!;
    const thumbnailInput = dialog.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]')!;
    const file = new File(['image bytes'], 'chair.png', { type: 'image/png' });
    Object.defineProperty(thumbnailInput, 'files', { value: [file], configurable: true });

    hud.updateGeneratedModels([generatedModel]);

    expect(root.querySelector('.model-edit-dialog')).toBe(dialog);
    expect(thumbnailInput.files?.[0]).toBe(file);
    dialog.querySelector<HTMLButtonElement>('button[data-action="save-edit"]')?.click();
    expect(onUpdateModelThumbnail).toHaveBeenCalledWith('generated-fc-123', file);
  });

  it('renames and deletes generated models from the model manager', () => {
    const root = document.createElement('div');
    const onRenameGeneratedModel = vi.fn();
    const onDeleteGeneratedModel = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onRenameGeneratedModel, onDeleteGeneratedModel }));
    hud.updateAuthState(activeUser);

    hud.updateGeneratedModels([
      {
        id: 'generated-fc-123',
        label: 'chair - 2026-07-04 12:00:00 UTC',
        url: 'https://assets.example/generated-chair.glb',
        previewUrl: 'https://assets.example/previews/generated-chair.png',
        ownerEmail: activeUser.email,
        visibility: 'private',
      },
    ]);
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Model Library')?.click();

    const generatedRow = root.querySelector('.model-manager-row.is-generated')!;

    generatedRow.querySelector<HTMLButtonElement>('button[data-action="delete"]')?.click();

    expect(onRenameGeneratedModel).not.toHaveBeenCalled();
    expect(onDeleteGeneratedModel).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('.confirmation-dialog [data-action="confirm"]')?.click();
    expect(onDeleteGeneratedModel).toHaveBeenCalledWith('generated-fc-123');
  });

  it('closes the edit dialog on Escape and returns focus to its edit control', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);
    hud.updateGeneratedModels([
      {
        id: 'generated-fc-123',
        label: 'Chair',
        url: 'https://assets.example/generated-chair.glb',
        ownerEmail: activeUser.email,
        visibility: 'private',
      },
    ]);
    root.querySelector<HTMLButtonElement>('[data-nav-route="models"]')?.click();

    const editButton = root.querySelector<HTMLButtonElement>(
      '[data-model-id="generated-fc-123"] [data-action="edit"]',
    )!;
    editButton.focus();
    editButton.click();

    const dialog = root.querySelector<HTMLElement>('.model-edit-dialog')!;
    expect(document.activeElement).toBe(dialog.querySelector('input[name="modelLabel"]'));
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(root.querySelector('.model-edit-dialog')).toBeNull();
    expect(document.activeElement).toBe(editButton);
  });

  it('confirms destructive model deletion, supports Escape, and restores the delete control', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const onDeleteGeneratedModel = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onDeleteGeneratedModel }));
    hud.updateAuthState(activeUser);
    hud.updateGeneratedModels([
      {
        id: 'generated-fc-123',
        label: 'Living room chair',
        url: 'https://assets.example/generated-chair.glb',
        ownerEmail: activeUser.email,
        visibility: 'private',
      },
    ]);
    root.querySelector<HTMLButtonElement>('[data-nav-route="models"]')?.click();

    const deleteButton = root.querySelector<HTMLButtonElement>(
      '[data-model-id="generated-fc-123"] [data-action="delete"]',
    )!;
    deleteButton.focus();
    deleteButton.click();

    let dialog = root.querySelector<HTMLElement>('.confirmation-dialog')!;
    expect(onDeleteGeneratedModel).not.toHaveBeenCalled();
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('deleteModelTitle');
    expect(dialog.querySelector('.confirmation-message')?.textContent).toBe(
      'Living room chair will be removed from your library.',
    );
    expect(document.activeElement).toBe(dialog.querySelector('[data-action="cancel"]'));

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.querySelector('.confirmation-dialog')).toBeNull();
    expect(document.activeElement).toBe(deleteButton);
    expect(onDeleteGeneratedModel).not.toHaveBeenCalled();

    deleteButton.click();
    dialog = root.querySelector<HTMLElement>('.confirmation-dialog')!;
    dialog.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.click();

    expect(root.querySelector('.confirmation-dialog')).toBeNull();
    expect(onDeleteGeneratedModel).toHaveBeenCalledWith('generated-fc-123');
  });

  it('uses the same confirmation dialog before deleting an uploaded model', () => {
    const root = document.createElement('div');
    const onDeleteUploadedModel = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onDeleteUploadedModel }));
    hud.updateAuthState(activeUser);
    hud.updateUploadedModels([
      {
        id: 'uploaded-chair',
        label: 'Uploaded chair',
        url: 'blob:uploaded-chair',
        source: 'uploaded',
      },
    ]);
    root.querySelector<HTMLButtonElement>('[data-nav-route="models"]')?.click();

    root.querySelector<HTMLButtonElement>(
      '[data-model-id="uploaded-chair"] [data-action="delete"]',
    )?.click();
    expect(onDeleteUploadedModel).not.toHaveBeenCalled();

    root.querySelector<HTMLButtonElement>('.confirmation-dialog [data-action="confirm"]')?.click();
    expect(onDeleteUploadedModel).toHaveBeenCalledWith('uploaded-chair');
  });

  it('opens the model manager page directly from the models hash route', () => {
    window.history.replaceState(null, '', '/#/models');
    const root = document.createElement('div');

    new ARHud(root, modelOptions, createHandlers());

    expect(root.querySelector('.landing')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.model-manager')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.status-panel')?.classList.contains('hidden')).toBe(true);
  });

  it.each([
    ['full-flow', 'onFullFlowCapture'],
    ['dynamic', 'onDynamicFlowCapture'],
  ] as const)('hands the captured image to the %s generation handler before route cleanup', (route, handlerName) => {
    const root = document.createElement('div');
    let capturedImage: { imageBase64: string } | null = { imageBase64: 'original-capture' };
    const consumedImages: Array<string | undefined> = [];
    const onFullFlowCapture = vi.fn(() => consumedImages.push(capturedImage?.imageBase64));
    const onDynamicFlowCapture = vi.fn(() => consumedImages.push(capturedImage?.imageBase64));
    const onRouteExit = vi.fn((_previousRoute: string, nextRoute: string) => {
      if (nextRoute === 'ar') {
        capturedImage = null;
      }
    });
    const hud = new ARHud(root, modelOptions, createHandlers({
      onDynamicFlowCapture,
      onFullFlowCapture,
      onRouteExit,
    }));
    hud.updateAuthState(activeUser);
    root.querySelector<HTMLButtonElement>(`[data-nav-route="${route}"]`)?.click();
    hud.showCapturedImagePreview('blob:captured-image');

    [...root.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Generate and place')
      ?.click();

    expect({ onDynamicFlowCapture, onFullFlowCapture }[handlerName]).toHaveBeenCalledOnce();
    expect(consumedImages).toEqual(['original-capture']);
    expect(onRouteExit).toHaveBeenCalledWith(route, 'ar');
  });

  it('starts AR from the direct Full Flow generate tap after capture', () => {
    const root = document.createElement('div');
    const onCaptureImage = vi.fn();
    const onSubmitTarget = vi.fn();
    const onFullFlowCapture = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onCaptureImage, onSubmitTarget, onFullFlowCapture }));
    hud.updateAuthState(activeUser);
    const startArCamera = vi.fn();
    const arButton = document.createElement('button');
    arButton.textContent = 'Start AR';
    arButton.addEventListener('click', startArCamera);
    hud.attachARButton(arButton);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Photo to AR')?.click();
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Capture')?.click();

    expect(onCaptureImage).toHaveBeenCalledTimes(1);
    expect(onFullFlowCapture).not.toHaveBeenCalled();

    hud.showCapturedImagePreview('blob:captured-image');
    const targetInput = root.querySelector<HTMLInputElement>('input[name="targetObject"]');
    expect(targetInput?.classList.contains('hidden')).toBe(false);
    targetInput!.value = ' laptop ';
    const directGenerateButton = [...root.querySelectorAll('button')].find(
      (button) => button.textContent === 'Generate and place',
    );
    expect((directGenerateButton as HTMLButtonElement).disabled).toBe(false);
    directGenerateButton?.click();

    expect(window.location.hash).toBe('#/ar');
    expect(startArCamera).toHaveBeenCalledTimes(1);
    expect(onFullFlowCapture).toHaveBeenCalledWith('laptop');
    expect(onSubmitTarget).not.toHaveBeenCalled();
  });

  it('starts AR from the GPT-assisted Full Flow generate tap after extraction', () => {
    const root = document.createElement('div');
    const onSubmitTarget = vi.fn();
    const onFullFlowCapture = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onSubmitTarget, onFullFlowCapture }));
    hud.updateAuthState(activeUser);
    const startArCamera = vi.fn();
    const arButton = document.createElement('button');
    arButton.textContent = 'Start AR';
    arButton.addEventListener('click', startArCamera);
    hud.attachARButton(arButton);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Photo to AR')?.click();
    hud.showCapturedImagePreview('blob:captured-image');
    const targetInput = root.querySelector<HTMLInputElement>('input[name="targetObject"]');
    targetInput!.value = ' laptop ';

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Extract object')?.click();

    expect(onSubmitTarget).toHaveBeenCalledWith('laptop');

    hud.showExtractedImageReady('blob:extracted-image');
    const submitButton = [...root.querySelectorAll('button')].find(
      (button) => button.textContent === 'Extract object',
    );
    expect(submitButton?.classList.contains('hidden')).toBe(true);
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Generate and place')?.click();

    expect(window.location.hash).toBe('#/ar');
    expect(startArCamera).toHaveBeenCalledTimes(1);
    expect(onFullFlowCapture).toHaveBeenCalledWith('laptop');
  });

  it('starts Dynamic generation from the generate tap after capture without GPT submit', () => {
    const root = document.createElement('div');
    const onCaptureImage = vi.fn();
    const onSubmitTarget = vi.fn();
    const onDynamicFlowCapture = vi.fn();
    const hud = new ARHud(
      root,
      modelOptions,
      createHandlers({ onCaptureImage, onSubmitTarget, onDynamicFlowCapture }),
    );
    hud.updateAuthState(activeUser);
    const startArCamera = vi.fn();
    const arButton = document.createElement('button');
    arButton.textContent = 'Start AR';
    arButton.addEventListener('click', startArCamera);
    hud.attachARButton(arButton);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'AI-Enhanced Photo to AR')?.click();
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Capture')?.click();

    expect(onCaptureImage).toHaveBeenCalledTimes(1);

    hud.showCapturedImagePreview('blob:dynamic-capture');
    const targetInput = root.querySelector<HTMLInputElement>('input[name="targetObject"]');
    targetInput!.value = ' chair ';
    const submitButton = [...root.querySelectorAll('button')].find((button) => button.textContent === 'Extract object');
    expect(submitButton?.classList.contains('hidden')).toBe(true);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Generate and place')?.click();

    expect(window.location.hash).toBe('#/ar');
    expect(startArCamera).toHaveBeenCalledTimes(1);
    expect(onDynamicFlowCapture).toHaveBeenCalledWith('chair');
    expect(onSubmitTarget).not.toHaveBeenCalled();
  });

  it('shows a blocking loading state during Full Flow generation', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Photo to AR')?.click();
    hud.showFullFlowLoading('Building your 3D object in Modal...');

    expect(root.querySelector('.full-flow-loading')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.camera-panel')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.hud-actions')?.classList.contains('hidden')).toBe(true);
    expect(root.textContent).toContain('Building your 3D object in Modal...');
  });

  it('shows placement controls after Full Flow generation returns', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Photo to AR')?.click();
    hud.showFullFlowReady('You can place the object now.');

    expect(root.querySelector('.full-flow-loading')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.status-panel')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.camera-panel')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.hud-actions')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.gesture-surface')?.classList.contains('hidden')).toBe(false);
    expect(root.textContent).toContain('You can place the object now.');
  });

  it('selects the generated object after Full Flow generation returns without toggling AR', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);
    const startArCamera = vi.fn();
    const arButton = document.createElement('button');
    arButton.textContent = 'Start AR';
    arButton.addEventListener('click', startArCamera);
    hud.attachARButton(arButton);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Photo to AR')?.click();
    hud.showFullFlowReady('You can place the object now.', {
      id: 'full-flow-generated-object',
      label: 'Generated object',
      url: 'https://assets.example/generated-object.glb',
    });

    expect(window.location.hash).toBe('#/ar');
    expect(root.querySelector<HTMLSelectElement>('.model-picker select')?.value).toBe('full-flow-generated-object');
    expect(root.querySelector('.model-rail-item.is-selected')?.textContent).toContain('Generated object');
    expect(startArCamera).not.toHaveBeenCalled();
  });

  it('prompts for login when opening the camera hash route as a guest', () => {
    window.history.replaceState(null, '', '/#/camera');
    const root = document.createElement('div');
    const onStartCamera = vi.fn();

    new ARHud(root, modelOptions, createHandlers({ onStartCamera }));

    expect(window.location.hash).toBe('#/login');
    expect(root.textContent).toContain('Sign in to use Camera.');
    expect(onStartCamera).not.toHaveBeenCalled();
  });

  it('waits for auth restoration before resolving a protected deep link', () => {
    window.history.replaceState(null, '', '/#/speech');
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers(), { authRestoring: true });

    expect(window.location.hash).toBe('#/speech');
    expect(root.querySelector('.auth-panel')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.route-restoring')?.classList.contains('hidden')).toBe(false);

    hud.updateAuthState(activeUser);

    expect(window.location.hash).toBe('#/speech');
    expect(root.querySelector('.route-restoring')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.speech-panel')?.classList.contains('hidden')).toBe(false);
  });

  it('restores the intended protected route after login', () => {
    window.history.replaceState(null, '', '/#/speech');
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());

    expect(window.location.hash).toBe('#/login');

    hud.updateAuthState(activeUser);

    expect(window.location.hash).toBe('#/speech');
    expect(root.querySelector('.speech-panel')?.classList.contains('hidden')).toBe(false);
  });

  it('opens the AR View page directly from the ar hash route', () => {
    window.history.replaceState(null, '', '/#/ar');
    const root = document.createElement('div');

    new ARHud(root, modelOptions, createHandlers());

    expect(root.querySelector('.landing')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.status-panel')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.camera-panel')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.ar-model-picker')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.hud-actions')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.model-rail')?.classList.contains('hidden')).toBe(true);
  });

  it('returns from a sub page to the home page with the Back button', async () => {
    const root = document.createElement('div');
    const onRouteExit = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onRouteExit }));
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Camera to 3D')?.click();
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Back')?.click();

    await vi.waitFor(() => expect(window.location.hash).toBe('#/'));
    expect(onRouteExit).toHaveBeenCalledWith('camera', 'home');
    expect(root.querySelector('.landing')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.status-panel')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.camera-panel')?.classList.contains('hidden')).toBe(true);
  });

  it('enables Place while scanning after a model is ready', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);

    hud.updateModelReady(true);
    hud.update('scanning');

    const placeButton = [...root.querySelectorAll('button')].find(
      (button) => button.textContent === 'Place',
    );
    expect(placeButton).toBeInstanceOf(HTMLButtonElement);
    expect((placeButton as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps the immersive inspector visible after an object is placed', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Single-Object AR')?.click();
    root.querySelector<HTMLButtonElement>('.ar-model-card[data-model-id="built-in-alpha"]')?.click();
    hud.updateModelReady(true);
    root.querySelector<HTMLButtonElement>('.ar-model-place-button')?.click();
    hud.update('placed');

    const statusPanel = root.querySelector('.status-panel');

    expect(statusPanel?.classList.contains('immersive-inspector')).toBe(true);
    expect(statusPanel?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.status-panel > .page-back')).toBeNull();
    expect(root.querySelector('.immersive-exit')).toBeInstanceOf(HTMLButtonElement);
  });

  it('provides a gesture surface after opening AR placement controls', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Single-Object AR')?.click();
    root.querySelector<HTMLButtonElement>('.ar-model-card[data-model-id="built-in-alpha"]')?.click();
    hud.updateModelReady(true);
    root.querySelector<HTMLButtonElement>('.ar-model-place-button')?.click();

    expect(hud.gestureSurface.classList.contains('gesture-surface')).toBe(true);
    expect(hud.gestureSurface.classList.contains('hidden')).toBe(false);
    expect(hud.overlay.contains(hud.gestureSurface)).toBe(true);
  });

  it('provides a scrollable rotation slider for the selected AR object', () => {
    const root = document.createElement('div');
    const onRotate = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onRotate }));
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Single-Object AR')?.click();
    root.querySelector<HTMLButtonElement>('.ar-model-card[data-model-id="built-in-alpha"]')?.click();
    hud.updateModelReady(true);
    root.querySelector<HTMLButtonElement>('.ar-model-place-button')?.click();

    const rotateSlider = root.querySelector<HTMLInputElement>('.rotate-control input[type="range"]');
    expect(rotateSlider).toBeInstanceOf(HTMLInputElement);
    expect(rotateSlider?.getAttribute('aria-label')).toBe('Rotate selected object');
    expect(rotateSlider?.disabled).toBe(true);
    expect(root.textContent).not.toContain('Rotate Left');
    expect(root.textContent).not.toContain('Rotate Right');

    hud.update('placed');
    rotateSlider!.value = '30';
    rotateSlider!.dispatchEvent(new Event('input', { bubbles: true }));
    rotateSlider!.value = '45';
    rotateSlider!.dispatchEvent(new Event('input', { bubbles: true }));
    rotateSlider!.dispatchEvent(new Event('change', { bubbles: true }));

    expect(rotateSlider?.disabled).toBe(false);
    expect(onRotate).toHaveBeenCalledTimes(2);
    expect(onRotate.mock.calls[0][0]).toBeCloseTo(Math.PI / 6);
    expect(onRotate.mock.calls[1][0]).toBeCloseTo(Math.PI / 12);
    expect(rotateSlider?.value).toBe('0');
  });

  it('shows the current model source in the HUD', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());

    hud.updateModelSource('Cloudflare');

    expect(root.textContent).toContain('Model source: Cloudflare');
  });

  it('lists selectable models in the full-page AR picker without selecting one by default', () => {
    const root = document.createElement('div');
    new ARHud(root, modelOptions, createHandlers());

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Single-Object AR')?.click();
    const modelCards = [...root.querySelectorAll<HTMLButtonElement>('.ar-model-card')];

    expect(root.querySelector('.ar-model-card.is-selected')).toBeNull();
    expect(modelCards.map((button) => button.dataset.modelId)).toEqual(['built-in-alpha', 'built-in-beta']);
    expect(root.querySelector<HTMLButtonElement>('.ar-model-place-button')?.disabled).toBe(true);
  });

  it('requests a model load from the full-page picker before placement and from the rail after placement', () => {
    const root = document.createElement('div');
    const onModelSelect = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onModelSelect }));

    expect(onModelSelect).not.toHaveBeenCalled();

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Single-Object AR')?.click();
    root.querySelector<HTMLButtonElement>('.ar-model-card[data-model-id="built-in-beta"]')?.click();

    expect(onModelSelect).toHaveBeenCalledWith('built-in-beta');

    hud.updateModelReady(true);
    root.querySelector<HTMLButtonElement>('.ar-model-place-button')?.click();
    root.querySelector<HTMLButtonElement>('.model-rail-item[data-model-id="built-in-alpha"]')?.click();

    expect(onModelSelect).toHaveBeenLastCalledWith('built-in-alpha');
  });

  it('renders camera capture controls', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Camera to 3D')?.click();

    expect(root.textContent).toContain('Camera');
    expect([...root.querySelectorAll('button')].map((button) => button.textContent)).toEqual(
      expect.arrayContaining(['Capture', 'Generate model']),
    );
  });

  it('offers direct or GPT-assisted camera generation after capture', () => {
    const root = document.createElement('div');
    const onStartCamera = vi.fn();
    const onCaptureImage = vi.fn();
    const onSubmitTarget = vi.fn();
    const onGenerateModel = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onStartCamera, onCaptureImage, onSubmitTarget, onGenerateModel }));
    hud.updateAuthState(activeUser);

    const buttons = [...root.querySelectorAll('button')];
    buttons.find((button) => button.textContent === 'Camera to 3D')?.click();
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Capture')?.click();
    hud.showCapturedImagePreview('blob:captured-image');
    const targetInput = root.querySelector<HTMLInputElement>('input[name="targetObject"]');
    targetInput!.value = ' laptop ';
    const directGenerateButton = [...root.querySelectorAll<HTMLButtonElement>('.camera-actions button')].find(
      (button) => button.textContent === 'Generate model',
    );
    expect((directGenerateButton as HTMLButtonElement).disabled).toBe(false);
    directGenerateButton?.click();

    expect(onGenerateModel).toHaveBeenCalledWith('laptop');
    expect(onSubmitTarget).not.toHaveBeenCalled();

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Extract object')?.click();

    expect(onStartCamera).toHaveBeenCalledTimes(1);
    expect(onCaptureImage).toHaveBeenCalledTimes(1);
    expect(onSubmitTarget).toHaveBeenCalledWith('laptop');

    hud.showExtractedImageReady('blob:extracted-image');
    const submitButton = [...root.querySelectorAll('button')].find(
      (button) => button.textContent === 'Extract object',
    );
    expect(submitButton?.classList.contains('hidden')).toBe(true);
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);
    [...root.querySelectorAll<HTMLButtonElement>('.camera-actions button')].find(
      (button) => button.textContent === 'Generate model',
    )?.click();

    expect(onGenerateModel).toHaveBeenCalledTimes(2);
  });

  it('offers direct or GPT-assisted generation after image upload', () => {
    const root = document.createElement('div');
    const onUploadImage = vi.fn();
    const onSubmitTarget = vi.fn();
    const onGenerateModel = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onUploadImage, onSubmitTarget, onGenerateModel }));
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Image to 3D')?.click();
    const uploadInput = root.querySelector<HTMLInputElement>('input[name="uploadImage"]')!;
    const file = new File(['fake image bytes'], 'chair.png', { type: 'image/png' });
    Object.defineProperty(uploadInput, 'files', { value: [file], configurable: true });

    uploadInput.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onUploadImage).toHaveBeenCalledWith(file);

    hud.showUploadedImagePreview('blob:uploaded-image');
    const targetInput = root.querySelector<HTMLInputElement>('input[name="targetObject"]');
    targetInput!.value = ' chair ';
    const directGenerateButton = [...root.querySelectorAll<HTMLButtonElement>('.camera-actions button')].find(
      (button) => button.textContent === 'Generate model',
    );

    expect(root.textContent).toContain('Image uploaded. Submit to GPT or generate a 3D model directly.');
    expect((directGenerateButton as HTMLButtonElement).disabled).toBe(false);
    directGenerateButton?.click();

    expect(onGenerateModel).toHaveBeenCalledWith('chair');
    expect(onSubmitTarget).not.toHaveBeenCalled();

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Extract object')?.click();

    expect(onSubmitTarget).toHaveBeenCalledWith('chair');
  });

  it('shows generated model status and enables generation after capture', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());

    hud.updateCameraStatus('Image captured. Ready to generate.', true);
    hud.updateGeneratedModelSource('https://assets.example/models/generated/capture.glb');

    const generateButton = [...root.querySelectorAll<HTMLButtonElement>('.camera-actions button')].find(
      (button) => button.textContent === 'Generate model',
    );
    expect(root.textContent).toContain('Image captured. Ready to generate.');
    expect(root.textContent).toContain('Generated model: https://assets.example/models/generated/capture.glb');
    expect((generateButton as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows a captured still image and hides the live camera before generation', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());

    hud.showCapturedImagePreview('blob:captured-image');

    const video = root.querySelector('video.camera-preview');
    const image = root.querySelector('img.camera-preview') as HTMLImageElement | null;
    const submitButton = [...root.querySelectorAll('button')].find(
      (button) => button.textContent === 'Extract object',
    );
    const generateButton = [...root.querySelectorAll<HTMLButtonElement>('.camera-actions button')].find(
      (button) => button.textContent === 'Generate model',
    );
    const targetInput = root.querySelector<HTMLInputElement>('input[name="targetObject"]');

    expect(video?.classList.contains('hidden')).toBe(true);
    expect(image?.classList.contains('hidden')).toBe(false);
    expect(image?.src).toBe('blob:captured-image');
    expect(targetInput?.classList.contains('hidden')).toBe(false);
    expect(root.textContent).toContain('Image captured. Submit to GPT or generate a 3D model directly.');
    expect((submitButton as HTMLButtonElement).disabled).toBe(false);
    expect((generateButton as HTMLButtonElement).disabled).toBe(false);
  });

  it('hides the optional target input before capture', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Camera to 3D')?.click();

    const targetInput = root.querySelector<HTMLInputElement>('input[name="targetObject"]');
    expect(targetInput).toBeInstanceOf(HTMLInputElement);
    expect(targetInput?.classList.contains('hidden')).toBe(true);
  });

  it('refreshes generated datetime models in the AR picker and post-placement rail without losing built-in models', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());

    hud.updateGeneratedModels([
      {
        id: 'generated-fc-123',
        label: '2026-06-28 12:00:00 UTC',
        url: 'https://assets.example/generated.glb',
        previewUrl: 'https://assets.example/previews/generated.png',
      },
    ]);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Single-Object AR')?.click();
    const pickerItems = [...root.querySelectorAll<HTMLButtonElement>('.ar-model-card')].map((button) => ({
      label: button.querySelector('.ar-model-card-label')?.textContent,
      value: button.dataset.modelId,
    }));

    expect(pickerItems).toEqual([
      { label: 'Built-in alpha', value: 'built-in-alpha' },
      { label: 'Built-in beta', value: 'built-in-beta' },
      { label: '2026-06-28 12:00:00 UTC', value: 'generated-fc-123' },
    ]);

    root.querySelector<HTMLButtonElement>('.ar-model-card[data-model-id="generated-fc-123"]')?.click();
    hud.updateModelReady(true);
    root.querySelector<HTMLButtonElement>('.ar-model-place-button')?.click();
    const railItems = [...root.querySelectorAll<HTMLButtonElement>('.model-rail-item')].map((button) => ({
      label: button.querySelector('.model-rail-label')?.textContent,
      value: button.dataset.modelId,
    }));

    expect(railItems).toEqual([
      { label: 'Built-in alpha', value: 'built-in-alpha' },
      { label: 'Built-in beta', value: 'built-in-beta' },
      { label: '2026-06-28 12:00:00 UTC', value: 'generated-fc-123' },
    ]);
  });

  it('can hide the camera capture panel while AR is running', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    const cameraPanel = root.querySelector('.camera-panel');

    hud.setCameraPanelVisible(false);

    expect(cameraPanel?.classList.contains('hidden')).toBe(true);

    hud.setCameraPanelVisible(true);

    expect(cameraPanel?.classList.contains('hidden')).toBe(false);
  });
});
