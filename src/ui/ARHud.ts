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
  onFullFlowCapture(): void;
  onReturnHome(): void;
}

type HudRoute = 'home' | 'camera' | 'ar' | 'full-flow';

export class ARHud {
  readonly overlay: HTMLElement;
  readonly gestureSurface: HTMLElement;
  readonly arButtonSlot: HTMLElement;
  readonly cameraPreviewVideo: HTMLVideoElement;

  private readonly landing: HTMLElement;
  private readonly statusPanel: HTMLElement;
  private readonly hudActions: HTMLElement;
  private readonly statusMessage: HTMLElement;
  private readonly sourceMessage: HTMLElement;
  private readonly cameraPanel: HTMLElement;
  private readonly fullFlowLoading: HTMLElement;
  private readonly cameraStatusMessage: HTMLElement;
  private readonly generatedModelMessage: HTMLElement;
  private readonly modelSelect: HTMLSelectElement;
  private readonly backButton: HTMLButtonElement;
  private readonly placeButton: HTMLButtonElement;
  private readonly editButton: HTMLButtonElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly resetScaleButton: HTMLButtonElement;
  private readonly generateButton: HTMLButtonElement;
  private readonly baseModelOptions: ModelOption[];
  private modelReady = false;
  private activeRoute: HudRoute | null = null;

  constructor(
    root: HTMLElement,
    modelOptions: ModelOption[],
    private readonly handlers: HUDHandlers,
  ) {
    this.baseModelOptions = [...modelOptions];
    const shell = document.createElement('div');
    shell.className = 'app-shell';
    root.appendChild(shell);

    this.landing = document.createElement('section');
    this.landing.className = 'landing';
    this.landing.innerHTML = `
      <div class="landing-inner">
        <h1>WebXR Floor Placement</h1>
        <p>Capture a real object for 3D generation, or open AR to place an existing model.</p>
      </div>
    `;
    const modePicker = document.createElement('div');
    modePicker.className = 'mode-picker';
    modePicker.append(
      this.createButton('Camera', 'primary', () => this.navigateTo('camera')),
      this.createButton('AR View', '', () => this.navigateTo('ar')),
      this.createButton('Full Flow', '', () => this.navigateTo('full-flow')),
    );
    this.landing.querySelector('.landing-inner')?.appendChild(modePicker);
    shell.appendChild(this.landing);

    this.overlay = document.createElement('div');
    this.overlay.className = 'xr-overlay';
    shell.appendChild(this.overlay);

    this.gestureSurface = document.createElement('div');
    this.gestureSurface.className = 'gesture-surface hidden';
    this.overlay.appendChild(this.gestureSurface);

    this.statusPanel = document.createElement('section');
    this.statusPanel.className = 'status-panel hidden';
    this.statusPanel.innerHTML = `
      <p class="status-label">Status</p>
      <p class="status-message">Loading model...</p>
      <p class="status-source">Model source: Detecting...</p>
    `;
    this.statusMessage = this.statusPanel.querySelector<HTMLElement>('.status-message')!;
    this.sourceMessage = this.statusPanel.querySelector<HTMLElement>('.status-source')!;
    this.backButton = this.createButton('Back', 'page-back', () => this.navigateTo('home'));
    this.statusPanel.prepend(this.backButton);

    this.fullFlowLoading = document.createElement('section');
    this.fullFlowLoading.className = 'full-flow-loading hidden';
    this.fullFlowLoading.innerHTML = `
      <div class="loading-ring" aria-hidden="true"></div>
      <p>Building your 3D object in Modal...</p>
    `;
    this.statusPanel.appendChild(this.fullFlowLoading);

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
    this.statusPanel.appendChild(modelPicker);

    const cameraPanel = document.createElement('section');
    cameraPanel.className = 'camera-panel hidden';
    cameraPanel.innerHTML = `
      <p class="camera-label">Camera</p>
      <video class="camera-preview" muted playsinline></video>
      <p class="camera-status">Start the camera, capture an image, then generate a 3D model.</p>
      <p class="generated-model-status">Generated model: None yet</p>
    `;
    this.cameraPreviewVideo = cameraPanel.querySelector<HTMLVideoElement>('.camera-preview')!;
    this.cameraPanel = cameraPanel;
    this.cameraStatusMessage = cameraPanel.querySelector<HTMLElement>('.camera-status')!;
    this.generatedModelMessage = cameraPanel.querySelector<HTMLElement>('.generated-model-status')!;

    const cameraActions = document.createElement('div');
    cameraActions.className = 'camera-actions';
    cameraActions.append(
      this.createButton('Capture', '', () => this.handleCaptureClick()),
    );
    this.generateButton = this.createButton('Generate 3D', 'primary', this.handlers.onGenerateModel);
    this.generateButton.disabled = true;
    cameraActions.append(this.generateButton);
    cameraPanel.appendChild(cameraActions);
    this.statusPanel.appendChild(cameraPanel);
    this.overlay.appendChild(this.statusPanel);

    this.hudActions = document.createElement('div');
    this.hudActions.className = 'hud-actions hidden';
    this.overlay.appendChild(this.hudActions);

    this.arButtonSlot = document.createElement('div');
    this.arButtonSlot.className = 'ar-button-slot';
    this.hudActions.appendChild(this.arButtonSlot);

    this.placeButton = this.createButton('Place', 'primary', this.handlers.onPlace);
    this.editButton = this.createButton('Edit', '', this.handlers.onEdit);
    this.resetScaleButton = this.createButton('Scale 1x', '', this.handlers.onResetScale);
    this.resetButton = this.createButton('Reset', '', this.handlers.onReset);

    this.hudActions.append(
      this.placeButton,
      this.editButton,
      this.resetScaleButton,
      this.resetButton,
    );

    window.addEventListener('hashchange', () => this.applyCurrentRoute());

    this.update('loading', 'Loading model...');
    this.applyCurrentRoute();
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

  updateGeneratedModels(generatedModels: ModelOption[]): void {
    const selectedModelId = this.modelSelect.value;
    this.modelSelect.replaceChildren(new Option('Select model', '', true, !selectedModelId));
    [...this.baseModelOptions, ...generatedModels].forEach((model) => {
      this.modelSelect.append(new Option(model.label, model.id));
    });
    if ([...this.modelSelect.options].some((option) => option.value === selectedModelId)) {
      this.modelSelect.value = selectedModelId;
    }
  }

  setCameraPanelVisible(isVisible: boolean): void {
    this.cameraPanel.classList.toggle('hidden', !isVisible);
  }

  showFullFlowLoading(message: string): void {
    this.landing.classList.add('hidden');
    this.statusPanel.classList.remove('hidden');
    this.statusPanel.classList.add('full-flow-active');
    this.statusPanel.classList.remove('camera-active');
    this.cameraPanel.classList.add('hidden');
    this.hudActions.classList.add('hidden');
    this.gestureSurface.classList.add('hidden');
    this.fullFlowLoading.classList.remove('hidden');
    const messageElement = this.fullFlowLoading.querySelector('p');
    if (messageElement) {
      messageElement.textContent = message;
    }
  }

  showFullFlowReady(message: string): void {
    this.landing.classList.add('hidden');
    this.statusPanel.classList.remove('hidden');
    this.statusPanel.classList.remove('camera-active');
    this.statusPanel.classList.remove('full-flow-active');
    this.cameraPanel.classList.add('hidden');
    this.cameraPanel.classList.remove('fullscreen');
    this.fullFlowLoading.classList.add('hidden');
    this.hudActions.classList.remove('hidden');
    this.gestureSurface.classList.remove('hidden');
    this.statusMessage.textContent = message;
  }

  showFullFlowError(message: string): void {
    this.fullFlowLoading.classList.add('hidden');
    this.statusPanel.classList.add('camera-active');
    this.statusPanel.classList.remove('full-flow-active');
    this.cameraPanel.classList.remove('hidden');
    this.cameraPanel.classList.add('fullscreen');
    this.hudActions.classList.add('hidden');
    this.gestureSurface.classList.add('hidden');
    this.updateCameraStatus(message, false);
  }

  private navigateTo(route: HudRoute): void {
    const hash = route === 'home' ? '#/' : `#/${route}`;
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    this.applyRoute(route);
  }

  private applyCurrentRoute(): void {
    this.applyRoute(this.routeFromHash(window.location.hash));
  }

  private routeFromHash(hash: string): HudRoute {
    switch (hash) {
      case '#/camera':
        return 'camera';
      case '#/ar':
        return 'ar';
      case '#/full-flow':
        return 'full-flow';
      default:
        return 'home';
    }
  }

  private applyRoute(route: HudRoute): void {
    if (this.activeRoute === route) {
      return;
    }

    const previousRoute = this.activeRoute;
    this.activeRoute = route;

    if (route === 'camera') {
      this.openCameraPage();
      return;
    }

    if (route === 'ar') {
      this.openARPage();
      return;
    }

    if (route === 'full-flow') {
      this.openFullFlowPage();
      return;
    }

    this.openHomePage(previousRoute);
  }

  private openHomePage(previousRoute: HudRoute | null): void {
    this.landing.classList.remove('hidden');
    this.statusPanel.classList.add('hidden');
    this.statusPanel.classList.remove('camera-active');
    this.statusPanel.classList.remove('full-flow-active');
    this.hudActions.classList.add('hidden');
    this.gestureSurface.classList.add('hidden');
    this.cameraPanel.classList.add('hidden');
    this.cameraPanel.classList.remove('fullscreen');
    this.fullFlowLoading.classList.add('hidden');

    if (previousRoute !== null && previousRoute !== 'home') {
      this.handlers.onReturnHome();
    }
  }

  private openCameraPage(): void {
    this.landing.classList.add('hidden');
    this.statusPanel.classList.remove('hidden');
    this.statusPanel.classList.add('camera-active');
    this.statusPanel.classList.remove('full-flow-active');
    this.hudActions.classList.add('hidden');
    this.gestureSurface.classList.add('hidden');
    this.cameraPanel.classList.remove('hidden');
    this.cameraPanel.classList.add('fullscreen');
    this.fullFlowLoading.classList.add('hidden');
    this.handlers.onStartCamera();
  }

  private openARPage(): void {
    this.landing.classList.add('hidden');
    this.statusPanel.classList.remove('hidden');
    this.statusPanel.classList.remove('camera-active');
    this.statusPanel.classList.remove('full-flow-active');
    this.hudActions.classList.remove('hidden');
    this.gestureSurface.classList.remove('hidden');
    this.cameraPanel.classList.add('hidden');
    this.cameraPanel.classList.remove('fullscreen');
    this.fullFlowLoading.classList.add('hidden');
  }

  private openFullFlowPage(): void {
    this.landing.classList.add('hidden');
    this.statusPanel.classList.remove('hidden');
    this.statusPanel.classList.add('camera-active', 'full-flow-active');
    this.hudActions.classList.add('hidden');
    this.gestureSurface.classList.add('hidden');
    this.cameraPanel.classList.remove('hidden');
    this.cameraPanel.classList.add('fullscreen');
    this.fullFlowLoading.classList.add('hidden');
    this.updateCameraStatus('Capture an image to build and place a 3D object.', false);
    this.handlers.onStartCamera();
  }

  private handleCaptureClick(): void {
    if (this.activeRoute === 'full-flow') {
      this.handlers.onFullFlowCapture();
      return;
    }

    this.handlers.onCaptureImage();
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
