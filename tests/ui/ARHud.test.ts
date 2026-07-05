import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ARHud } from '../../src/ui/ARHud';

const modelOptions = [
  {
    id: 'trellis-fast-output',
    label: 'Fast output',
    url: 'https://web-ar-model-assets.pages.dev/models/trellis-2-4b-fast-output.glb',
  },
  {
    id: 'img4-output',
    label: 'Image 4 output',
    url: 'https://web-ar-model-assets.pages.dev/models/img4_20260628_153027.glb',
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
    onStoreUploadedModel: vi.fn(),
    onRenameGeneratedModel: vi.fn(),
    onDeleteGeneratedModel: vi.fn(),
    onToggleGeneratedModelVisibility: vi.fn(),
    onDeleteUploadedModel: vi.fn(),
    onPreviewModel: vi.fn(),
    onCloseModelPreview: vi.fn(),
    onPreviewLightingChange: vi.fn(),
    onPreviewLightDirectionChange: vi.fn(),
    onUpdateModelThumbnail: vi.fn(),
    onReturnHome: vi.fn(),
    onLogin: vi.fn(),
    onSignup: vi.fn(),
    onLogout: vi.fn(),
    onApproveAccount: vi.fn(),
    onRemoveAccount: vi.fn(),
    onRefreshAdminAccounts: vi.fn(),
    onRefreshAdminJobs: vi.fn(),
    onRetryAdminJob: vi.fn(),
    onCleanupFailedJobArtifacts: vi.fn(),
    onPrepareMultiObject: vi.fn(),
    onStartMultiObject: vi.fn(),
    onAddLayoutObject: vi.fn(),
    onDeleteLayoutObject: vi.fn(),
    ...overrides,
  };
}

const activeUser = {
  email: 'maker@example.com',
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

    expect(root.querySelector('.landing h1')?.textContent).toBe('Anima You 3D');
    const landingFlow = root.querySelector('.landing-flow');
    expect(landingFlow).not.toBeNull();
    expect([...root.querySelectorAll('.landing-flow-step strong')].map((step) => step.textContent)).toEqual([
      'Camera',
      '3D Model',
      'AR',
    ]);
    expect(root.textContent).toContain('Available as guest');
    expect(root.textContent).toContain('Login required');
    expect(root.querySelector('.landing-preview')).not.toBeNull();
    expect(choiceButtons).toEqual(['AR View', 'Models', 'Multi Object', 'Camera', 'Upload Image', 'Upload Model', 'Full Flow']);
    const modeGroups = [...root.querySelectorAll('.mode-group')];
    expect([...modeGroups[0].querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      'AR View',
      'Models',
      'Multi Object',
    ]);
    expect([...modeGroups[1].querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      'Camera',
      'Upload Image',
      'Upload Model',
      'Full Flow',
    ]);
    expect(statusPanel?.classList.contains('hidden')).toBe(true);
    expect(cameraPanel?.classList.contains('hidden')).toBe(true);
    expect(hudActions?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.gesture-surface')?.classList.contains('hidden')).toBe(true);
  });

  it('prompts guests to sign in for protected actions while leaving AR View, Models, and Multi Object public', () => {
    const root = document.createElement('div');
    const onStartCamera = vi.fn();
    new ARHud(root, modelOptions, createHandlers({ onStartCamera }));

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Camera')?.click();

    expect(onStartCamera).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/login');
    expect(root.textContent).toContain('Sign in to use Camera.');

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Multi Object')?.click();

    expect(window.location.hash).toBe('#/multi-object');
    expect(root.querySelector('.layout-manager')?.classList.contains('hidden')).toBe(false);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'AR View')?.click();

    expect(window.location.hash).toBe('#/ar');
    expect(root.querySelector('.ar-model-picker')?.classList.contains('hidden')).toBe(false);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Models')?.click();

    expect(window.location.hash).toBe('#/models');
    expect(root.querySelector('.model-manager')?.classList.contains('hidden')).toBe(false);
  });

  it('submits login and account creation from the auth screen', () => {
    const root = document.createElement('div');
    const onLogin = vi.fn();
    const onSignup = vi.fn();
    new ARHud(root, modelOptions, createHandlers({ onLogin, onSignup }));
    const nameLabel = (): HTMLLabelElement =>
      root.querySelector<HTMLInputElement>('input[name="authName"]')!.closest('label') as HTMLLabelElement;

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Login')?.click();
    expect(nameLabel().hidden).toBe(true);

    root.querySelector<HTMLInputElement>('input[name="authEmail"]')!.value = ' maker@example.com ';
    root.querySelector<HTMLInputElement>('input[name="authPassword"]')!.value = 'maker-password-123';
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Sign in')?.click();

    expect(onLogin).toHaveBeenCalledWith('maker@example.com', 'maker-password-123');

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Create account')?.click();
    expect(onSignup).not.toHaveBeenCalled();
    expect(nameLabel().hidden).toBe(false);

    root.querySelector<HTMLInputElement>('input[name="authName"]')!.value = ' Maker ';
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Create account')?.click();

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
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Admin')?.click();
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

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Camera')?.click();

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

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'AR View')?.click();

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
    expect(modelCards.map((button) => button.dataset.modelId)).toEqual(['trellis-fast-output', 'img4-output']);
    expect(modelCards.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Select Fast output',
      'Select Image 4 output',
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

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'AR View')?.click();
    root.querySelector<HTMLButtonElement>('.ar-model-card[data-model-id="img4-output"]')?.click();

    const placeArButton = root.querySelector<HTMLButtonElement>('.ar-model-place-button')!;
    expect(onModelSelect).toHaveBeenCalledWith('img4-output');
    expect(root.querySelector('.ar-model-card.is-selected')?.textContent).toContain('Image 4 output');
    expect(placeArButton.disabled).toBe(true);

    hud.updateModelReady(true);
    placeArButton.click();

    expect(startArCamera).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.ar-model-picker')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.model-rail')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.hud-actions')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.gesture-surface')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.model-rail-item.is-selected')?.textContent).toContain('Image 4 output');
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

  it('opens Full Flow from the first screen as a capture page', () => {
    const root = document.createElement('div');
    const onStartCamera = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onStartCamera }));
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Full Flow')?.click();

    expect(window.location.hash).toBe('#/full-flow');
    expect(onStartCamera).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.landing')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.camera-panel')?.classList.contains('fullscreen')).toBe(true);
    expect(root.textContent).toContain('Capture');
  });

  it('opens Multi Object for guests as a fresh AR placement session without saved layouts', () => {
    const root = document.createElement('div');
    const onStartMultiObject = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onStartMultiObject }));
    const startArCamera = vi.fn();
    const arButton = document.createElement('button');
    arButton.textContent = 'Start AR';
    arButton.addEventListener('click', startArCamera);
    hud.attachARButton(arButton);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Multi Object')?.click();

    expect(window.location.hash).toBe('#/multi-object');
    expect(root.querySelector('.layout-manager')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.landing')?.classList.contains('hidden')).toBe(true);
    expect(root.textContent).toContain('This session starts empty each time.');
    expect(root.textContent).not.toContain('Save Layout');
    expect(root.querySelector('.layout-row')).toBeNull();

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Start Session')?.click();

    expect(startArCamera).toHaveBeenCalledTimes(1);
    expect(onStartMultiObject).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.layout-manager')?.classList.contains('hidden')).toBe(true);
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
    [...root.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Add Object')?.click();
    [...root.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Delete Object')?.click();

    expect(root.querySelector('.status-panel')?.classList.contains('layout-active')).toBe(true);
    expect(root.querySelector('.hud-actions')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.gesture-surface')?.classList.contains('hidden')).toBe(false);
    const actionButtons = [...root.querySelectorAll<HTMLButtonElement>('.hud-actions > button')];
    expect(actionButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Place',
      'Scale 1x',
      'Reset',
      'Add Object',
      'Delete Object',
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

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Upload Image')?.click();

    const landing = root.querySelector('.landing');
    const statusPanel = root.querySelector('.status-panel');
    const cameraPanel = root.querySelector('.camera-panel');
    const uploadInput = root.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]');
    const captureButton = [...root.querySelectorAll('button')].find((button) => button.textContent === 'Capture');
    const generateButton = [...root.querySelectorAll('button')].find((button) => button.textContent === 'Generate 3D');

    expect(onStartCamera).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/upload');
    expect(landing?.classList.contains('hidden')).toBe(true);
    expect(statusPanel?.classList.contains('camera-active')).toBe(true);
    expect(cameraPanel?.classList.contains('fullscreen')).toBe(true);
    expect(uploadInput).toBeInstanceOf(HTMLInputElement);
    expect(uploadInput?.classList.contains('hidden')).toBe(false);
    expect(captureButton?.classList.contains('hidden')).toBe(true);
    expect((generateButton as HTMLButtonElement).disabled).toBe(true);
    expect(root.textContent).toContain('Upload an image to create a 3D model.');
  });

  it('opens upload model from the first screen with a GLB picker', () => {
    const root = document.createElement('div');
    const onStartCamera = vi.fn();
    const onUploadModel = vi.fn();
    const onStoreUploadedModel = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onStartCamera, onUploadModel, onStoreUploadedModel }));
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Upload Model')?.click();
    const uploadInput = root.querySelector<HTMLInputElement>('input[type="file"][accept=".glb,model/gltf-binary"]')!;
    const storeButton = [...root.querySelectorAll('.camera-actions button')].find(
      (button) => button.textContent === 'Store Model',
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
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Models')?.click();

    const manager = root.querySelector('.model-manager');
    const rows = [...root.querySelectorAll('.model-manager-row')];

    expect(window.location.hash).toBe('#/models');
    expect(manager?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.landing')?.classList.contains('hidden')).toBe(true);
    expect(rows.map((row) => (row as HTMLElement).dataset.modelId)).toEqual(['generated-fc-123']);
    expect(manager?.textContent).not.toContain('Fast output');
    expect(manager?.textContent).not.toContain('Image 4 output');
    expect(manager?.textContent).toContain('chair - 2026-07-04 12:00:00 UTC');
    expect(root.querySelector<HTMLImageElement>('.model-manager-thumbnail img')?.src).toBe(
      'https://assets.example/previews/generated-chair.png',
    );
    expect([...root.querySelectorAll('.model-manager-row.is-generated button')].map((button) => button.getAttribute('aria-label'))).toEqual([
      'Preview chair - 2026-07-04 12:00:00 UTC',
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

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Models')?.click();

    const guestGeneratedRows = [...root.querySelectorAll('.model-manager-row.is-generated')];
    expect(guestGeneratedRows.map((row) => [...row.querySelectorAll('button')].map((button) => button.getAttribute('data-action')))).toEqual([
      ['preview', 'favorite'],
      ['preview', 'favorite'],
    ]);

    hud.updateAuthState(activeUser);

    const ownerRow = root.querySelector<HTMLElement>('.model-manager-row[data-model-id="generated-owned-chair"]')!;
    const otherRow = root.querySelector<HTMLElement>('.model-manager-row[data-model-id="generated-other-table"]')!;

    expect([...ownerRow.querySelectorAll('button')].map((button) => button.getAttribute('data-action'))).toEqual([
      'preview',
      'favorite',
      'visibility',
      'edit',
      'delete',
    ]);
    expect([...otherRow.querySelectorAll('button')].map((button) => button.getAttribute('data-action'))).toEqual(['preview', 'favorite']);
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

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Models')?.click();

    const clickIcon = (action: string): void => {
      root
        .querySelector<SVGElement>(`.model-manager-row[data-model-id="generated-owned-chair"] button[data-action="${action}"] svg`)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    };

    clickIcon('favorite');
    clickIcon('visibility');
    clickIcon('edit');
    expect(root.querySelector('.model-edit-dialog')).toBeInstanceOf(HTMLElement);
    clickIcon('delete');

    expect(onPreviewModel).not.toHaveBeenCalled();
    expect(onToggleGeneratedModelVisibility).toHaveBeenCalledWith('generated-owned-chair', 'private');
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

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Models')?.click();
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
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'AR View')?.click();
    const arSearchInput = root.querySelector<HTMLInputElement>('input[name="arModelSearch"]')!;
    arSearchInput.value = 'laptop';
    arSearchInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect([...root.querySelectorAll<HTMLElement>('.ar-model-card')].map((card) => card.dataset.modelId)).toEqual([
      'generated-laptop',
    ]);

    root.querySelector<HTMLButtonElement>('.ar-model-card[data-model-id="generated-laptop"]')?.click();
    expect(onModelSelect).toHaveBeenCalledWith('generated-laptop');

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Models')?.click();
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
    const hud = new ARHud(root, modelOptions, createHandlers({
      onPreviewModel,
      onCloseModelPreview,
      onPreviewLightingChange,
      onPreviewLightDirectionChange,
    }));
    hud.updateGeneratedModels([
      {
        id: 'generated-preview-chair',
        label: 'Preview chair',
        url: 'https://assets.example/preview-chair.glb',
        visibility: 'public',
      },
    ]);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Models')?.click();
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

    root.querySelector<HTMLButtonElement>('.model-preview-close')?.click();

    expect(onCloseModelPreview).toHaveBeenCalledTimes(1);
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

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'AR View')?.click();
    const modelCards = [...root.querySelectorAll<HTMLButtonElement>('.ar-model-card')];
    expect(modelCards.map((button) => button.dataset.modelId)).toEqual([
      'trellis-fast-output',
      'img4-output',
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
      'trellis-fast-output',
      'img4-output',
      'generated-fc-123',
      'generated-upload-123-chair',
    ]);
    expect(root.querySelector<HTMLImageElement>('.model-rail-item[data-model-id="generated-fc-123"] img')?.src).toBe(
      'https://assets.example/previews/generated-chair.png',
    );

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Models')?.click();
    const uploadedRow = root.querySelector<HTMLElement>('.model-manager-row.is-uploaded')!;

    expect(uploadedRow).toBeInstanceOf(HTMLElement);
    expect(uploadedRow.textContent).toContain('Uploaded');
    expect(uploadedRow.textContent).toContain('chair');
    expect(uploadedRow.querySelector('.model-manager-thumbnail')?.textContent).toBe('GLB');
    expect([...uploadedRow.querySelectorAll('button')].map((button) => button.getAttribute('data-action'))).toEqual([
      'preview',
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
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Models')?.click();

    const generatedRow = root.querySelector('.model-manager-row.is-generated')!;
    generatedRow.querySelector<HTMLButtonElement>('button[data-action="edit"]')?.click();

    const dialog = root.querySelector<HTMLElement>('.model-edit-dialog')!;
    const nameInput = dialog.querySelector<HTMLInputElement>('input[name="modelLabel"]')!;
    const thumbnailInput = dialog.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]')!;
    const file = new File(['image bytes'], 'chair.png', { type: 'image/png' });
    nameInput.value = '  Living room chair  ';
    Object.defineProperty(thumbnailInput, 'files', { value: [file], configurable: true });

    dialog.querySelector<HTMLButtonElement>('button[data-action="save-edit"]')?.click();

    expect(dialog.classList.contains('hidden')).toBe(true);
    expect(onRenameGeneratedModel).toHaveBeenCalledWith('generated-fc-123', 'Living room chair');
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
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Models')?.click();

    const generatedRow = root.querySelector('.model-manager-row.is-generated')!;

    generatedRow.querySelector<HTMLButtonElement>('button[data-action="delete"]')?.click();

    expect(onRenameGeneratedModel).not.toHaveBeenCalled();
    expect(onDeleteGeneratedModel).toHaveBeenCalledWith('generated-fc-123');
  });

  it('opens the model manager page directly from the models hash route', () => {
    window.history.replaceState(null, '', '/#/models');
    const root = document.createElement('div');

    new ARHud(root, modelOptions, createHandlers());

    expect(root.querySelector('.landing')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector('.model-manager')?.classList.contains('hidden')).toBe(false);
    expect(root.querySelector('.status-panel')?.classList.contains('hidden')).toBe(true);
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

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Full Flow')?.click();
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Capture')?.click();

    expect(onCaptureImage).toHaveBeenCalledTimes(1);
    expect(onFullFlowCapture).not.toHaveBeenCalled();

    hud.showCapturedImagePreview('blob:captured-image');
    const targetInput = root.querySelector<HTMLInputElement>('input[name="targetObject"]');
    expect(targetInput?.classList.contains('hidden')).toBe(false);
    targetInput!.value = ' laptop ';
    const directGenerateButton = [...root.querySelectorAll('button')].find(
      (button) => button.textContent === 'Generate and Place',
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

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Full Flow')?.click();
    hud.showCapturedImagePreview('blob:captured-image');
    const targetInput = root.querySelector<HTMLInputElement>('input[name="targetObject"]');
    targetInput!.value = ' laptop ';

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Submit')?.click();

    expect(onSubmitTarget).toHaveBeenCalledWith('laptop');

    hud.showExtractedImageReady('blob:extracted-image');
    const submitButton = [...root.querySelectorAll('button')].find(
      (button) => button.textContent === 'Submit',
    );
    expect(submitButton?.classList.contains('hidden')).toBe(true);
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Generate and Place')?.click();

    expect(window.location.hash).toBe('#/ar');
    expect(startArCamera).toHaveBeenCalledTimes(1);
    expect(onFullFlowCapture).toHaveBeenCalledWith('laptop');
  });

  it('shows a blocking loading state during Full Flow generation', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Full Flow')?.click();
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

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Full Flow')?.click();
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

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Full Flow')?.click();
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

  it('returns from a sub page to the home page with the Back button', () => {
    const root = document.createElement('div');
    const onReturnHome = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onReturnHome }));
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Camera')?.click();
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Back')?.click();

    expect(window.location.hash).toBe('#/');
    expect(onReturnHome).toHaveBeenCalledTimes(1);
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

  it('collapses AR status to only the Back button after an object is placed', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'AR View')?.click();
    hud.update('placed');

    const statusPanel = root.querySelector('.status-panel');
    const backButton = root.querySelector<HTMLButtonElement>('.status-panel > .page-back');

    expect(statusPanel?.classList.contains('object-placed')).toBe(true);
    expect(statusPanel?.classList.contains('hidden')).toBe(false);
    expect(backButton).toBeInstanceOf(HTMLButtonElement);
    expect(backButton?.classList.contains('hidden')).toBe(false);
  });

  it('provides a gesture surface after opening AR placement controls', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'AR View')?.click();
    root.querySelector<HTMLButtonElement>('.ar-model-card[data-model-id="trellis-fast-output"]')?.click();
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

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'AR View')?.click();
    root.querySelector<HTMLButtonElement>('.ar-model-card[data-model-id="trellis-fast-output"]')?.click();
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

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'AR View')?.click();
    const modelCards = [...root.querySelectorAll<HTMLButtonElement>('.ar-model-card')];

    expect(root.querySelector('.ar-model-card.is-selected')).toBeNull();
    expect(modelCards.map((button) => button.dataset.modelId)).toEqual(['trellis-fast-output', 'img4-output']);
    expect(root.querySelector<HTMLButtonElement>('.ar-model-place-button')?.disabled).toBe(true);
  });

  it('requests a model load from the full-page picker before placement and from the rail after placement', () => {
    const root = document.createElement('div');
    const onModelSelect = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onModelSelect }));

    expect(onModelSelect).not.toHaveBeenCalled();

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'AR View')?.click();
    root.querySelector<HTMLButtonElement>('.ar-model-card[data-model-id="img4-output"]')?.click();

    expect(onModelSelect).toHaveBeenCalledWith('img4-output');

    hud.updateModelReady(true);
    root.querySelector<HTMLButtonElement>('.ar-model-place-button')?.click();
    root.querySelector<HTMLButtonElement>('.model-rail-item[data-model-id="trellis-fast-output"]')?.click();

    expect(onModelSelect).toHaveBeenLastCalledWith('trellis-fast-output');
  });

  it('renders camera capture controls', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Camera')?.click();

    expect(root.textContent).toContain('Camera');
    expect([...root.querySelectorAll('button')].map((button) => button.textContent)).toEqual(
      expect.arrayContaining(['Capture', 'Generate 3D']),
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
    buttons.find((button) => button.textContent === 'Camera')?.click();
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Capture')?.click();
    hud.showCapturedImagePreview('blob:captured-image');
    const targetInput = root.querySelector<HTMLInputElement>('input[name="targetObject"]');
    targetInput!.value = ' laptop ';
    const directGenerateButton = [...root.querySelectorAll('button')].find(
      (button) => button.textContent === 'Generate 3D',
    );
    expect((directGenerateButton as HTMLButtonElement).disabled).toBe(false);
    directGenerateButton?.click();

    expect(onGenerateModel).toHaveBeenCalledWith('laptop');
    expect(onSubmitTarget).not.toHaveBeenCalled();

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Submit')?.click();

    expect(onStartCamera).toHaveBeenCalledTimes(1);
    expect(onCaptureImage).toHaveBeenCalledTimes(1);
    expect(onSubmitTarget).toHaveBeenCalledWith('laptop');

    hud.showExtractedImageReady('blob:extracted-image');
    const submitButton = [...root.querySelectorAll('button')].find(
      (button) => button.textContent === 'Submit',
    );
    expect(submitButton?.classList.contains('hidden')).toBe(true);
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);
    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Generate 3D')?.click();

    expect(onGenerateModel).toHaveBeenCalledTimes(2);
  });

  it('offers direct or GPT-assisted generation after image upload', () => {
    const root = document.createElement('div');
    const onUploadImage = vi.fn();
    const onSubmitTarget = vi.fn();
    const onGenerateModel = vi.fn();
    const hud = new ARHud(root, modelOptions, createHandlers({ onUploadImage, onSubmitTarget, onGenerateModel }));
    hud.updateAuthState(activeUser);

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Upload Image')?.click();
    const uploadInput = root.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]')!;
    const file = new File(['fake image bytes'], 'chair.png', { type: 'image/png' });
    Object.defineProperty(uploadInput, 'files', { value: [file], configurable: true });

    uploadInput.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onUploadImage).toHaveBeenCalledWith(file);

    hud.showUploadedImagePreview('blob:uploaded-image');
    const targetInput = root.querySelector<HTMLInputElement>('input[name="targetObject"]');
    targetInput!.value = ' chair ';
    const directGenerateButton = [...root.querySelectorAll('button')].find(
      (button) => button.textContent === 'Generate 3D',
    );

    expect(root.textContent).toContain('Image uploaded. Submit to GPT or generate a 3D model directly.');
    expect((directGenerateButton as HTMLButtonElement).disabled).toBe(false);
    directGenerateButton?.click();

    expect(onGenerateModel).toHaveBeenCalledWith('chair');
    expect(onSubmitTarget).not.toHaveBeenCalled();

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Submit')?.click();

    expect(onSubmitTarget).toHaveBeenCalledWith('chair');
  });

  it('shows generated model status and enables generation after capture', () => {
    const root = document.createElement('div');
    const hud = new ARHud(root, modelOptions, createHandlers());

    hud.updateCameraStatus('Image captured. Ready to generate.', true);
    hud.updateGeneratedModelSource('https://assets.example/models/generated/capture.glb');

    const generateButton = [...root.querySelectorAll('button')].find(
      (button) => button.textContent === 'Generate 3D',
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
      (button) => button.textContent === 'Submit',
    );
    const generateButton = [...root.querySelectorAll('button')].find(
      (button) => button.textContent === 'Generate 3D',
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

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'Camera')?.click();

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

    [...root.querySelectorAll('button')].find((button) => button.textContent === 'AR View')?.click();
    const pickerItems = [...root.querySelectorAll<HTMLButtonElement>('.ar-model-card')].map((button) => ({
      label: button.querySelector('.ar-model-card-label')?.textContent,
      value: button.dataset.modelId,
    }));

    expect(pickerItems).toEqual([
      { label: 'Fast output', value: 'trellis-fast-output' },
      { label: 'Image 4 output', value: 'img4-output' },
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
      { label: 'Fast output', value: 'trellis-fast-output' },
      { label: 'Image 4 output', value: 'img4-output' },
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
