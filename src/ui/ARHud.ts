import type { AppMode } from '../state/AppState';
import type { ModelOption } from '../app/models';

interface HUDHandlers {
  onPlace(): void;
  onEdit(): void;
  onReset(): void;
  onResetScale(): void;
  onRotateLeft(): void;
  onRotateRight(): void;
  onModelSelect(modelId: string): void;
  onStartCamera(): void;
  onCaptureImage(): void;
  onGenerateModel(): void;
}

export class ARHud {
  readonly overlay: HTMLElement;
  readonly gestureSurface: HTMLElement;
  readonly arButtonSlot: HTMLElement;
  readonly cameraPreviewVideo: HTMLVideoElement;

  private readonly statusMessage: HTMLElement;
  private readonly sourceMessage: HTMLElement;
  private readonly cameraStatusMessage: HTMLElement;
  private readonly generatedModelMessage: HTMLElement;
  private readonly modelSelect: HTMLSelectElement;
  private readonly placeButton: HTMLButtonElement;
  private readonly editButton: HTMLButtonElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly resetScaleButton: HTMLButtonElement;
  private readonly generateButton: HTMLButtonElement;
  private modelReady = false;

  constructor(
    root: HTMLElement,
    modelOptions: ModelOption[],
    private readonly handlers: HUDHandlers,
  ) {
    const shell = document.createElement('div');
    shell.className = 'app-shell';
    root.appendChild(shell);

    const landing = document.createElement('section');
    landing.className = 'landing';
    landing.innerHTML = `
      <div class="landing-inner">
        <h1>WebXR Floor Placement</h1>
        <p>Open this local app on Android Chrome, scan the floor, place the GLB model, then move, rotate, and scale it in AR.</p>
      </div>
    `;
    shell.appendChild(landing);

    this.overlay = document.createElement('div');
    this.overlay.className = 'xr-overlay';
    shell.appendChild(this.overlay);

    this.gestureSurface = document.createElement('div');
    this.gestureSurface.className = 'gesture-surface';
    this.overlay.appendChild(this.gestureSurface);

    const statusPanel = document.createElement('section');
    statusPanel.className = 'status-panel';
    statusPanel.innerHTML = `
      <p class="status-label">Status</p>
      <p class="status-message">Loading model...</p>
      <p class="status-source">Model source: Detecting...</p>
    `;
    this.statusMessage = statusPanel.querySelector<HTMLElement>('.status-message')!;
    this.sourceMessage = statusPanel.querySelector<HTMLElement>('.status-source')!;

    const modelPicker = document.createElement('label');
    modelPicker.className = 'model-picker';
    modelPicker.innerHTML = '<span>Model</span>';
    this.modelSelect = document.createElement('select');
    this.modelSelect.append(new Option('Select model', '', true, true));
    modelOptions.forEach((model) => {
      this.modelSelect.append(new Option(model.label, model.id));
    });
    this.modelSelect.addEventListener('change', () => {
      if (this.modelSelect.value) {
        this.handlers.onModelSelect(this.modelSelect.value);
      }
    });
    modelPicker.appendChild(this.modelSelect);
    statusPanel.appendChild(modelPicker);

    const cameraPanel = document.createElement('section');
    cameraPanel.className = 'camera-panel';
    cameraPanel.innerHTML = `
      <p class="camera-label">Camera</p>
      <video class="camera-preview" muted playsinline></video>
      <p class="camera-status">Start the camera, capture an image, then generate a 3D model.</p>
      <p class="generated-model-status">Generated model: None yet</p>
    `;
    this.cameraPreviewVideo = cameraPanel.querySelector<HTMLVideoElement>('.camera-preview')!;
    this.cameraStatusMessage = cameraPanel.querySelector<HTMLElement>('.camera-status')!;
    this.generatedModelMessage = cameraPanel.querySelector<HTMLElement>('.generated-model-status')!;

    const cameraActions = document.createElement('div');
    cameraActions.className = 'camera-actions';
    cameraActions.append(
      this.createButton('Start camera', '', this.handlers.onStartCamera),
      this.createButton('Capture', '', this.handlers.onCaptureImage),
    );
    this.generateButton = this.createButton('Generate 3D', 'primary', this.handlers.onGenerateModel);
    this.generateButton.disabled = true;
    cameraActions.append(this.generateButton);
    cameraPanel.appendChild(cameraActions);
    statusPanel.appendChild(cameraPanel);
    this.overlay.appendChild(statusPanel);

    const actions = document.createElement('div');
    actions.className = 'hud-actions';
    this.overlay.appendChild(actions);

    this.arButtonSlot = document.createElement('div');
    this.arButtonSlot.className = 'ar-button-slot';
    actions.appendChild(this.arButtonSlot);

    this.placeButton = this.createButton('Place', 'primary', this.handlers.onPlace);
    this.editButton = this.createButton('Edit', '', this.handlers.onEdit);
    this.resetScaleButton = this.createButton('Scale 1x', '', this.handlers.onResetScale);
    this.resetButton = this.createButton('Reset', '', this.handlers.onReset);

    actions.append(
      this.placeButton,
      this.editButton,
      this.resetScaleButton,
      this.resetButton,
    );

    this.update('loading', 'Loading model...');
  }

  attachARButton(button: HTMLElement): void {
    this.arButtonSlot.replaceChildren(button);
  }

  update(mode: AppMode, customMessage?: string): void {
    this.statusMessage.textContent = customMessage ?? this.messageForMode(mode);

    const hasPlacedObject = mode === 'placed' || mode === 'editing';
    this.placeButton.disabled = !this.modelReady || (mode !== 'scanning' && mode !== 'readyToPlace');
    this.editButton.disabled = !hasPlacedObject;
    this.resetScaleButton.disabled = !hasPlacedObject;
    this.resetButton.disabled = !hasPlacedObject;
  }

  updateModelSource(source: string): void {
    this.sourceMessage.textContent = `Model source: ${source}`;
  }

  updateModelReady(isReady: boolean): void {
    this.modelReady = isReady;
  }

  updateSelectedModel(modelId: string): void {
    this.modelSelect.value = modelId;
  }

  updateCameraStatus(message: string, canGenerate: boolean): void {
    this.cameraStatusMessage.textContent = message;
    this.generateButton.disabled = !canGenerate;
  }

  updateGeneratedModelSource(modelUrl: string): void {
    this.generatedModelMessage.textContent = `Generated model: ${modelUrl}`;
  }

  private createButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = className;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      onClick();
    });
    return button;
  }

  private messageForMode(mode: AppMode): string {
    switch (mode) {
      case 'unsupported':
        return 'Open the HTTPS tunnel link on Android Chrome with WebXR support.';
      case 'loading':
        return 'Loading model...';
      case 'scanning':
        return 'Scan the floor, then tap Place. If the ring appears, placement uses it; otherwise the app estimates the floor.';
      case 'readyToPlace':
        return 'Tap Place, tap the screen, or press the AR select action to put the model on the floor.';
      case 'placed':
        return 'Object placed. Drag with one finger, pinch to scale, twist with two fingers to rotate.';
      case 'editing':
        return 'Editing object. Drag on the floor, pinch to scale, twist with two fingers to rotate.';
    }
  }
}
