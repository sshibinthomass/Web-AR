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
  onUploadImage(file: File): void;
  onUploadModel(file: File): void;
  onSubmitTarget(targetObject: string): void;
  onGenerateModel(targetObject: string): void;
  onFullFlowCapture(targetObject: string): void;
  onStoreUploadedModel(): void;
  onRenameGeneratedModel(modelId: string, label: string): void;
  onDeleteGeneratedModel(modelId: string): void;
  onDeleteUploadedModel(modelId: string): void;
  onPreviewModel(modelId: string): void;
  onCloseModelPreview(): void;
  onUpdateModelThumbnail(modelId: string, file: File): void;
  onReturnHome(): void;
}

type HudRoute = 'home' | 'camera' | 'upload' | 'upload-model' | 'ar' | 'full-flow' | 'models';

export class ARHud {
  readonly overlay: HTMLElement;
  readonly gestureSurface: HTMLElement;
  readonly arButtonSlot: HTMLElement;
  readonly cameraPreviewVideo: HTMLVideoElement;
  readonly cameraPreviewImage: HTMLImageElement;
  readonly modelPreviewViewport: HTMLElement;

  private readonly landing: HTMLElement;
  private readonly statusPanel: HTMLElement;
  private readonly hudActions: HTMLElement;
  private readonly statusMessage: HTMLElement;
  private readonly sourceMessage: HTMLElement;
  private readonly cameraPanel: HTMLElement;
  private readonly fullFlowLoading: HTMLElement;
  private readonly modelManager: HTMLElement;
  private readonly modelList: HTMLElement;
  private readonly modelPreview: HTMLElement;
  private readonly modelPreviewTitle: HTMLElement;
  private readonly modelPreviewStatus: HTMLElement;
  private readonly modelManagerMessage: HTMLElement;
  private readonly cameraStatusMessage: HTMLElement;
  private readonly generatedModelMessage: HTMLElement;
  private readonly cameraLabel: HTMLElement;
  private readonly uploadImageField: HTMLElement;
  private readonly uploadImageInput: HTMLInputElement;
  private readonly uploadModelField: HTMLElement;
  private readonly uploadModelInput: HTMLInputElement;
  private readonly targetObjectLabel: HTMLElement;
  private readonly targetObjectInput: HTMLInputElement;
  private readonly modelSelect: HTMLSelectElement;
  private readonly backButton: HTMLButtonElement;
  private readonly placeButton: HTMLButtonElement;
  private readonly editButton: HTMLButtonElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly resetScaleButton: HTMLButtonElement;
  private readonly captureButton: HTMLButtonElement;
  private readonly submitButton: HTMLButtonElement;
  private readonly generateButton: HTMLButtonElement;
  private readonly storeModelButton: HTMLButtonElement;
  private readonly cameraActions: HTMLElement;
  private readonly baseModelOptions: ModelOption[];
  private generatedModelOptions: ModelOption[] = [];
  private uploadedModelOptions: ModelOption[] = [];
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
      this.createButton('Upload Image', '', () => this.navigateTo('upload')),
      this.createButton('Upload Model', '', () => this.navigateTo('upload-model')),
      this.createButton('AR View', '', () => this.navigateTo('ar')),
      this.createButton('Full Flow', '', () => this.navigateTo('full-flow')),
      this.createButton('Models', '', () => this.navigateTo('models')),
    );
    this.landing.querySelector('.landing-inner')?.appendChild(modePicker);
    shell.appendChild(this.landing);

    this.modelManager = document.createElement('section');
    this.modelManager.className = 'model-manager hidden';
    const modelManagerInner = document.createElement('div');
    modelManagerInner.className = 'model-manager-inner';
    const modelManagerBackButton = this.createButton('Back', 'page-back', () => this.navigateTo('home'));
    const modelManagerHeader = document.createElement('div');
    modelManagerHeader.className = 'model-manager-header';
    const modelManagerTitle = document.createElement('h2');
    modelManagerTitle.textContent = 'Models';
    const modelManagerDescription = document.createElement('p');
    modelManagerDescription.textContent = 'Manage generated models and uploaded GLBs from the dropdown.';
    modelManagerHeader.append(modelManagerTitle, modelManagerDescription);
    this.modelList = document.createElement('div');
    this.modelList.className = 'model-manager-list';
    this.modelManagerMessage = document.createElement('p');
    this.modelManagerMessage.className = 'model-manager-message';
    this.modelManagerMessage.textContent = 'Generated models are saved in Cloudflare storage.';
    modelManagerInner.append(modelManagerBackButton, modelManagerHeader, this.modelList, this.modelManagerMessage);
    this.modelManager.appendChild(modelManagerInner);
    this.modelPreview = document.createElement('section');
    this.modelPreview.className = 'model-preview hidden';
    this.modelPreview.innerHTML = `
      <div class="model-preview-panel">
        <div class="model-preview-bar">
          <div class="model-preview-heading">
            <span class="model-preview-kicker">3D preview</span>
            <h3 class="model-preview-title"></h3>
          </div>
          <button class="model-preview-close" type="button">Close</button>
        </div>
        <div class="model-preview-viewport"></div>
        <p class="model-preview-status">Loading preview...</p>
      </div>
    `;
    this.modelPreviewViewport = this.modelPreview.querySelector<HTMLElement>('.model-preview-viewport')!;
    this.modelPreviewTitle = this.modelPreview.querySelector<HTMLElement>('.model-preview-title')!;
    this.modelPreviewStatus = this.modelPreview.querySelector<HTMLElement>('.model-preview-status')!;
    this.modelPreview.querySelector<HTMLButtonElement>('.model-preview-close')?.addEventListener('click', () => {
      this.handlers.onCloseModelPreview();
    });
    this.modelManager.appendChild(this.modelPreview);
    shell.appendChild(this.modelManager);

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
      <img class="camera-preview hidden" alt="Captured image preview">
      <label class="upload-image-field hidden">
        <span>Image file</span>
        <input name="uploadImage" type="file" accept="image/*">
      </label>
      <label class="upload-model-field upload-image-field hidden">
        <span>GLB model file</span>
        <input name="uploadModel" type="file" accept=".glb,model/gltf-binary">
      </label>
      <label class="target-object-field hidden">
        <span>Object to extract</span>
        <input name="targetObject" type="text" autocomplete="off" placeholder="Optional, e.g. laptop">
      </label>
      <p class="camera-status">Start the camera, capture an image, then generate a 3D model.</p>
      <p class="generated-model-status">Generated model: None yet</p>
    `;
    this.cameraPreviewVideo = cameraPanel.querySelector<HTMLVideoElement>('.camera-preview')!;
    this.cameraPreviewImage = cameraPanel.querySelector<HTMLImageElement>('img.camera-preview')!;
    this.cameraPanel = cameraPanel;
    this.cameraLabel = cameraPanel.querySelector<HTMLElement>('.camera-label')!;
    this.cameraStatusMessage = cameraPanel.querySelector<HTMLElement>('.camera-status')!;
    this.generatedModelMessage = cameraPanel.querySelector<HTMLElement>('.generated-model-status')!;
    this.uploadImageField = cameraPanel.querySelector<HTMLElement>('.upload-image-field')!;
    this.uploadImageInput = cameraPanel.querySelector<HTMLInputElement>('input[name="uploadImage"]')!;
    this.uploadModelField = cameraPanel.querySelector<HTMLElement>('.upload-model-field')!;
    this.uploadModelInput = cameraPanel.querySelector<HTMLInputElement>('input[name="uploadModel"]')!;
    this.targetObjectLabel = cameraPanel.querySelector<HTMLElement>('.target-object-field')!;
    this.targetObjectInput = cameraPanel.querySelector<HTMLInputElement>('input[name="targetObject"]')!;
    this.uploadImageInput.addEventListener('change', () => {
      const file = this.uploadImageInput.files?.[0];
      if (file) {
        this.handlers.onUploadImage(file);
      }
    });
    this.uploadModelInput.addEventListener('change', () => {
      const file = this.uploadModelInput.files?.[0];
      if (file) {
        this.handlers.onUploadModel(file);
      }
    });

    const cameraActions = document.createElement('div');
    cameraActions.className = 'camera-actions';
    this.cameraActions = cameraActions;
    this.captureButton = this.createButton('Capture', '', () => this.handleCaptureClick());
    this.submitButton = this.createButton('Submit', '', () => this.handleSubmitClick());
    this.submitButton.classList.add('hidden');
    this.submitButton.disabled = true;
    this.generateButton = this.createButton('Generate 3D', 'primary', () => this.handleGenerateClick());
    this.generateButton.disabled = true;
    this.storeModelButton = this.createButton('Store Model', 'primary', this.handlers.onStoreUploadedModel);
    this.storeModelButton.classList.add('hidden');
    this.storeModelButton.disabled = true;
    cameraActions.append(this.captureButton, this.submitButton, this.generateButton, this.storeModelButton);
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
    if (!this.submitButton.classList.contains('hidden')) {
      this.submitButton.disabled = !canGenerate;
    }
  }

  showLiveCameraPreview(): void {
    this.cameraLabel.textContent = 'Camera';
    this.uploadImageField.classList.add('hidden');
    this.uploadImageInput.value = '';
    this.uploadModelField.classList.add('hidden');
    this.uploadModelInput.value = '';
    this.cameraActions.classList.remove('hidden');
    this.generatedModelMessage.classList.remove('hidden');
    this.cameraPreviewImage.classList.add('hidden');
    this.cameraPreviewImage.removeAttribute('src');
    this.cameraPreviewVideo.classList.remove('hidden');
    this.targetObjectInput.value = '';
    this.targetObjectInput.classList.add('hidden');
    this.targetObjectLabel.classList.add('hidden');
    this.captureButton.classList.remove('hidden');
    this.captureButton.disabled = false;
    this.submitButton.classList.add('hidden');
    this.submitButton.disabled = true;
    this.generateButton.classList.remove('hidden');
    this.generateButton.textContent = this.generationButtonLabel();
    this.generateButton.disabled = true;
    this.storeModelButton.classList.add('hidden');
    this.storeModelButton.disabled = true;
  }

  showUploadImagePicker(): void {
    this.cameraLabel.textContent = 'Upload Image';
    this.cameraPreviewVideo.classList.add('hidden');
    this.cameraPreviewImage.classList.add('hidden');
    this.cameraPreviewImage.removeAttribute('src');
    this.uploadImageField.classList.remove('hidden');
    this.uploadImageInput.value = '';
    this.uploadModelField.classList.add('hidden');
    this.uploadModelInput.value = '';
    this.cameraActions.classList.remove('hidden');
    this.generatedModelMessage.classList.remove('hidden');
    this.targetObjectInput.value = '';
    this.targetObjectInput.classList.add('hidden');
    this.targetObjectLabel.classList.add('hidden');
    this.captureButton.classList.add('hidden');
    this.captureButton.disabled = true;
    this.submitButton.classList.add('hidden');
    this.submitButton.disabled = true;
    this.generateButton.classList.remove('hidden');
    this.generateButton.textContent = this.generationButtonLabel();
    this.generateButton.disabled = true;
    this.storeModelButton.classList.add('hidden');
    this.storeModelButton.disabled = true;
    this.updateCameraStatus('Upload an image to create a 3D model.', false);
  }

  showUploadModelPicker(): void {
    this.cameraLabel.textContent = 'Upload Model';
    this.cameraPreviewVideo.classList.add('hidden');
    this.cameraPreviewImage.classList.add('hidden');
    this.cameraPreviewImage.removeAttribute('src');
    this.uploadImageField.classList.add('hidden');
    this.uploadImageInput.value = '';
    this.uploadModelField.classList.remove('hidden');
    this.uploadModelInput.value = '';
    this.targetObjectInput.value = '';
    this.targetObjectInput.classList.add('hidden');
    this.targetObjectLabel.classList.add('hidden');
    this.cameraActions.classList.remove('hidden');
    this.captureButton.classList.add('hidden');
    this.captureButton.disabled = true;
    this.submitButton.classList.add('hidden');
    this.submitButton.disabled = true;
    this.generateButton.classList.add('hidden');
    this.generateButton.disabled = true;
    this.storeModelButton.classList.remove('hidden');
    this.storeModelButton.disabled = true;
    this.generatedModelMessage.classList.add('hidden');
    this.updateUploadModelStatus('Choose a .glb model, then store it for AR View and Models.', false);
  }

  showCapturedImagePreview(imageUrl: string): void {
    this.uploadImageField.classList.add('hidden');
    this.uploadModelField.classList.add('hidden');
    this.cameraActions.classList.remove('hidden');
    this.generatedModelMessage.classList.remove('hidden');
    this.cameraPreviewVideo.classList.add('hidden');
    this.cameraPreviewImage.src = imageUrl;
    this.cameraPreviewImage.classList.remove('hidden');
    this.targetObjectInput.classList.remove('hidden');
    this.targetObjectLabel.classList.remove('hidden');
    this.captureButton.classList.add('hidden');
    this.captureButton.disabled = true;
    this.submitButton.classList.remove('hidden');
    this.generateButton.classList.remove('hidden');
    this.generateButton.textContent = this.generationButtonLabel();
    this.storeModelButton.classList.add('hidden');
    this.storeModelButton.disabled = true;
    this.updateCameraStatus('Image captured. Submit to GPT or generate a 3D model directly.', true);
  }

  showUploadedImagePreview(imageUrl: string): void {
    this.uploadImageField.classList.add('hidden');
    this.uploadModelField.classList.add('hidden');
    this.cameraActions.classList.remove('hidden');
    this.generatedModelMessage.classList.remove('hidden');
    this.cameraPreviewVideo.classList.add('hidden');
    this.cameraPreviewImage.src = imageUrl;
    this.cameraPreviewImage.classList.remove('hidden');
    this.targetObjectInput.classList.remove('hidden');
    this.targetObjectLabel.classList.remove('hidden');
    this.captureButton.classList.add('hidden');
    this.captureButton.disabled = true;
    this.submitButton.classList.remove('hidden');
    this.generateButton.classList.remove('hidden');
    this.generateButton.textContent = this.generationButtonLabel();
    this.storeModelButton.classList.add('hidden');
    this.storeModelButton.disabled = true;
    this.updateCameraStatus('Image uploaded. Submit to GPT or generate a 3D model directly.', true);
  }

  showExtractedImageReady(imageUrl: string): void {
    this.uploadImageField.classList.add('hidden');
    this.uploadModelField.classList.add('hidden');
    this.cameraActions.classList.remove('hidden');
    this.generatedModelMessage.classList.remove('hidden');
    this.cameraPreviewVideo.classList.add('hidden');
    this.cameraPreviewImage.src = imageUrl;
    this.cameraPreviewImage.classList.remove('hidden');
    this.targetObjectInput.classList.add('hidden');
    this.targetObjectLabel.classList.add('hidden');
    this.captureButton.classList.add('hidden');
    this.captureButton.disabled = true;
    this.submitButton.classList.add('hidden');
    this.submitButton.disabled = true;
    this.generateButton.classList.remove('hidden');
    this.generateButton.textContent = this.generationButtonLabel();
    this.storeModelButton.classList.add('hidden');
    this.storeModelButton.disabled = true;
    this.updateCameraStatus('GPT extraction complete. Generate the 3D model when ready.', true);
  }

  updateGeneratedModelSource(modelUrl: string): void {
    this.generatedModelMessage.textContent = `Generated model: ${modelUrl}`;
  }

  updateGeneratedModels(generatedModels: ModelOption[]): void {
    this.generatedModelOptions = [...generatedModels];
    this.renderModelSelect();
    this.renderModelManagerList();
  }

  updateUploadedModels(uploadedModels: ModelOption[]): void {
    this.uploadedModelOptions = [...uploadedModels];
    this.renderModelSelect();
    this.renderModelManagerList();
  }

  updateModelManagerStatus(message: string): void {
    this.modelManagerMessage.textContent = message;
  }

  updateUploadModelStatus(message: string, canStore = false): void {
    this.cameraStatusMessage.textContent = message;
    this.storeModelButton.disabled = !canStore;
  }

  updateUploadedModelStatus(message: string): void {
    this.updateUploadModelStatus(message, false);
  }

  showModelPreviewLoading(modelLabel: string): void {
    this.modelPreviewTitle.textContent = modelLabel;
    this.modelPreviewStatus.textContent = 'Loading preview...';
    this.modelPreviewViewport.replaceChildren();
    this.modelPreview.classList.remove('hidden');
  }

  showModelPreviewReady(): void {
    this.modelPreviewStatus.textContent = 'Preview ready.';
  }

  showModelPreviewError(message: string): void {
    this.modelPreviewStatus.textContent = message;
    this.modelPreview.classList.remove('hidden');
  }

  hideModelPreview(): void {
    this.modelPreview.classList.add('hidden');
    this.modelPreviewTitle.textContent = '';
    this.modelPreviewStatus.textContent = 'Loading preview...';
    this.modelPreviewViewport.replaceChildren();
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
    this.navigateTo('ar');
    this.statusMessage.textContent = message;
    this.startAttachedARCamera();
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
      case '#/upload':
        return 'upload';
      case '#/upload-model':
        return 'upload-model';
      case '#/ar':
        return 'ar';
      case '#/full-flow':
        return 'full-flow';
      case '#/models':
        return 'models';
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

    if (route === 'upload') {
      this.openUploadPage();
      return;
    }

    if (route === 'upload-model') {
      this.openUploadModelPage();
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

    if (route === 'models') {
      this.openModelManagerPage();
      return;
    }

    this.openHomePage(previousRoute);
  }

  private openHomePage(previousRoute: HudRoute | null): void {
    this.closeModelPreviewIfOpen();
    this.landing.classList.remove('hidden');
    this.modelManager.classList.add('hidden');
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
    this.closeModelPreviewIfOpen();
    this.landing.classList.add('hidden');
    this.modelManager.classList.add('hidden');
    this.statusPanel.classList.remove('hidden');
    this.statusPanel.classList.add('camera-active');
    this.statusPanel.classList.remove('full-flow-active');
    this.hudActions.classList.add('hidden');
    this.gestureSurface.classList.add('hidden');
    this.cameraPanel.classList.remove('hidden');
    this.cameraPanel.classList.add('fullscreen');
    this.fullFlowLoading.classList.add('hidden');
    this.showLiveCameraPreview();
    this.handlers.onStartCamera();
  }

  private openARPage(): void {
    this.closeModelPreviewIfOpen();
    this.landing.classList.add('hidden');
    this.modelManager.classList.add('hidden');
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
    this.closeModelPreviewIfOpen();
    this.landing.classList.add('hidden');
    this.modelManager.classList.add('hidden');
    this.statusPanel.classList.remove('hidden');
    this.statusPanel.classList.add('camera-active', 'full-flow-active');
    this.hudActions.classList.add('hidden');
    this.gestureSurface.classList.add('hidden');
    this.cameraPanel.classList.remove('hidden');
    this.cameraPanel.classList.add('fullscreen');
    this.fullFlowLoading.classList.add('hidden');
    this.showLiveCameraPreview();
    this.updateCameraStatus('Capture an image to build and place a 3D object.', false);
    this.handlers.onStartCamera();
  }

  private openUploadPage(): void {
    this.closeModelPreviewIfOpen();
    this.landing.classList.add('hidden');
    this.modelManager.classList.add('hidden');
    this.statusPanel.classList.remove('hidden');
    this.statusPanel.classList.add('camera-active');
    this.statusPanel.classList.remove('full-flow-active');
    this.hudActions.classList.add('hidden');
    this.gestureSurface.classList.add('hidden');
    this.cameraPanel.classList.remove('hidden');
    this.cameraPanel.classList.add('fullscreen');
    this.fullFlowLoading.classList.add('hidden');
    this.showUploadImagePicker();
  }

  private openUploadModelPage(): void {
    this.closeModelPreviewIfOpen();
    this.landing.classList.add('hidden');
    this.modelManager.classList.add('hidden');
    this.statusPanel.classList.remove('hidden');
    this.statusPanel.classList.add('camera-active');
    this.statusPanel.classList.remove('full-flow-active');
    this.hudActions.classList.add('hidden');
    this.gestureSurface.classList.add('hidden');
    this.cameraPanel.classList.remove('hidden');
    this.cameraPanel.classList.add('fullscreen');
    this.fullFlowLoading.classList.add('hidden');
    this.showUploadModelPicker();
  }

  private openModelManagerPage(): void {
    this.landing.classList.add('hidden');
    this.modelManager.classList.remove('hidden');
    this.statusPanel.classList.add('hidden');
    this.statusPanel.classList.remove('camera-active');
    this.statusPanel.classList.remove('full-flow-active');
    this.hudActions.classList.add('hidden');
    this.gestureSurface.classList.add('hidden');
    this.cameraPanel.classList.add('hidden');
    this.cameraPanel.classList.remove('fullscreen');
    this.fullFlowLoading.classList.add('hidden');
    this.renderModelManagerList();
  }

  private handleCaptureClick(): void {
    this.handlers.onCaptureImage();
  }

  private handleSubmitClick(): void {
    this.handlers.onSubmitTarget(this.targetObjectInput.value.trim());
  }

  private handleGenerateClick(): void {
    const targetObject = this.targetObjectInput.value.trim();
    if (this.activeRoute === 'full-flow') {
      this.handlers.onFullFlowCapture(targetObject);
      return;
    }

    this.handlers.onGenerateModel(targetObject);
  }

  private renderModelSelect(): void {
    const selectedModelId = this.modelSelect.value;
    this.modelSelect.replaceChildren(new Option('Select model', '', true, !selectedModelId));
    this.allModelOptions().forEach((model) => {
      this.modelSelect.append(new Option(model.label, model.id));
    });
    if ([...this.modelSelect.options].some((option) => option.value === selectedModelId)) {
      this.modelSelect.value = selectedModelId;
    } else {
      this.modelSelect.value = '';
    }
  }

  private allModelOptions(): ModelOption[] {
    return [...this.baseModelOptions, ...this.generatedModelOptions, ...this.uploadedModelOptions];
  }


  private renderModelManagerList(): void {
    this.modelList.replaceChildren();
    this.allModelOptions().forEach((model) => {
      const modelKind = this.modelKind(model);
      const isGenerated = modelKind === 'generated';
      const isUploaded = modelKind === 'uploaded';
      const canUpdateThumbnail = model.id.startsWith('generated-');
      const row = document.createElement('article');
      row.className = `model-manager-row has-preview${isGenerated ? ' is-generated' : ''}${isUploaded ? ' is-uploaded' : ''}`;
      row.dataset.modelId = model.id;
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `Preview ${model.label}`);
      row.addEventListener('click', (event) => {
        if (this.isModelManagerControl(event.target)) {
          return;
        }
        this.handlers.onPreviewModel(model.id);
      });
      row.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }
        if (this.isModelManagerControl(event.target)) {
          return;
        }
        event.preventDefault();
        this.handlers.onPreviewModel(model.id);
      });

      row.appendChild(this.createModelThumbnail(model));

      const details = document.createElement('div');
      details.className = 'model-manager-details';
      const badge = document.createElement('span');
      badge.className = 'model-manager-badge';
      badge.textContent = this.modelBadgeText(modelKind);
      details.appendChild(badge);

      if (isGenerated) {
        const input = document.createElement('input');
        input.name = 'modelLabel';
        input.type = 'text';
        input.autocomplete = 'off';
        input.value = model.label;
        input.setAttribute('aria-label', `Name for ${model.label}`);
        details.appendChild(input);
      } else {
        const label = document.createElement('p');
        label.className = 'model-manager-name';
        label.textContent = model.label;
        details.appendChild(label);
      }

      row.appendChild(details);

      const actions = document.createElement('div');
      actions.className = 'model-manager-actions';
      actions.append(this.createButton('Preview', '', () => this.handlers.onPreviewModel(model.id)));
      if (canUpdateThumbnail) {
        const thumbnailInput = document.createElement('input');
        thumbnailInput.type = 'file';
        thumbnailInput.accept = 'image/*';
        thumbnailInput.className = 'model-manager-thumbnail-input hidden';
        thumbnailInput.setAttribute('aria-label', `Thumbnail for ${model.label}`);
        thumbnailInput.addEventListener('change', () => this.handleModelThumbnailChange(model.id, thumbnailInput));
        actions.append(
          thumbnailInput,
          this.createButton('Thumbnail', '', () => {
            thumbnailInput.click();
          }),
        );
      }
      if (isGenerated) {
        const renameButton = this.createButton('Rename', '', () => {
          const input = row.querySelector<HTMLInputElement>('input[name="modelLabel"]');
          this.handleModelRename(model.id, input?.value ?? '');
        });
        actions.append(renameButton);
      }
      if (isGenerated || isUploaded) {
        const deleteButton = this.createButton('Delete', 'danger', () => {
          if (isUploaded && model.id.startsWith('uploaded-')) {
            this.handlers.onDeleteUploadedModel(model.id);
            return;
          }
          this.handlers.onDeleteGeneratedModel(model.id);
        });
        actions.append(deleteButton);
      }
      row.appendChild(actions);

      this.modelList.appendChild(row);
    });
  }

  private createModelThumbnail(model: ModelOption): HTMLElement {
    const thumbnail = document.createElement('div');
    thumbnail.className = 'model-manager-thumbnail';

    if (model.previewUrl) {
      const image = document.createElement('img');
      image.src = model.previewUrl;
      image.alt = `${model.label} camera preview`;
      image.loading = 'lazy';
      thumbnail.appendChild(image);
      return thumbnail;
    }

    const placeholder = document.createElement('span');
    placeholder.textContent = this.modelKind(model) === 'uploaded' ? 'GLB' : 'No image';
    thumbnail.appendChild(placeholder);
    return thumbnail;
  }

  private modelKind(model: ModelOption): 'built-in' | 'generated' | 'uploaded' {
    if (model.source === 'uploaded') {
      return 'uploaded';
    }
    if (model.id.startsWith('generated-')) {
      return 'generated';
    }
    if (model.id.startsWith('uploaded-')) {
      return 'uploaded';
    }
    return 'built-in';
  }

  private modelBadgeText(modelKind: 'built-in' | 'generated' | 'uploaded'): string {
    switch (modelKind) {
      case 'generated':
        return 'Generated';
      case 'uploaded':
        return 'Uploaded';
      case 'built-in':
        return 'Built-in';
    }
  }

  private handleModelRename(modelId: string, label: string): void {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      this.updateModelManagerStatus('Enter a model name before renaming.');
      return;
    }

    this.handlers.onRenameGeneratedModel(modelId, trimmedLabel);
  }

  private handleModelThumbnailChange(modelId: string, input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.updateModelManagerStatus('Choose an image file for the thumbnail.');
      return;
    }

    this.handlers.onUpdateModelThumbnail(modelId, file);
  }

  private closeModelPreviewIfOpen(): void {
    if (!this.modelPreview.classList.contains('hidden')) {
      this.handlers.onCloseModelPreview();
    }
  }


  private isModelManagerControl(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && Boolean(target.closest('button, input, select, textarea, a, label'));
  }

  private generationButtonLabel(): string {
    return this.activeRoute === 'full-flow' ? 'Generate and Place' : 'Generate 3D';
  }

  private startAttachedARCamera(): void {
    const arControl = this.arButtonSlot.querySelector<HTMLElement>('button, a');
    arControl?.click();
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
