import type { AppMode } from '../state/AppState';
import type { ModelOption, ModelVisibility } from '../app/models';
import type { AuthUser } from '../services/authClient';
import type { AdminJobEntry } from '../services/generatedModelClient';
import { ApplicationShell } from './ApplicationShell';
import { HashRouter } from './HashRouter';
import { modelCollectionsEqual } from './modelCollections';
import { parseRouteHash, ROUTES, routeCanOpen, type HudRoute } from './routes';

interface HUDHandlers {
  onPlace(): void;
  onEdit(): void;
  onReset(): void;
  onResetScale(): void;
  onRotate(deltaRadians: number): void;
  onModelSelect(modelId: string): void;
  onStartCamera(): void;
  onCaptureImage(): void;
  onUploadImage(file: File): void;
  onUploadModel(file: File): void;
  onSubmitTarget(targetObject: string): void;
  onGenerateModel(targetObject: string): void;
  onFullFlowCapture(targetObject: string): void;
  onDynamicFlowCapture(targetObject: string): void;
  onStoreUploadedModel(): void;
  onRenameGeneratedModel(modelId: string, label: string): void;
  onDeleteGeneratedModel(modelId: string): void;
  onToggleGeneratedModelVisibility(modelId: string, visibility: ModelVisibility): void;
  onDeleteUploadedModel(modelId: string): void;
  onPreviewModel(modelId: string): void;
  onCloseModelPreview(): void;
  onPreviewLightingChange(intensity: number): void;
  onPreviewLightDirectionChange(degrees: number): void;
  onPreviewAnimationSelect(animationIndex: number): void;
  onUpdateModelThumbnail(modelId: string, file: File): void;
  onRouteExit(previousRoute: HudRoute, nextRoute: HudRoute): void;
  onLogin(email: string, password: string): void;
  onSignup(email: string, password: string, name: string): void;
  onLogout(): void;
  onApproveAccount(email: string): void;
  onRemoveAccount(email: string): void;
  onRefreshAdminAccounts(): void;
  onRefreshAdminJobs(): void;
  onRetryAdminJob(jobId: string): void;
  onCleanupFailedJobArtifacts(): void;
  onStartSpeechRecording(): void;
  onStopSpeechRecording(): void;
  onGenerateSpeechModel(): void;
  onGenerateTextModel(text: string): void;
  onAnimationSelect(animationIndex: number): void;
  onStartMultiObject(): void;
  onAddLayoutObject(): void;
  onDeleteLayoutObject(): void;
}

interface AnimationOption {
  index: number;
  label: string;
}

type ModelLibraryFilter = 'all' | 'generated' | 'uploaded' | 'favorites' | 'recent';
type AuthFormMode = 'login' | 'signup';
type ModelActionIcon =
  | 'preview'
  | 'download'
  | 'favorite'
  | 'favorite-filled'
  | 'visibility-public'
  | 'visibility-private'
  | 'edit'
  | 'delete';
type SpeechProcessStage =
  | 'speech_input'
  | 'detecting_speech'
  | 'generating_image'
  | 'generating_3d'
  | 'completed'
  | 'failed';

const speechStageOrder: SpeechProcessStage[] = [
  'speech_input',
  'detecting_speech',
  'generating_image',
  'generating_3d',
];

export interface ARHudOptions {
  authRestoring?: boolean;
}

export class ARHud {
  readonly overlay: HTMLElement;
  readonly gestureSurface: HTMLElement;
  readonly arButtonSlot: HTMLElement;
  readonly cameraPreviewVideo: HTMLVideoElement;
  readonly cameraPreviewImage: HTMLImageElement;
  readonly modelPreviewViewport: HTMLElement;

  private readonly landing: HTMLElement;
  private readonly authActions: HTMLElement;
  private readonly authIdentity: HTMLElement;
  private readonly loginButton: HTMLButtonElement;
  private readonly logoutButton: HTMLButtonElement;
  private readonly adminButton: HTMLButtonElement;
  private readonly authPanel: HTMLElement;
  private readonly authMessage: HTMLElement;
  private readonly authEmailInput: HTMLInputElement;
  private readonly authPasswordInput: HTMLInputElement;
  private readonly authNameLabel: HTMLLabelElement;
  private readonly authNameInput: HTMLInputElement;
  private readonly authSignInButton: HTMLButtonElement;
  private readonly authSignupButton: HTMLButtonElement;
  private readonly adminDashboard: HTMLElement;
  private readonly adminAccountList: HTMLElement;
  private readonly adminJobList: HTMLElement;
  private readonly adminDashboardMessage: HTMLElement;
  private readonly adminJobMessage: HTMLElement;
  private readonly speechPanel: HTMLElement;
  private readonly speechStatusMessage: HTMLElement;
  private readonly speechVisualizer: HTMLElement;
  private readonly speechTranscriptMessage: HTMLElement;
  private readonly speechBackgroundNote: HTMLElement;
  private readonly speechTextInput: HTMLTextAreaElement;
  private readonly speechTextGenerateButton: HTMLButtonElement;
  private readonly speechRecordButton: HTMLButtonElement;
  private readonly speechStopButton: HTMLButtonElement;
  private readonly speechGenerateButton: HTMLButtonElement;
  private readonly speechStageItems = new Map<SpeechProcessStage, HTMLElement>();
  private readonly statusPanel: HTMLElement;
  private readonly hudActions: HTMLElement;
  private readonly statusMessage: HTMLElement;
  private readonly sourceMessage: HTMLElement;
  private readonly cameraPanel: HTMLElement;
  private readonly fullFlowLoading: HTMLElement;
  private readonly modelManager: HTMLElement;
  private readonly layoutManager: HTMLElement;
  private readonly layoutManagerMessage: HTMLElement;
  private readonly modelSearchInput: HTMLInputElement;
  private readonly modelFilterSelect: HTMLSelectElement;
  private readonly modelList: HTMLElement;
  private readonly modelPreview: HTMLElement;
  private readonly modelPreviewTitle: HTMLElement;
  private readonly modelPreviewStatus: HTMLElement;
  private readonly modelPreviewAnimationControl: HTMLLabelElement;
  private readonly modelPreviewAnimationSelect: HTMLSelectElement;
  private readonly modelPreviewLightingInput: HTMLInputElement;
  private readonly modelPreviewLightingValue: HTMLOutputElement;
  private readonly modelPreviewDirectionInput: HTMLInputElement;
  private readonly modelPreviewDirectionValue: HTMLOutputElement;
  private readonly modelRail: HTMLElement;
  private readonly arModelPicker: HTMLElement;
  private readonly arModelSearchInput: HTMLInputElement;
  private readonly arModelFilterSelect: HTMLSelectElement;
  private readonly arModelList: HTMLElement;
  private readonly arPlaceButton: HTMLButtonElement;
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
  private readonly resetButton: HTMLButtonElement;
  private readonly resetScaleButton: HTMLButtonElement;
  private readonly animationControl: HTMLLabelElement;
  private readonly animationSelect: HTMLSelectElement;
  private readonly rotateControl: HTMLLabelElement;
  private rotateInput!: HTMLInputElement;
  private readonly addLayoutObjectButton: HTMLButtonElement;
  private readonly deleteLayoutObjectButton: HTMLButtonElement;
  private readonly captureButton: HTMLButtonElement;
  private readonly submitButton: HTMLButtonElement;
  private readonly generateButton: HTMLButtonElement;
  private readonly storeModelButton: HTMLButtonElement;
  private readonly cameraActions: HTMLElement;
  private readonly baseModelOptions: ModelOption[];
  private generatedModelOptions: ModelOption[] = [];
  private uploadedModelOptions: ModelOption[] = [];
  private fullFlowModelOption: ModelOption | null = null;
  private modelSearchQuery = '';
  private modelFilter: ModelLibraryFilter = 'all';
  private favoriteModelIds = new Set<string>();
  private downloadedModelIds = new Set<string>();
  private downloadingModelIds = new Set<string>();
  private recentModelIds: string[] = [];
  private rotationInputValue = 0;
  private arPlacementStarted = false;
  private modelReady = false;
  private activeRoute: HudRoute | null = null;
  private authFormMode: AuthFormMode = 'login';
  private currentUser: AuthUser | null = null;
  private adminAccounts: AuthUser[] = [];
  private adminJobs: AdminJobEntry[] = [];
  private modelEditDialog: HTMLElement | null = null;
  private readonly favoriteStorageKey = 'web-ar-model-favorites';
  private readonly downloadedStorageKey = 'web-ar-model-downloads';
  private readonly recentStorageKey = 'web-ar-model-recents';
  private readonly router: HashRouter;
  private readonly appShell: ApplicationShell;
  private readonly routeRestoring: HTMLElement;
  private readonly routeViews: HTMLElement[] = [];
  private authResolved: boolean;
  private pendingRoute: HudRoute | null = null;
  private pendingAuthMessage: string | null = null;

  constructor(
    root: HTMLElement,
    modelOptions: ModelOption[],
    private readonly handlers: HUDHandlers,
    options: ARHudOptions = {},
  ) {
    this.authResolved = !options.authRestoring;
    this.router = new HashRouter(window);
    this.baseModelOptions = [...modelOptions];
    this.favoriteModelIds = new Set(this.readStoredModelIds(this.favoriteStorageKey));
    this.downloadedModelIds = new Set(this.readStoredModelIds(this.downloadedStorageKey));
    this.recentModelIds = this.readStoredModelIds(this.recentStorageKey);
    this.appShell = new ApplicationShell(root, {
      onNavigate: (route) => this.navigateTo(route),
      onBack: () => this.navigateBack(),
      onLogout: this.handlers.onLogout,
    });
    const shell = this.appShell.pageHost;
    this.overlay = this.appShell.overlay;

    this.landing = document.createElement('section');
    this.landing.className = 'landing';
    this.landing.innerHTML = `
      <div class="landing-inner">
        <div class="landing-copy">
          <p class="landing-kicker">Spatial creation workspace</p>
          <h1>Make it real. Place it here.</h1>
          <p>Turn a photo, description, or existing model into something you can view in your own space.</p>
          <button class="home-primary-action primary" type="button">Create a model</button>
        </div>
        <div class="landing-preview calibration-frame" aria-hidden="true">
          <div class="preview-stage">
            <span class="preview-floor"></span>
            <span class="preview-anchor"></span>
            <span class="preview-object"></span>
          </div>
          <p><strong>Spatial preview</strong><span>Choose a model and place it at room scale.</span></p>
        </div>
        <div class="home-route-groups"></div>
      </div>
    `;
    this.landing.querySelector<HTMLButtonElement>('.home-primary-action')?.addEventListener('click', () => {
      this.appShell.openCreateMenu();
    });
    const modePicker = document.createElement('div');
    modePicker.className = 'mode-picker';
    modePicker.append(
      this.createModeGroup(
        'Explore in AR',
        'Browse saved models or begin a spatial placement session.',
        [
          this.createModeAction(this.createButton('Single-Object AR', '', () => this.navigateTo('ar')), 'AR'),
          this.createModeAction(this.createButton('Model Library', '', () => this.navigateTo('models')), '3D'),
          this.createModeAction(this.createButton('Multi-Object AR', '', () => this.navigateTo('multi-object')), '3D'),
        ],
      ),
      this.createModeGroup(
        'Create a model',
        'Use a photo, description, voice recording, or existing GLB.',
        [
          this.createModeAction(this.createButton('Camera to 3D', '', () => this.navigateTo('camera')), 'CAM'),
          this.createModeAction(this.createButton('Image to 3D', '', () => this.navigateTo('upload')), 'IMG'),
          this.createModeAction(this.createButton('Upload 3D Model', '', () => this.navigateTo('upload-model')), 'GLB'),
          this.createModeAction(this.createButton('Text or Voice to 3D', '', () => this.navigateTo('speech')), 'MIC'),
          this.createModeAction(this.createButton('Photo to AR', '', () => this.navigateTo('full-flow')), 'AI'),
          this.createModeAction(this.createButton('AI-Enhanced Photo to AR', '', () => this.navigateTo('dynamic')), 'DYN'),
        ],
      ),
    );
    this.authActions = document.createElement('div');
    this.authActions.className = 'auth-actions';
    this.authIdentity = document.createElement('p');
    this.authIdentity.className = 'auth-identity';
    this.loginButton = this.createButton('Login', '', () => this.navigateTo('login'));
    this.adminButton = this.createButton('Admin', '', () => this.navigateTo('admin'));
    this.logoutButton = this.createButton('Logout', '', this.handlers.onLogout);
    this.adminButton.classList.add('hidden');
    this.logoutButton.classList.add('hidden');
    this.authActions.append(this.authIdentity, this.loginButton, this.adminButton, this.logoutButton);
    this.landing.querySelector('.home-route-groups')?.append(modePicker, this.authActions);
    shell.appendChild(this.landing);

    this.authPanel = document.createElement('section');
    this.authPanel.className = 'auth-panel hidden';
    this.authPanel.innerHTML = `
      <div class="auth-panel-inner surface">
        <div class="auth-panel-header">
          <h2>Login</h2>
          <p class="auth-message">Sign in with an approved account, or create one for admin approval.</p>
        </div>
        <label class="field">
          <span>Email</span>
          <input name="authEmail" type="email" autocomplete="email">
        </label>
        <label class="field">
          <span>Password</span>
          <input name="authPassword" type="password" autocomplete="current-password">
        </label>
        <label class="field" hidden>
          <span>Name</span>
          <input name="authName" type="text" autocomplete="name">
        </label>
        <div class="auth-form-actions"></div>
      </div>
    `;
    this.authMessage = this.authPanel.querySelector<HTMLElement>('.auth-message')!;
    this.authEmailInput = this.authPanel.querySelector<HTMLInputElement>('input[name="authEmail"]')!;
    this.authPasswordInput = this.authPanel.querySelector<HTMLInputElement>('input[name="authPassword"]')!;
    this.authNameInput = this.authPanel.querySelector<HTMLInputElement>('input[name="authName"]')!;
    this.authNameLabel = this.authNameInput.closest('label') as HTMLLabelElement;
    this.authSignInButton = this.createButton('Sign in', 'primary', () => this.handleLoginClick());
    this.authSignupButton = this.createButton('Create account', '', () => this.handleSignupClick());
    this.authPanel.querySelector<HTMLElement>('.auth-form-actions')?.append(
      this.authSignInButton,
      this.authSignupButton,
    );
    this.setAuthFormMode('login');
    shell.appendChild(this.authPanel);

    this.adminDashboard = document.createElement('section');
    this.adminDashboard.className = 'admin-dashboard hidden';
    this.adminDashboard.innerHTML = `
      <div class="admin-dashboard-inner">
        <div class="admin-dashboard-header">
          <h2>Admin</h2>
          <p>Approve accounts and watch background generation jobs.</p>
        </div>
        <div class="admin-workspace">
          <section class="admin-dashboard-section surface" aria-labelledby="adminAccountsTitle">
            <div class="admin-dashboard-section-header">
              <h3 id="adminAccountsTitle">Accounts</h3>
              <button class="admin-refresh-accounts" type="button">Refresh accounts</button>
            </div>
            <div class="admin-account-list"></div>
            <p class="admin-dashboard-message" aria-live="polite">Accounts load from Cloudflare storage.</p>
          </section>
          <section class="admin-dashboard-section surface" aria-labelledby="adminJobsTitle">
            <div class="admin-dashboard-section-header">
              <h3 id="adminJobsTitle">Generation jobs</h3>
              <div class="admin-dashboard-actions">
                <button class="admin-refresh-jobs" type="button">Refresh jobs</button>
                <button class="admin-cleanup-jobs danger" type="button">Clean failed previews</button>
              </div>
            </div>
            <div class="admin-job-list"></div>
            <p class="admin-job-message" aria-live="polite">Jobs load from Cloudflare storage.</p>
          </section>
        </div>
      </div>
    `;
    this.adminDashboard.querySelector<HTMLButtonElement>('.admin-refresh-accounts')?.addEventListener('click', () => {
      this.handlers.onRefreshAdminAccounts();
    });
    this.adminDashboard.querySelector<HTMLButtonElement>('.admin-refresh-jobs')?.addEventListener('click', () => {
      this.handlers.onRefreshAdminJobs();
    });
    this.adminDashboard.querySelector<HTMLButtonElement>('.admin-cleanup-jobs')?.addEventListener('click', () => {
      this.adminJobMessage.textContent = 'Cleaning failed previews...';
      this.handlers.onCleanupFailedJobArtifacts();
    });
    this.adminAccountList = this.adminDashboard.querySelector<HTMLElement>('.admin-account-list')!;
    this.adminJobList = this.adminDashboard.querySelector<HTMLElement>('.admin-job-list')!;
    this.adminDashboardMessage = this.adminDashboard.querySelector<HTMLElement>('.admin-dashboard-message')!;
    this.adminJobMessage = this.adminDashboard.querySelector<HTMLElement>('.admin-job-message')!;
    shell.appendChild(this.adminDashboard);

    this.speechPanel = document.createElement('section');
    this.speechPanel.className = 'speech-panel hidden';
    this.speechPanel.innerHTML = `
      <div class="speech-panel-inner">
        <div class="speech-panel-header">
          <h2>Text or Voice to 3D</h2>
          <p class="speech-status">Type a description or push to talk, then generate a 3D-ready image and model.</p>
        </div>
        <div class="speech-workspace">
          <section class="speech-composer surface calibration-frame">
            <label class="speech-text-field">
              <span>Describe one object</span>
              <textarea
                class="speech-text-input"
                rows="6"
                aria-describedby="speechPromptHint"
                placeholder="A compact walnut desk with rounded corners"
                spellcheck="true"
              ></textarea>
            </label>
            <p id="speechPromptHint" class="field-hint">Name the object, material, color, and defining shape.</p>
            <div class="speech-actions"></div>
          </section>
          <aside class="speech-progress surface">
            <div class="speech-visualizer" aria-hidden="true">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
            <div class="speech-transcript-card">
              <span>Request</span>
              <p class="speech-transcript" aria-live="polite">No request entered yet.</p>
            </div>
            <ol class="speech-stage-list" aria-label="Text or voice to 3D progress">
              <li data-speech-stage="speech_input"><span class="speech-stage-marker"></span><strong>Input request</strong><small>Type or record the object</small></li>
              <li data-speech-stage="detecting_speech"><span class="speech-stage-marker"></span><strong>Prepare request</strong><small>Shape the description for 3D</small></li>
              <li data-speech-stage="generating_image"><span class="speech-stage-marker"></span><strong>Generate image</strong><small>Create a clean reconstruction source</small></li>
              <li data-speech-stage="generating_3d"><span class="speech-stage-marker"></span><strong>Generate model</strong><small>Build the 3D object</small></li>
            </ol>
            <p class="speech-background-note hidden">You can leave this page. The model will continue generating and appear in Models when it is ready.</p>
          </aside>
        </div>
      </div>
    `;
    this.speechStatusMessage = this.speechPanel.querySelector<HTMLElement>('.speech-status')!;
    this.speechVisualizer = this.speechPanel.querySelector<HTMLElement>('.speech-visualizer')!;
    this.speechTranscriptMessage = this.speechPanel.querySelector<HTMLElement>('.speech-transcript')!;
    this.speechTextInput = this.speechPanel.querySelector<HTMLTextAreaElement>('.speech-text-input')!;
    this.speechBackgroundNote = this.speechPanel.querySelector<HTMLElement>('.speech-background-note')!;
    this.speechPanel.querySelectorAll<HTMLElement>('[data-speech-stage]').forEach((item) => {
      const stage = item.dataset.speechStage as SpeechProcessStage | undefined;
      if (stage) {
        this.speechStageItems.set(stage, item);
      }
    });
    this.speechTextGenerateButton = this.createButton('Generate model', 'primary', () => {
      this.handlers.onGenerateTextModel(this.speechTextInput.value.trim().replace(/\s+/g, ' '));
    });
    this.speechRecordButton = this.createButton('Record description', '', () => this.handlers.onStartSpeechRecording());
    this.speechStopButton = this.createButton('Stop recording', '', () => this.handlers.onStopSpeechRecording());
    this.speechGenerateButton = this.createButton('Generate from recording', '', () => this.handlers.onGenerateSpeechModel());
    this.speechTextGenerateButton.disabled = true;
    this.speechStopButton.disabled = true;
    this.speechGenerateButton.disabled = true;
    this.speechTextInput.addEventListener('input', () => {
      this.speechTextGenerateButton.disabled = !this.speechTextInput.value.trim();
      if (this.speechTextInput.value.trim()) {
        this.speechTranscriptMessage.textContent = this.speechTextInput.value.trim();
        this.setSpeechStage('speech_input');
      }
    });
    this.speechPanel.querySelector<HTMLElement>('.speech-actions')?.append(
      this.speechTextGenerateButton,
      this.speechRecordButton,
      this.speechStopButton,
      this.speechGenerateButton,
    );
    shell.appendChild(this.speechPanel);

    this.modelManager = document.createElement('section');
    this.modelManager.className = 'model-manager hidden';
    const modelManagerInner = document.createElement('div');
    modelManagerInner.className = 'model-manager-inner';
    const modelManagerHeader = document.createElement('div');
    modelManagerHeader.className = 'model-manager-header';
    const modelManagerTitle = document.createElement('h2');
    modelManagerTitle.textContent = 'Models';
    const modelManagerDescription = document.createElement('p');
    modelManagerDescription.textContent = 'Manage generated models and uploaded GLBs from the dropdown.';
    modelManagerHeader.append(modelManagerTitle, modelManagerDescription);
    const modelManagerControls = this.createModelLibraryControls('modelSearch', 'modelFilter');
    this.modelSearchInput = modelManagerControls.searchInput;
    this.modelFilterSelect = modelManagerControls.filterSelect;
    this.modelList = document.createElement('div');
    this.modelList.className = 'model-manager-list';
    this.modelManagerMessage = document.createElement('p');
    this.modelManagerMessage.className = 'model-manager-message';
    this.modelManagerMessage.textContent = 'Generated models are saved in Cloudflare storage.';
    modelManagerInner.append(
      modelManagerHeader,
      modelManagerControls.root,
      this.modelList,
      this.modelManagerMessage,
    );
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
          <div class="model-preview-controls" aria-label="Preview lighting controls">
            <label class="model-preview-control model-preview-animation hidden">
              <span>Animation</span>
              <select class="model-preview-animation-select" name="modelPreviewAnimation" aria-label="Preview animation"></select>
            </label>
            <label class="model-preview-control model-preview-lighting">
              <span>Lighting</span>
              <input class="model-preview-lighting-input" type="range" min="50" max="180" step="5" value="100" aria-label="Preview lighting intensity">
              <output class="model-preview-lighting-value">100%</output>
            </label>
            <label class="model-preview-control model-preview-direction">
              <span>Direction</span>
              <input class="model-preview-direction-input" type="range" min="0" max="355" step="5" value="45" aria-label="Preview light direction">
              <output class="model-preview-direction-value">45 deg</output>
            </label>
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
    this.modelPreviewAnimationControl = this.modelPreview.querySelector<HTMLLabelElement>('.model-preview-animation')!;
    this.modelPreviewAnimationSelect = this.modelPreview.querySelector<HTMLSelectElement>('.model-preview-animation-select')!;
    this.modelPreviewLightingInput = this.modelPreview.querySelector<HTMLInputElement>('.model-preview-lighting-input')!;
    this.modelPreviewLightingValue = this.modelPreview.querySelector<HTMLOutputElement>('.model-preview-lighting-value')!;
    this.modelPreviewDirectionInput = this.modelPreview.querySelector<HTMLInputElement>('.model-preview-direction-input')!;
    this.modelPreviewDirectionValue = this.modelPreview.querySelector<HTMLOutputElement>('.model-preview-direction-value')!;
    this.modelPreviewAnimationSelect.addEventListener('change', () => {
      const animationIndex = Number(this.modelPreviewAnimationSelect.value);
      if (Number.isInteger(animationIndex)) {
        this.handlers.onPreviewAnimationSelect(animationIndex);
      }
    });
    this.modelPreviewLightingInput.addEventListener('input', () => this.handleModelPreviewLightingInput());
    this.modelPreviewDirectionInput.addEventListener('input', () => this.handleModelPreviewDirectionInput());
    this.modelPreview.querySelector<HTMLButtonElement>('.model-preview-close')?.addEventListener('click', () => {
      this.handlers.onCloseModelPreview();
    });
    this.modelManager.appendChild(this.modelPreview);
    shell.appendChild(this.modelManager);

    this.layoutManager = document.createElement('section');
    this.layoutManager.className = 'layout-manager hidden';
    const layoutManagerInner = document.createElement('div');
    layoutManagerInner.className = 'layout-manager-inner';
    const layoutManagerHeader = document.createElement('div');
    layoutManagerHeader.className = 'layout-manager-header';
    const layoutManagerTitle = document.createElement('h2');
    layoutManagerTitle.textContent = 'Multi Object';
    const layoutManagerDescription = document.createElement('p');
    layoutManagerDescription.textContent = 'This session starts empty each time. Place multiple objects, then exit when you are done.';
    const startSessionButton = this.createButton('Start Session', 'primary', () => this.openMultiObjectEditor());
    layoutManagerHeader.append(layoutManagerTitle, layoutManagerDescription, startSessionButton);
    this.layoutManagerMessage = document.createElement('p');
    this.layoutManagerMessage.className = 'layout-manager-message';
    this.layoutManagerMessage.textContent = 'No layout is saved or reopened.';
    layoutManagerInner.append(layoutManagerHeader, this.layoutManagerMessage);
    this.layoutManager.appendChild(layoutManagerInner);
    shell.appendChild(this.layoutManager);

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
    this.backButton = this.createButton('Back', 'page-back', () => this.navigateBack());
    this.statusPanel.prepend(this.backButton);

    this.fullFlowLoading = document.createElement('section');
    this.fullFlowLoading.className = 'full-flow-loading hidden';
    this.fullFlowLoading.innerHTML = `
      <div class="loading-ring" aria-hidden="true"></div>
      <p>Building your 3D object in Modal...</p>
    `;
    this.statusPanel.appendChild(this.fullFlowLoading);

    const modelPicker = document.createElement('label');
    modelPicker.className = 'model-picker hidden';
    modelPicker.innerHTML = '<span>Model</span>';
    this.modelSelect = document.createElement('select');
    this.modelSelect.append(new Option('Select model', '', true, true));
    modelOptions.forEach((model) => {
      this.modelSelect.append(new Option(model.label, model.id));
    });
    this.modelSelect.addEventListener('change', () => {
      if (this.modelSelect.value) {
        this.markModelRecent(this.modelSelect.value);
        this.handlers.onModelSelect(this.modelSelect.value);
      }
    });
    modelPicker.appendChild(this.modelSelect);
    this.statusPanel.appendChild(modelPicker);

    const cameraPanel = document.createElement('section');
    cameraPanel.className = 'camera-panel creation-workspace hidden';
    cameraPanel.innerHTML = `
      <div class="creation-stage calibration-frame">
        <p class="camera-label utility-label"></p>
        <video class="camera-preview" muted playsinline></video>
        <img class="camera-preview hidden" alt="Selected object preview">
        <label class="upload-image-field upload-drop-zone hidden">
          <span>Choose an image</span>
          <small id="imageUploadHint">PNG, JPG, or WebP with one clearly visible object.</small>
          <input name="uploadImage" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="imageUploadHint">
        </label>
        <label class="upload-model-field upload-drop-zone hidden">
          <span>Choose a GLB model</span>
          <small id="modelUploadHint">Use a binary .glb file ready for AR placement.</small>
          <input name="uploadModel" type="file" accept=".glb,model/gltf-binary" aria-describedby="modelUploadHint">
        </label>
      </div>
      <aside class="creation-guidance">
        <ol class="creation-step-list hidden" aria-label="Progress">
          <li data-creation-stage="capture">Capture</li>
          <li data-creation-stage="generate">Generate</li>
          <li data-creation-stage="place">Place</li>
        </ol>
        <label class="target-object-field hidden">
          <span>Object to extract <small>(optional)</small></span>
          <input name="targetObject" type="text" autocomplete="off" placeholder="For example: laptop">
        </label>
        <p class="camera-status" aria-live="polite">${ROUTES.camera.initialStatus}</p>
        <p class="generated-model-status">No model generated yet.</p>
        <div class="camera-actions sticky-primary-action"></div>
      </aside>
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

    const cameraActions = cameraPanel.querySelector<HTMLElement>('.camera-actions')!;
    this.cameraActions = cameraActions;
    this.captureButton = this.createButton('Capture', '', () => this.handleCaptureClick());
    this.submitButton = this.createButton('Extract object', '', () => this.handleSubmitClick());
    this.submitButton.classList.add('hidden');
    this.submitButton.disabled = true;
    this.generateButton = this.createButton('Generate model', 'primary', () => this.handleGenerateClick());
    this.generateButton.disabled = true;
    this.storeModelButton = this.createButton('Upload model', 'primary', this.handlers.onStoreUploadedModel);
    this.storeModelButton.classList.add('hidden');
    this.storeModelButton.disabled = true;
    cameraActions.append(this.captureButton, this.submitButton, this.generateButton, this.storeModelButton);
    this.statusPanel.appendChild(cameraPanel);
    this.overlay.appendChild(this.statusPanel);

    this.modelRail = document.createElement('nav');
    this.modelRail.className = 'model-rail hidden';
    this.modelRail.setAttribute('aria-label', 'Select model');
    this.overlay.appendChild(this.modelRail);

    this.arModelPicker = document.createElement('section');
    this.arModelPicker.className = 'ar-model-picker hidden';
    const arModelPickerInner = document.createElement('div');
    arModelPickerInner.className = 'ar-model-picker-inner';
    const arModelPickerHeading = document.createElement('header');
    arModelPickerHeading.className = 'ar-picker-heading calibration-heading';
    arModelPickerHeading.innerHTML = `
      <span class="calibration-label">Placement library</span>
      <h2>Choose a model</h2>
      <p>Select one model, then continue to AR placement.</p>
    `;
    const arModelControls = this.createModelLibraryControls('arModelSearch', 'arModelFilter');
    this.arModelSearchInput = arModelControls.searchInput;
    this.arModelFilterSelect = arModelControls.filterSelect;
    this.arModelList = document.createElement('div');
    this.arModelList.className = 'ar-model-grid';
    const arModelPlaceBar = document.createElement('div');
    arModelPlaceBar.className = 'ar-model-place-bar';
    this.arPlaceButton = this.createButton('Select a model', 'ar-model-place-button primary', () => this.openSelectedModelInAR());
    this.arPlaceButton.disabled = true;
    arModelPlaceBar.appendChild(this.arPlaceButton);
    arModelPickerInner.append(arModelPickerHeading, arModelControls.root, this.arModelList, arModelPlaceBar);
    this.arModelPicker.appendChild(arModelPickerInner);
    this.overlay.appendChild(this.arModelPicker);

    this.hudActions = document.createElement('div');
    this.hudActions.className = 'hud-actions hidden';
    this.overlay.appendChild(this.hudActions);

    this.arButtonSlot = document.createElement('div');
    this.arButtonSlot.className = 'ar-button-slot hidden';
    this.arButtonSlot.setAttribute('aria-hidden', 'true');
    this.hudActions.appendChild(this.arButtonSlot);

    const animationControl = this.createAnimationControl();
    this.animationControl = animationControl.control;
    this.animationSelect = animationControl.select;
    this.rotateControl = this.createRotateControl();
    this.placeButton = this.createHudActionButton('Place', 'Place', 'primary', this.handlers.onPlace);
    this.resetScaleButton = this.createHudActionButton('Scale 1x', '1x', '', this.handlers.onResetScale);
    this.resetButton = this.createHudActionButton('Reset', 'Reset', '', this.handlers.onReset);
    this.addLayoutObjectButton = this.createHudActionButton('Add Object', 'Add', '', this.handlers.onAddLayoutObject);
    this.deleteLayoutObjectButton = this.createHudActionButton('Delete Object', 'Delete', 'danger', this.handlers.onDeleteLayoutObject);
    this.addLayoutObjectButton.classList.add('layout-action', 'hidden');
    this.deleteLayoutObjectButton.classList.add('layout-action', 'hidden');

    this.hudActions.append(
      this.animationControl,
      this.rotateControl,
      this.placeButton,
      this.resetScaleButton,
      this.resetButton,
    );
    this.renderModelRail();
    this.renderARModelPicker();
    this.renderAuthControls();

    this.routeRestoring = document.createElement('section');
    this.routeRestoring.className = 'route-restoring hidden';
    this.routeRestoring.innerHTML = `
      <div class="loading-ring" aria-hidden="true"></div>
      <p>Restoring your session...</p>
    `;
    shell.appendChild(this.routeRestoring);
    this.routeViews.push(
      this.landing,
      this.authPanel,
      this.adminDashboard,
      this.speechPanel,
      this.modelManager,
      this.layoutManager,
    );

    this.update('loading', 'Loading model...');
    this.router.start((route) => this.applyRoute(route));
  }

  attachARButton(button: HTMLElement): void {
    this.arButtonSlot.replaceChildren(button);
    this.arButtonSlot.classList.add('hidden');
    this.arButtonSlot.setAttribute('aria-hidden', 'true');
  }

  startARCamera(): void {
    this.startAttachedARCamera();
  }

  updateAuthState(user: AuthUser | null): void {
    this.currentUser = user?.status === 'active' ? user : null;
    this.authResolved = true;
    this.routeRestoring.classList.add('hidden');
    this.appShell.setRestoring(false);
    this.renderAuthControls();

    const intendedRoute = this.pendingRoute;
    if (intendedRoute && routeCanOpen(intendedRoute, this.currentUser)) {
      this.pendingRoute = null;
      this.navigateTo(intendedRoute, 'replace');
      return;
    }

    const currentRoute = parseRouteHash(window.location.hash);
    if (!routeCanOpen(currentRoute, this.currentUser)) {
      this.pendingRoute = currentRoute;
      this.redirectToLogin(
        ROUTES[currentRoute].requiresAdmin
          ? 'Admin access is required.'
          : this.loginMessageForRoute(currentRoute),
      );
      return;
    }

    this.applyRoute(currentRoute);
  }

  navigateHome(mode: 'push' | 'replace' = 'replace'): void {
    this.pendingRoute = null;
    this.navigateTo('home', mode);
  }

  navigateToLogin(message: string): void {
    if (this.activeRoute && this.activeRoute !== 'login') {
      this.pendingRoute = this.activeRoute;
    }
    this.redirectToLogin(message);
  }

  completeLogout(): void {
    this.currentUser = null;
    this.authResolved = true;
    this.pendingRoute = null;
    this.renderAuthControls();
    this.navigateHome('replace');
  }

  showAuthMessage(message: string, isError = false): void {
    this.authMessage.textContent = message;
    this.authMessage.classList.toggle('is-error', isError);
  }

  updateAdminAccounts(users: AuthUser[]): void {
    this.adminAccounts = [...users];
    this.renderAdminAccounts();
  }

  updateAdminJobs(jobs: AdminJobEntry[]): void {
    this.adminJobs = [...jobs];
    this.renderAdminJobs();
  }

  showMultiObjectEditor(): void {
    this.closeModelPreviewIfOpen();
    this.statusPanel.classList.remove('hidden');
    this.statusPanel.classList.add('layout-active');
    this.statusPanel.classList.remove('camera-active', 'ar-picker-active', 'full-flow-active');
    this.cameraPanel.classList.add('hidden');
    this.cameraPanel.classList.remove('fullscreen');
    this.fullFlowLoading.classList.add('hidden');
    this.arModelPicker.classList.add('hidden');
    this.modelRail.classList.remove('hidden');
    this.hudActions.classList.remove('hidden');
    this.gestureSurface.classList.remove('hidden');
    this.showLayoutActionButtons(true);
    this.statusMessage.textContent = 'Place multiple objects in this session.';
  }

  showMultiObjectMessage(message: string): void {
    this.statusMessage.textContent = message;
    this.layoutManagerMessage.textContent = message;
  }

  showAdminJobMessage(message: string, isError = false): void {
    this.adminJobMessage.textContent = message;
    this.adminJobMessage.classList.toggle('is-error', isError);
  }

  update(mode: AppMode, customMessage?: string): void {
    this.statusMessage.textContent = customMessage ?? this.messageForMode(mode);

    const hasPlacedObject = mode === 'placed' || mode === 'editing';
    this.statusPanel.classList.toggle('object-placed', hasPlacedObject);
    this.placeButton.disabled = !this.modelReady || (mode !== 'scanning' && mode !== 'readyToPlace');
    this.resetScaleButton.disabled = !hasPlacedObject;
    this.rotateInput.disabled = !hasPlacedObject;
    if (!hasPlacedObject) {
      this.resetRotationInput();
    }
    this.resetButton.disabled = !hasPlacedObject;
  }

  updateModelSource(source: string): void {
    this.sourceMessage.textContent = `Model source: ${source}`;
  }

  updateModelReady(isReady: boolean): void {
    this.modelReady = isReady;
    this.updateARPlaceButton();
  }

  updateAnimationOptions(options: AnimationOption[], selectedIndex: number): void {
    this.animationSelect.replaceChildren();
    options.forEach((option) => {
      this.animationSelect.append(new Option(option.label, String(option.index)));
    });

    const hasMultipleAnimations = options.length > 1;
    this.animationControl.classList.toggle('hidden', !hasMultipleAnimations);
    this.modelRail.classList.toggle('has-animation-control', hasMultipleAnimations);
    this.animationSelect.disabled = !hasMultipleAnimations;

    if (options.some((option) => option.index === selectedIndex)) {
      this.animationSelect.value = String(selectedIndex);
    }
  }

  updateSelectedAnimation(animationIndex: number): void {
    this.animationSelect.value = String(animationIndex);
  }

  updateSelectedModel(modelId: string): void {
    this.modelSelect.value = modelId;
    this.markModelRecent(modelId);
    this.updateModelRailSelection(modelId);
    this.updateARModelPickerSelection(modelId);
    this.updateARPlaceButton();
  }

  updateCameraStatus(message: string, canGenerate: boolean): void {
    this.cameraStatusMessage.textContent = message;
    this.generateButton.disabled = !canGenerate;
    if (!this.submitButton.classList.contains('hidden')) {
      this.submitButton.disabled = !canGenerate;
    }
    this.syncCameraActionLayout();
  }

  showSpeechReady(message = 'Type a description or push to talk, then generate a 3D-ready image and model.'): void {
    this.speechStatusMessage.textContent = message;
    this.speechVisualizer.classList.remove('is-listening', 'is-working');
    this.speechBackgroundNote.classList.add('hidden');
    this.setSpeechStage(null);
    this.speechRecordButton.disabled = false;
    this.speechStopButton.disabled = true;
    this.speechGenerateButton.disabled = true;
    this.speechTranscriptMessage.textContent = 'No request entered yet.';
  }

  showSpeechRecording(): void {
    this.speechStatusMessage.textContent = 'Listening...';
    this.speechVisualizer.classList.add('is-listening');
    this.speechVisualizer.classList.remove('is-working');
    this.speechBackgroundNote.classList.add('hidden');
    this.setSpeechStage('speech_input');
    this.speechTranscriptMessage.textContent = 'Recording speech for a 3D model request.';
    this.speechRecordButton.disabled = true;
    this.speechStopButton.disabled = false;
    this.speechGenerateButton.disabled = true;
  }

  showSpeechCaptured(): void {
    this.speechStatusMessage.textContent = 'Audio captured. Generate when ready.';
    this.speechVisualizer.classList.remove('is-listening', 'is-working');
    this.speechBackgroundNote.classList.add('hidden');
    this.setSpeechStage('speech_input');
    this.speechTranscriptMessage.textContent = 'Audio captured. Speech will appear after detection.';
    this.speechRecordButton.disabled = false;
    this.speechStopButton.disabled = true;
    this.speechGenerateButton.disabled = false;
  }

  showSpeechDetected(transcript: string): void {
    this.speechStatusMessage.textContent = 'Speech detected. Generate the 3D model when ready.';
    this.speechVisualizer.classList.remove('is-listening', 'is-working');
    this.speechBackgroundNote.classList.add('hidden');
    this.setSpeechStage('detecting_speech');
    this.speechTranscriptMessage.textContent = transcript || 'Speech recorded.';
    this.speechRecordButton.disabled = false;
    this.speechStopButton.disabled = true;
    this.speechGenerateButton.disabled = !transcript;
  }

  showSpeechDetecting(requestText?: string): void {
    const normalizedRequest = requestText?.trim();
    this.speechStatusMessage.textContent = normalizedRequest
      ? 'Preparing request for 3D generation...'
      : 'Detecting speech and shaping the request for 3D generation...';
    this.speechVisualizer.classList.remove('is-listening');
    this.speechVisualizer.classList.add('is-working');
    this.speechBackgroundNote.classList.add('hidden');
    this.setSpeechStage('detecting_speech');
    if (normalizedRequest) {
      this.speechTranscriptMessage.textContent = normalizedRequest;
    }
    this.speechTextGenerateButton.disabled = true;
    this.speechRecordButton.disabled = true;
    this.speechStopButton.disabled = true;
    this.speechGenerateButton.disabled = true;
  }

  showSpeechGeneratingImage(transcript?: string): void {
    this.speechStatusMessage.textContent = 'Speech detected. Generating a clean image for 3D reconstruction...';
    this.speechVisualizer.classList.remove('is-listening');
    this.speechVisualizer.classList.add('is-working');
    this.speechBackgroundNote.classList.add('hidden');
    this.setSpeechStage('generating_image');
    if (transcript?.trim()) {
      this.speechTranscriptMessage.textContent = transcript.trim();
    }
    this.speechRecordButton.disabled = true;
    this.speechStopButton.disabled = true;
    this.speechGenerateButton.disabled = true;
  }

  showSpeechBackgroundJob(job: { label?: string; transcript?: string; stage?: SpeechProcessStage }): void {
    this.speechStatusMessage.textContent = `${job.label ?? 'Speech model'} is generating in the background.`;
    this.speechVisualizer.classList.remove('is-listening');
    this.speechVisualizer.classList.add('is-working');
    this.speechBackgroundNote.classList.remove('hidden');
    this.setSpeechStage(job.stage ?? 'generating_3d');
    if (job.transcript?.trim()) {
      this.speechTranscriptMessage.textContent = job.transcript.trim();
    }
    this.speechRecordButton.disabled = false;
    this.speechStopButton.disabled = true;
    this.speechGenerateButton.disabled = true;
  }

  showSpeechCompleted(job: { label?: string; transcript?: string }): void {
    this.speechStatusMessage.textContent = `${job.label ?? 'Speech-generated object'} is ready. Opening AR View...`;
    this.speechVisualizer.classList.remove('is-listening', 'is-working');
    this.speechBackgroundNote.classList.add('hidden');
    this.setSpeechStage('completed');
    if (job.transcript?.trim()) {
      this.speechTranscriptMessage.textContent = job.transcript.trim();
    }
    this.speechRecordButton.disabled = false;
    this.speechStopButton.disabled = true;
    this.speechGenerateButton.disabled = true;
  }

  showSpeechGenerating(message = 'Generating a 3D-ready image and model from speech. Keep this page open.'): void {
    this.speechStatusMessage.textContent = message;
    this.speechVisualizer.classList.remove('is-listening');
    this.speechVisualizer.classList.add('is-working');
    this.speechBackgroundNote.classList.add('hidden');
    this.setSpeechStage('generating_image');
    this.speechRecordButton.disabled = true;
    this.speechStopButton.disabled = true;
    this.speechGenerateButton.disabled = true;
  }

  showSpeechError(message: string): void {
    this.speechStatusMessage.textContent = message;
    this.speechVisualizer.classList.remove('is-listening', 'is-working');
    this.setSpeechStage('failed');
    this.speechRecordButton.disabled = false;
    this.speechStopButton.disabled = true;
    this.speechGenerateButton.disabled = this.speechTranscriptMessage.textContent === 'No speech recorded yet.';
  }

  showLiveCameraPreview(route: 'camera' | 'full-flow' | 'dynamic' = 'camera'): void {
    const meta = ROUTES[route];
    this.cameraLabel.textContent = meta.title;
    this.cameraStatusMessage.textContent = meta.initialStatus;
    this.cameraStatusMessage.classList.remove('is-ready', 'is-error');
    this.generatedModelMessage.textContent = 'No model generated yet.';
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
    this.setCreationStage('capture');
    this.syncCameraActionLayout();
  }

  showUploadImagePicker(): void {
    const meta = ROUTES.upload;
    this.cameraLabel.textContent = meta.title;
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
    this.generatedModelMessage.textContent = 'No model generated yet.';
    this.updateCameraStatus(meta.initialStatus, false);
    this.setCreationStage(null);
  }

  showUploadModelPicker(): void {
    const meta = ROUTES['upload-model'];
    this.cameraLabel.textContent = meta.title;
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
    this.updateUploadModelStatus(meta.initialStatus, false);
    this.setCreationStage(null);
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
    this.submitButton.classList.toggle('hidden', this.activeRoute === 'dynamic');
    this.submitButton.disabled = this.activeRoute === 'dynamic';
    this.generateButton.classList.remove('hidden');
    this.generateButton.textContent = this.generationButtonLabel();
    this.storeModelButton.classList.add('hidden');
    this.storeModelButton.disabled = true;
    this.updateCameraStatus(
      this.activeRoute === 'dynamic'
        ? 'Image captured. Generate a dynamic image, then place the 3D model.'
        : 'Image captured. Submit to GPT or generate a 3D model directly.',
      true,
    );
    this.setCreationStage('generate');
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
    this.setCreationStage('generate');
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
    this.setCreationStage('generate');
  }

  updateGeneratedModelSource(modelUrl: string): void {
    this.generatedModelMessage.textContent = `Generated model: ${modelUrl}`;
  }

  updateGeneratedModels(generatedModels: ModelOption[]): void {
    if (modelCollectionsEqual(this.generatedModelOptions, generatedModels)) {
      return;
    }
    this.generatedModelOptions = [...generatedModels];
    this.renderModelSelect();
    if (!this.modelEditDialog) {
      this.renderModelManagerList();
    }
  }

  updateUploadedModels(uploadedModels: ModelOption[]): void {
    if (modelCollectionsEqual(this.uploadedModelOptions, uploadedModels)) {
      return;
    }
    this.uploadedModelOptions = [...uploadedModels];
    this.renderModelSelect();
    if (!this.modelEditDialog) {
      this.renderModelManagerList();
    }
  }

  markModelDownloadStarted(modelId: string): void {
    this.downloadingModelIds.add(modelId);
    this.renderModelDownloadState();
  }

  markModelDownloaded(modelId: string): void {
    this.downloadingModelIds.delete(modelId);
    this.downloadedModelIds.add(modelId);
    this.writeStoredModelIds(this.downloadedStorageKey, [...this.downloadedModelIds]);
    this.renderModelDownloadState();
  }

  markModelDownloadFailed(modelId: string): void {
    this.downloadingModelIds.delete(modelId);
    this.renderModelDownloadState();
  }

  isModelDownloaded(modelId: string): boolean {
    return this.downloadedModelIds.has(modelId);
  }

  updateModelManagerStatus(message: string): void {
    this.modelManagerMessage.textContent = message;
  }

  updateUploadModelStatus(message: string, canStore = false): void {
    this.cameraStatusMessage.textContent = message;
    this.storeModelButton.disabled = !canStore;
    this.syncCameraActionLayout();
  }

  updateUploadedModelStatus(message: string): void {
    this.updateUploadModelStatus(message, false);
  }

  showModelPreviewLoading(modelLabel: string): void {
    this.modelPreviewTitle.textContent = modelLabel;
    this.modelPreviewStatus.textContent = 'Loading preview...';
    this.modelPreviewViewport.replaceChildren();
    this.updateModelPreviewAnimationOptions([], -1);
    this.updateModelPreviewLightingLabel();
    this.updateModelPreviewDirectionLabel();
    this.modelPreview.classList.remove('hidden');
  }

  showModelPreviewReady(): void {
    this.modelPreviewStatus.textContent = 'Preview ready.';
  }

  updateModelPreviewAnimationOptions(options: AnimationOption[], selectedIndex: number): void {
    this.modelPreviewAnimationSelect.replaceChildren();
    options.forEach((option) => {
      this.modelPreviewAnimationSelect.append(new Option(option.label, String(option.index)));
    });

    const hasMultipleAnimations = options.length > 1;
    this.modelPreviewAnimationControl.classList.toggle('hidden', !hasMultipleAnimations);
    this.modelPreviewAnimationSelect.disabled = !hasMultipleAnimations;

    if (options.some((option) => option.index === selectedIndex)) {
      this.modelPreviewAnimationSelect.value = String(selectedIndex);
    }
  }

  updateSelectedModelPreviewAnimation(animationIndex: number): void {
    this.modelPreviewAnimationSelect.value = String(animationIndex);
  }

  showModelPreviewError(message: string): void {
    this.modelPreviewStatus.textContent = message;
    this.modelPreview.classList.remove('hidden');
  }

  getModelPreviewLightingIntensity(): number {
    return this.parseModelPreviewLightingIntensity();
  }

  getModelPreviewLightDirectionDegrees(): number {
    return this.parseModelPreviewLightDirectionDegrees();
  }

  hideModelPreview(): void {
    this.modelPreview.classList.add('hidden');
    this.modelPreviewTitle.textContent = '';
    this.modelPreviewStatus.textContent = 'Loading preview...';
    this.modelPreviewViewport.replaceChildren();
    this.updateModelPreviewAnimationOptions([], -1);
  }

  setCameraPanelVisible(isVisible: boolean): void {
    this.cameraPanel.classList.toggle('hidden', !isVisible);
  }

  showFullFlowLoading(message: string): void {
    this.setCreationStage('generate');
    this.landing.classList.add('hidden');
    this.statusPanel.classList.remove('hidden');
    this.statusPanel.classList.add('full-flow-active');
    this.statusPanel.classList.remove('ar-picker-active');
    this.statusPanel.classList.remove('camera-active');
    this.cameraPanel.classList.add('hidden');
    this.hudActions.classList.add('hidden');
    this.modelRail.classList.add('hidden');
    this.arModelPicker.classList.add('hidden');
    this.gestureSurface.classList.add('hidden');
    this.fullFlowLoading.classList.remove('hidden');
    const messageElement = this.fullFlowLoading.querySelector('p');
    if (messageElement) {
      messageElement.textContent = message;
    }
  }

  showFullFlowReady(message: string, modelOption?: ModelOption): void {
    this.setCreationStage('place');
    this.navigateTo('ar', 'replace');
    this.arPlacementStarted = true;
    this.openARPage();
    if (modelOption) {
      this.fullFlowModelOption = modelOption;
      this.renderModelSelect();
      this.updateSelectedModel(modelOption.id);
    }
    this.statusMessage.textContent = message;
  }

  showFullFlowError(message: string): void {
    this.setCreationStage('generate');
    this.fullFlowLoading.classList.add('hidden');
    this.statusPanel.classList.add('camera-active');
    this.statusPanel.classList.remove('ar-picker-active');
    this.statusPanel.classList.remove('full-flow-active');
    this.cameraPanel.classList.remove('hidden');
    this.cameraPanel.classList.add('fullscreen');
    this.hudActions.classList.add('hidden');
    this.modelRail.classList.add('hidden');
    this.arModelPicker.classList.add('hidden');
    this.gestureSurface.classList.add('hidden');
    this.updateCameraStatus(message, false);
  }

  private navigateTo(route: HudRoute, mode: 'push' | 'replace' = 'push'): void {
    this.router.navigate(route, mode);
  }

  private navigateBack(): void {
    const route = this.activeRoute ?? parseRouteHash(window.location.hash);
    this.router.back(ROUTES[route].parent);
  }

  private redirectToLogin(message: string): void {
    this.pendingAuthMessage = message;
    if (this.activeRoute === 'login') {
      this.showAuthMessage(message, false);
      return;
    }
    this.router.navigate('login', 'replace');
  }

  private loginMessageForRoute(route: HudRoute): string {
    switch (route) {
      case 'camera':
        return 'Sign in to use Camera.';
      case 'upload':
        return 'Sign in to use Upload Image.';
      case 'upload-model':
        return 'Sign in to use Upload Model.';
      case 'full-flow':
        return 'Sign in to use Full Flow.';
      case 'dynamic':
        return 'Sign in to use Dynamic.';
      case 'speech':
        return 'Sign in to use Text or Voice to 3D.';
      default:
        return 'Sign in with an approved account.';
    }
  }

  private applyRoute(route: HudRoute): void {
    const meta = ROUTES[route];
    this.appShell.setRoute(route);
    if (!this.authResolved && meta.requiresAuth) {
      this.pendingRoute = route;
      this.showRestoringRoute();
      return;
    }

    this.appShell.setRestoring(false);
    if (!routeCanOpen(route, this.currentUser)) {
      this.pendingRoute = route;
      this.redirectToLogin(
        meta.requiresAdmin ? 'Admin access is required.' : this.loginMessageForRoute(route),
      );
      return;
    }

    if (this.activeRoute === route) {
      return;
    }

    const previousRoute = this.activeRoute;
    this.activeRoute = route;
    this.prepareRoute(route, previousRoute);

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

    if (route === 'dynamic') {
      this.openDynamicPage();
      return;
    }

    if (route === 'speech') {
      this.openSpeechPage();
      return;
    }

    if (route === 'multi-object') {
      this.openMultiObjectEditor();
      return;
    }

    if (route === 'models') {
      this.openModelManagerPage();
      return;
    }

    if (route === 'login') {
      const message = this.pendingAuthMessage
        ?? 'Sign in with an approved account, or create one for admin approval.';
      this.pendingAuthMessage = null;
      this.openAuthPage(message);
      return;
    }

    if (route === 'admin') {
      this.openAdminDashboardPage();
      return;
    }

    this.openHomePage();
  }

  private showRestoringRoute(): void {
    this.appShell.setRestoring(true);
    this.hideAllRouteViews();
    this.resetImmersiveState();
    this.routeRestoring.classList.remove('hidden');
  }

  private hideAllRouteViews(): void {
    for (const view of this.routeViews) {
      view.classList.add('hidden');
    }
    this.routeRestoring.classList.add('hidden');
    this.statusPanel.classList.add('hidden');
    this.hudActions.classList.add('hidden');
    this.modelRail.classList.add('hidden');
    this.arModelPicker.classList.add('hidden');
    this.gestureSurface.classList.add('hidden');
    this.cameraPanel.classList.add('hidden');
    this.fullFlowLoading.classList.add('hidden');
  }

  private resetImmersiveState(): void {
    this.statusPanel.classList.remove(
      'camera-active',
      'ar-picker-active',
      'full-flow-active',
      'layout-active',
      'object-placed',
    );
    this.cameraPanel.classList.remove('fullscreen');
    this.showLayoutActionButtons(false);
  }

  private prepareRoute(route: HudRoute, previousRoute: HudRoute | null): void {
    if (previousRoute && previousRoute !== 'home' && previousRoute !== route) {
      this.handlers.onRouteExit(previousRoute, route);
    }
    this.closeModelPreviewIfOpen();
    this.hideAllRouteViews();
    this.resetImmersiveState();
    this.appShell.setRoute(route);
    this.routeRestoring.classList.add('hidden');
    this.clearFullFlowModelOption();
    if (route !== 'ar') {
      this.arPlacementStarted = false;
    }
  }

  private enterPage(element: HTMLElement): void {
    element.classList.remove('hidden');
  }

  private openHomePage(): void {
    this.enterPage(this.landing);
  }

  private openCameraPage(): void {
    this.statusPanel.classList.remove('hidden');
    this.statusPanel.classList.add('camera-active');
    this.cameraPanel.classList.remove('hidden');
    this.cameraPanel.classList.add('fullscreen');
    this.showLiveCameraPreview('camera');
    this.handlers.onStartCamera();
  }

  private openARPage(): void {
    this.statusPanel.classList.remove('hidden');
    if (this.arPlacementStarted) {
      this.showARPlacementControls();
      return;
    }

    this.showARModelPicker();
  }

  private openFullFlowPage(): void {
    this.statusPanel.classList.remove('hidden');
    this.statusPanel.classList.add('camera-active', 'full-flow-active');
    this.cameraPanel.classList.remove('hidden');
    this.cameraPanel.classList.add('fullscreen');
    this.showLiveCameraPreview('full-flow');
    this.handlers.onStartCamera();
  }

  private openDynamicPage(): void {
    this.statusPanel.classList.remove('hidden');
    this.statusPanel.classList.add('camera-active', 'full-flow-active');
    this.cameraPanel.classList.remove('hidden');
    this.cameraPanel.classList.add('fullscreen');
    this.showLiveCameraPreview('dynamic');
    this.handlers.onStartCamera();
  }

  private openSpeechPage(): void {
    this.enterPage(this.speechPanel);
    this.showSpeechReady();
  }

  private openUploadPage(): void {
    this.statusPanel.classList.remove('hidden');
    this.statusPanel.classList.add('camera-active');
    this.cameraPanel.classList.remove('hidden');
    this.cameraPanel.classList.add('fullscreen');
    this.showUploadImagePicker();
  }

  private openUploadModelPage(): void {
    this.statusPanel.classList.remove('hidden');
    this.statusPanel.classList.add('camera-active');
    this.cameraPanel.classList.remove('hidden');
    this.cameraPanel.classList.add('fullscreen');
    this.showUploadModelPicker();
  }

  private openModelManagerPage(): void {
    this.enterPage(this.modelManager);
    this.renderModelManagerList();
  }

  private openAuthPage(message = 'Sign in with an approved account, or create one for admin approval.'): void {
    this.enterPage(this.authPanel);
    this.setAuthFormMode('login');
    this.showAuthMessage(message, false);
  }

  private openAdminDashboardPage(): void {
    this.enterPage(this.adminDashboard);
    this.renderAdminAccounts();
    this.renderAdminJobs();
    this.handlers.onRefreshAdminAccounts();
    this.handlers.onRefreshAdminJobs();
  }

  private handleCaptureClick(): void {
    this.handlers.onCaptureImage();
  }

  private handleLoginClick(): void {
    if (this.authFormMode === 'signup') {
      this.setAuthFormMode('login');
      this.showAuthMessage('Sign in with an approved account, or create one for admin approval.', false);
      return;
    }

    this.handlers.onLogin(this.authEmailInput.value.trim().toLowerCase(), this.authPasswordInput.value);
  }

  private handleSignupClick(): void {
    if (this.authFormMode === 'login') {
      this.setAuthFormMode('signup');
      this.showAuthMessage('Create an account for admin approval.', false);
      this.authNameInput.focus();
      return;
    }

    this.handlers.onSignup(
      this.authEmailInput.value.trim().toLowerCase(),
      this.authPasswordInput.value,
      this.authNameInput.value.trim(),
    );
  }

  private setAuthFormMode(mode: AuthFormMode): void {
    this.authFormMode = mode;
    const isSignup = mode === 'signup';

    this.authNameLabel.hidden = !isSignup;
    this.authNameInput.disabled = !isSignup;
    this.authNameInput.required = isSignup;
    this.authPasswordInput.autocomplete = isSignup ? 'new-password' : 'current-password';
    this.authSignInButton.classList.toggle('primary', !isSignup);
    this.authSignupButton.classList.toggle('primary', isSignup);

    if (!isSignup) {
      this.authNameInput.value = '';
    }
  }

  private handleSubmitClick(): void {
    this.handlers.onSubmitTarget(this.targetObjectInput.value.trim());
  }

  private handleGenerateClick(): void {
    const targetObject = this.targetObjectInput.value.trim();
    if (this.activeRoute === 'full-flow' || this.activeRoute === 'dynamic') {
      const isDynamicRoute = this.activeRoute === 'dynamic';
      this.navigateTo('ar');
      this.statusMessage.textContent =
        isDynamicRoute
          ? 'Opening AR camera, generating a dynamic image, and building your 3D object...'
          : 'Opening AR camera and building your 3D object...';
      this.startAttachedARCamera();
      if (isDynamicRoute) {
        this.handlers.onDynamicFlowCapture(targetObject);
        return;
      }
      this.handlers.onFullFlowCapture(targetObject);
      return;
    }

    this.handlers.onGenerateModel(targetObject);
  }

  private handleModelPreviewLightingInput(): void {
    const intensity = this.parseModelPreviewLightingIntensity();
    this.updateModelPreviewLightingLabel();
    this.handlers.onPreviewLightingChange(intensity);
  }

  private handleModelPreviewDirectionInput(): void {
    const degrees = this.parseModelPreviewLightDirectionDegrees();
    this.updateModelPreviewDirectionLabel();
    this.handlers.onPreviewLightDirectionChange(degrees);
  }

  private parseModelPreviewLightingIntensity(): number {
    const value = Number(this.modelPreviewLightingInput.value);
    if (!Number.isFinite(value)) {
      return 1;
    }

    return Math.min(1.8, Math.max(0.5, value / 100));
  }

  private updateModelPreviewLightingLabel(): void {
    const percentage = `${Math.round(this.parseModelPreviewLightingIntensity() * 100)}%`;
    this.modelPreviewLightingValue.value = percentage;
    this.modelPreviewLightingValue.textContent = percentage;
    this.modelPreviewLightingInput.setAttribute('aria-valuetext', percentage);
  }

  private parseModelPreviewLightDirectionDegrees(): number {
    const value = Number(this.modelPreviewDirectionInput.value);
    if (!Number.isFinite(value)) {
      return 45;
    }

    return ((Math.round(value / 5) * 5) % 360 + 360) % 360;
  }

  private updateModelPreviewDirectionLabel(): void {
    const degrees = `${this.parseModelPreviewLightDirectionDegrees()} deg`;
    this.modelPreviewDirectionValue.value = degrees;
    this.modelPreviewDirectionValue.textContent = degrees;
    this.modelPreviewDirectionInput.setAttribute('aria-valuetext', degrees);
  }

  private renderModelSelect(): void {
    const selectedModelId = this.modelSelect.value;
    this.modelSelect.replaceChildren(new Option('Select model', '', true, !selectedModelId));
    this.selectableModelOptions().forEach((model) => {
      this.modelSelect.append(new Option(model.label, model.id));
    });
    if ([...this.modelSelect.options].some((option) => option.value === selectedModelId)) {
      this.modelSelect.value = selectedModelId;
    } else {
      this.modelSelect.value = '';
    }
    this.renderModelRail();
    this.renderARModelPicker();
  }

  private renderModelDownloadState(): void {
    this.renderModelManagerList();
    this.renderARModelPicker();
    this.renderModelRail();
  }

  private allModelOptions(): ModelOption[] {
    return [...this.baseModelOptions, ...this.generatedModelOptions, ...this.uploadedModelOptions];
  }

  private modelManagerOptions(): ModelOption[] {
    return [...this.generatedModelOptions, ...this.uploadedModelOptions];
  }

  private selectableModelOptions(): ModelOption[] {
    const models = this.allModelOptions();
    if (!this.fullFlowModelOption || models.some((model) => model.id === this.fullFlowModelOption?.id)) {
      return models;
    }

    return [...models, this.fullFlowModelOption];
  }

  private filteredModelOptions(models: ModelOption[]): ModelOption[] {
    const query = this.modelSearchQuery;
    return models.filter((model) => {
      const modelKind = this.modelKind(model);
      const matchesQuery =
        !query ||
        model.label.toLowerCase().includes(query) ||
        model.ownerEmail?.toLowerCase().includes(query) ||
        this.modelBadgeText(modelKind).toLowerCase().includes(query);
      if (!matchesQuery) {
        return false;
      }

      switch (this.modelFilter) {
        case 'generated':
          return modelKind === 'generated';
        case 'uploaded':
          return modelKind === 'uploaded';
        case 'favorites':
          return this.favoriteModelIds.has(model.id);
        case 'recent':
          return this.recentModelIds.includes(model.id);
        case 'all':
          return true;
      }
    });
  }

  private setModelSearchQuery(value: string): void {
    this.modelSearchQuery = value.trim().toLowerCase();
    this.syncModelLibraryControls();
    this.renderModelManagerList();
    this.renderARModelPicker();
  }

  private setModelFilter(value: string): void {
    this.modelFilter = this.isModelLibraryFilter(value) ? value : 'all';
    this.syncModelLibraryControls();
    this.renderModelManagerList();
    this.renderARModelPicker();
  }

  private syncModelLibraryControls(): void {
    [this.modelSearchInput, this.arModelSearchInput].forEach((input) => {
      if (input.value !== this.modelSearchQuery) {
        input.value = this.modelSearchQuery;
      }
    });
    [this.modelFilterSelect, this.arModelFilterSelect].forEach((select) => {
      if (select.value !== this.modelFilter) {
        select.value = this.modelFilter;
      }
    });
  }

  private isModelLibraryFilter(value: string): value is ModelLibraryFilter {
    return ['all', 'generated', 'uploaded', 'favorites', 'recent'].includes(value);
  }

  private canManageModel(model: ModelOption): boolean {
    if (!this.currentUser) {
      return false;
    }
    if (this.currentUser.role === 'admin') {
      return model.id.startsWith('generated-') || model.id.startsWith('uploaded-');
    }
    if (model.ownerEmail) {
      return model.ownerEmail === this.currentUser.email;
    }
    return model.id.startsWith('uploaded-');
  }

  private ownerLabel(ownerEmail: string): string {
    if (this.currentUser?.email === ownerEmail) {
      return 'Owned by you';
    }
    if (this.currentUser?.role === 'admin') {
      return ownerEmail;
    }
    return 'Owned';
  }

  private renderModelManagerList(): void {
    this.closeModelEditDialog();
    this.modelList.replaceChildren();
    const models = this.filteredModelOptions(this.modelManagerOptions());
    if (models.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'model-manager-empty';
      empty.textContent = 'No models match this view.';
      this.modelList.appendChild(empty);
      return;
    }

    models.forEach((model) => {
      const modelKind = this.modelKind(model);
      const isGenerated = modelKind === 'generated';
      const isUploaded = modelKind === 'uploaded';
      const canUpdateThumbnail = model.id.startsWith('generated-');
      const canManageModel = this.canManageModel(model);
      const downloadState = this.modelDownloadState(model.id);
      const row = document.createElement('article');
      row.className = [
        'model-manager-row',
        'has-preview',
        isGenerated ? 'is-generated' : '',
        isUploaded ? 'is-uploaded' : '',
        downloadState === 'downloaded' ? 'is-downloaded' : 'is-not-downloaded',
        downloadState === 'downloading' ? 'is-downloading' : '',
      ]
        .filter(Boolean)
        .join(' ');
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

      if (model.visibility) {
        const visibility = document.createElement('span');
        visibility.className = `model-manager-badge visibility-${model.visibility}`;
        visibility.textContent = model.visibility === 'public' ? 'Public' : 'Private';
        details.appendChild(visibility);
      }

      if (model.ownerEmail) {
        const owner = document.createElement('span');
        owner.className = 'model-manager-owner';
        owner.textContent = this.ownerLabel(model.ownerEmail);
        details.appendChild(owner);
      }

      const meta = document.createElement('div');
      meta.className = 'model-manager-meta';
      meta.append(this.createModelDownloadStatus(model.id), this.createModelSizePill(model));
      details.appendChild(meta);

      const label = document.createElement('p');
      label.className = 'model-manager-name';
      label.textContent = model.label;
      details.appendChild(label);

      row.appendChild(details);

      const actions = document.createElement('div');
      actions.className = 'model-manager-actions';
      actions.append(this.createModelActionButton(`Preview ${model.label}`, 'preview', 'preview', '', () => this.handlers.onPreviewModel(model.id)));
      actions.append(this.createDownloadModelButton(model));
      actions.append(this.createFavoriteButton(model));
      if (canManageModel && model.id.startsWith('generated-') && (isGenerated || isUploaded)) {
        const nextVisibility: ModelVisibility = model.visibility === 'public' ? 'private' : 'public';
        const visibilityLabel = model.visibility === 'public' ? `Make private ${model.label}` : `Make public ${model.label}`;
        actions.append(
          this.createModelActionButton(visibilityLabel, nextVisibility === 'public' ? 'visibility-public' : 'visibility-private', 'visibility', '', () => {
            this.handlers.onToggleGeneratedModelVisibility(model.id, nextVisibility);
          }),
        );
      }
      if (canManageModel && canUpdateThumbnail) {
        actions.append(
          this.createModelActionButton(`Edit ${model.label}`, 'edit', 'edit', '', () => {
            this.openModelEditDialog(model);
          }),
        );
      }
      if (canManageModel && (isGenerated || isUploaded)) {
        const deleteButton = this.createModelActionButton(`Delete ${model.label}`, 'delete', 'delete', 'danger', () => {
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

  private renderAuthControls(): void {
    this.appShell.setUser(this.currentUser);
    if (!this.currentUser) {
      this.authIdentity.textContent = 'Guest access';
      this.loginButton.classList.remove('hidden');
      this.logoutButton.classList.add('hidden');
      this.adminButton.classList.add('hidden');
      this.renderModelManagerList();
      return;
    }

    this.authIdentity.textContent = `${this.currentUser.email} (${this.currentUser.role})`;
    this.loginButton.classList.add('hidden');
    this.logoutButton.classList.remove('hidden');
    this.adminButton.classList.toggle('hidden', this.currentUser.role !== 'admin');
    this.renderModelManagerList();
  }

  private renderAdminAccounts(): void {
    this.adminAccountList.replaceChildren();
    if (this.adminAccounts.length === 0) {
      this.adminDashboardMessage.textContent = 'No accounts loaded yet.';
      return;
    }

    this.adminDashboardMessage.textContent = 'Account changes take effect immediately.';
    this.adminAccounts.forEach((account) => {
      const row = document.createElement('article');
      row.className = `admin-account-row is-${account.status}`;

      const details = document.createElement('div');
      details.className = 'admin-account-details';
      const email = document.createElement('p');
      email.className = 'admin-account-email';
      email.textContent = account.email;
      const meta = document.createElement('p');
      meta.className = 'admin-account-meta';
      const statusLabel = account.status === 'pending' ? 'Pending' : 'Active';
      meta.textContent = `${statusLabel} · ${account.role}${account.name ? ` · ${account.name}` : ''}`;
      details.append(email, meta);

      const actions = document.createElement('div');
      actions.className = 'admin-account-actions';
      if (account.status === 'pending') {
        actions.append(this.createButton('Approve', 'primary', () => this.handlers.onApproveAccount(account.email)));
      }
      if (account.email !== this.currentUser?.email) {
        actions.append(this.createButton('Remove', 'danger', () => this.handlers.onRemoveAccount(account.email)));
      }

      row.append(details, actions);
      this.adminAccountList.appendChild(row);
    });
  }

  private renderAdminJobs(): void {
    this.adminJobList.replaceChildren();
    if (this.adminJobs.length === 0) {
      this.adminJobMessage.textContent = 'No jobs loaded yet.';
      this.adminJobMessage.classList.remove('is-error');
      return;
    }

    this.adminJobMessage.textContent = 'Job changes are stored in Cloudflare storage.';
    this.adminJobMessage.classList.remove('is-error');
    this.adminJobs.forEach((job) => {
      const row = document.createElement('article');
      row.className = `admin-job-row is-${job.status}`;

      const details = document.createElement('div');
      details.className = 'admin-job-details';
      const title = document.createElement('p');
      title.className = 'admin-job-title';
      title.textContent = job.label || job.id;
      const meta = document.createElement('p');
      meta.className = 'admin-job-meta';
      const parts = [
        job.status,
        job.ownerEmail ? `owner ${job.ownerEmail}` : 'owner unknown',
        typeof job.bytes === 'number' ? this.formatBytes(job.bytes) : null,
        job.createdAt ? `created ${this.formatDateTime(job.createdAt)}` : null,
        job.updatedAt ? `updated ${this.formatDateTime(job.updatedAt)}` : null,
      ].filter((part): part is string => Boolean(part));
      meta.textContent = parts.join(' | ');
      details.append(title, meta);

      if (job.error) {
        const error = document.createElement('p');
        error.className = 'admin-job-error';
        error.textContent = job.error;
        details.appendChild(error);
      }

      const actions = document.createElement('div');
      actions.className = 'admin-job-actions';
      if (job.status === 'failed') {
        actions.append(
          this.createButton('Retry', 'primary', () => {
            this.adminJobMessage.textContent = `Retrying ${job.id}...`;
            this.handlers.onRetryAdminJob(job.id);
          }),
        );
      }
      if (job.modelUrl) {
        const link = document.createElement('a');
        link.href = job.modelUrl;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = 'Open GLB';
        actions.appendChild(link);
      }

      row.append(details, actions);
      this.adminJobList.appendChild(row);
    });
  }

  private renderModelRail(): void {
    const selectedModelId = this.modelSelect.value;
    this.modelRail.replaceChildren();

    this.selectableModelOptions().forEach((model) => {
      const downloadState = this.modelDownloadState(model.id);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = [
        'model-rail-item',
        downloadState === 'downloaded' ? 'is-downloaded' : 'is-not-downloaded',
        downloadState === 'downloading' ? 'is-downloading' : '',
      ]
        .filter(Boolean)
        .join(' ');
      item.dataset.modelId = model.id;
      item.setAttribute('aria-label', `Select ${model.label}`);
      item.setAttribute('aria-pressed', selectedModelId === model.id ? 'true' : 'false');
      item.classList.toggle('is-selected', selectedModelId === model.id);
      item.addEventListener('click', () => {
        this.modelSelect.value = model.id;
        this.updateModelRailSelection(model.id);
        this.handlers.onModelSelect(model.id);
      });

      const thumbnail = document.createElement('span');
      thumbnail.className = 'model-rail-thumb';
      if (model.previewUrl) {
        const image = document.createElement('img');
        image.src = model.previewUrl;
        image.alt = '';
        image.loading = 'lazy';
        thumbnail.appendChild(image);
      } else {
        thumbnail.textContent = this.modelRailPlaceholderText(model);
      }

      const label = document.createElement('span');
      label.className = 'model-rail-label';
      label.textContent = model.label;

      item.append(thumbnail, label);
      this.modelRail.appendChild(item);
    });
  }

  private renderARModelPicker(): void {
    const selectedModelId = this.modelSelect.value;
    this.arModelList.replaceChildren();

    const models = this.filteredModelOptions(this.selectableModelOptions());
    if (models.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'ar-model-empty';
      empty.textContent = 'No models match this view.';
      this.arModelList.appendChild(empty);
      this.updateARPlaceButton();
      return;
    }

    models.forEach((model) => {
      const downloadState = this.modelDownloadState(model.id);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = [
        'ar-model-card',
        downloadState === 'downloaded' ? 'is-downloaded' : 'is-not-downloaded',
        downloadState === 'downloading' ? 'is-downloading' : '',
      ]
        .filter(Boolean)
        .join(' ');
      item.dataset.modelId = model.id;
      item.setAttribute('aria-label', `Select ${model.label}`);
      item.setAttribute('aria-pressed', selectedModelId === model.id ? 'true' : 'false');
      item.classList.toggle('is-selected', selectedModelId === model.id);
      item.addEventListener('click', () => this.selectARModelForPlacement(model.id));

      const thumbnail = document.createElement('span');
      thumbnail.className = 'ar-model-card-thumb';
      if (model.previewUrl) {
        const image = document.createElement('img');
        image.src = model.previewUrl;
        image.alt = '';
        image.loading = 'lazy';
        thumbnail.appendChild(image);
      } else {
        thumbnail.textContent = this.modelRailPlaceholderText(model);
      }

      const label = document.createElement('span');
      label.className = 'ar-model-card-label';
      label.textContent = model.label;

      const meta = document.createElement('span');
      meta.className = 'ar-model-card-meta';
      meta.textContent = `${this.modelDownloadStatusText(downloadState)} - ${
        typeof model.bytes === 'number' ? this.formatBytes(model.bytes) : 'Size unknown'
      }`;

      const selectionLabel = document.createElement('span');
      selectionLabel.className = 'selection-label';
      selectionLabel.textContent = selectedModelId === model.id ? 'Selected' : 'Select';

      item.append(thumbnail, label, meta, selectionLabel);
      this.arModelList.appendChild(item);
    });

    this.updateARPlaceButton();
  }

  private selectARModelForPlacement(modelId: string): void {
    this.modelSelect.value = modelId;
    this.markModelRecent(modelId);
    this.updateModelRailSelection(modelId);
    this.updateARModelPickerSelection(modelId);
    this.updateARPlaceButton();
    this.handlers.onModelSelect(modelId);
  }

  private showARModelPicker(): void {
    this.statusPanel.classList.add('ar-picker-active');
    this.hudActions.classList.add('hidden');
    this.modelRail.classList.add('hidden');
    this.gestureSurface.classList.add('hidden');
    this.arModelPicker.classList.remove('hidden');
    this.renderARModelPicker();
  }

  private openMultiObjectEditor(): void {
    this.showMultiObjectEditor();
    this.startAttachedARCamera();
    this.handlers.onStartMultiObject();
  }

  private showARPlacementControls(): void {
    this.statusPanel.classList.remove('ar-picker-active');
    this.arModelPicker.classList.add('hidden');
    this.hudActions.classList.remove('hidden');
    this.modelRail.classList.remove('hidden');
    this.gestureSurface.classList.remove('hidden');
    this.showLayoutActionButtons(false);
    this.renderModelRail();
  }

  private showLayoutActionButtons(isVisible: boolean): void {
    const buttons = [this.addLayoutObjectButton, this.deleteLayoutObjectButton];
    if (isVisible) {
      buttons.forEach((button) => {
        button.classList.remove('hidden');
        if (button.parentElement !== this.hudActions) {
          this.hudActions.appendChild(button);
        }
      });
      return;
    }

    buttons.forEach((button) => {
      button.classList.add('hidden');
      button.remove();
    });
  }

  private setSpeechStage(stage: SpeechProcessStage | null): void {
    const activeIndex = stage ? speechStageOrder.indexOf(stage) : -1;
    this.speechStageItems.forEach((item, itemStage) => {
      const itemIndex = speechStageOrder.indexOf(itemStage);
      const isCompleted = stage === 'completed' || (activeIndex > itemIndex && itemIndex >= 0);
      item.classList.toggle('is-active', itemStage === stage);
      item.classList.toggle('is-done', isCompleted);
      item.classList.remove('is-failed');
    });
  }

  private openSelectedModelInAR(): void {
    if (!this.modelSelect.value || !this.modelReady) {
      return;
    }

    this.arPlacementStarted = true;
    this.showARPlacementControls();
    this.startAttachedARCamera();
  }

  private updateARModelPickerSelection(modelId: string): void {
    this.arModelList.querySelectorAll<HTMLButtonElement>('.ar-model-card').forEach((item) => {
      const isSelected = item.dataset.modelId === modelId;
      item.classList.toggle('is-selected', isSelected);
      item.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      const selectionLabel = item.querySelector<HTMLElement>('.selection-label');
      if (selectionLabel) {
        selectionLabel.textContent = isSelected ? 'Selected' : 'Select';
      }
    });
  }

  private updateARPlaceButton(): void {
    const hasSelection = Boolean(this.modelSelect.value);
    this.arPlaceButton.disabled = !hasSelection || !this.modelReady;
    this.arPlaceButton.textContent = hasSelection && this.modelReady
      ? 'Place selected model'
      : hasSelection
        ? 'Preparing selected model...'
        : 'Select a model';
  }

  private updateModelRailSelection(modelId: string): void {
    this.modelRail.querySelectorAll<HTMLButtonElement>('.model-rail-item').forEach((item) => {
      const isSelected = item.dataset.modelId === modelId;
      item.classList.toggle('is-selected', isSelected);
      item.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
  }

  private createFavoriteButton(model: ModelOption): HTMLButtonElement {
    const isFavorite = this.favoriteModelIds.has(model.id);
    const button = this.createModelActionButton(
      isFavorite ? `Remove favorite ${model.label}` : `Favorite ${model.label}`,
      isFavorite ? 'favorite-filled' : 'favorite',
      'favorite',
      isFavorite ? 'is-active' : '',
      () => {
        this.toggleFavorite(model.id);
      },
    );
    button.setAttribute('aria-pressed', isFavorite ? 'true' : 'false');
    return button;
  }

  private createDownloadModelButton(model: ModelOption): HTMLButtonElement {
    const downloadState = this.modelDownloadState(model.id);
    const label =
      downloadState === 'downloaded'
        ? `Downloaded ${model.label}`
        : downloadState === 'downloading'
          ? `Downloading ${model.label}`
          : `Download ${model.label}`;
    const button = this.createModelActionButton(label, 'download', 'download', '', () => {
      this.markModelDownloadStarted(model.id);
      this.modelSelect.value = model.id;
      this.updateModelRailSelection(model.id);
      this.updateARModelPickerSelection(model.id);
      this.handlers.onModelSelect(model.id);
    });
    button.classList.toggle('is-downloading', downloadState === 'downloading');
    button.classList.toggle('is-complete', downloadState === 'downloaded');
    button.disabled = downloadState === 'downloaded';
    button.setAttribute('aria-pressed', downloadState === 'downloaded' ? 'true' : 'false');
    return button;
  }

  private createModelDownloadStatus(modelId: string): HTMLElement {
    const state = this.modelDownloadState(modelId);
    const status = document.createElement('span');
    status.className = `model-download-pill is-${state}`;
    status.textContent =
      state === 'downloaded' ? 'Downloaded' : state === 'downloading' ? 'Downloading' : 'Not downloaded';
    return status;
  }

  private createModelSizePill(model: ModelOption): HTMLElement {
    const size = document.createElement('span');
    size.className = 'model-size-pill';
    size.textContent = typeof model.bytes === 'number' ? this.formatBytes(model.bytes) : 'Size unknown';
    return size;
  }

  private modelDownloadState(modelId: string): 'downloaded' | 'downloading' | 'not-downloaded' {
    if (this.downloadingModelIds.has(modelId)) {
      return 'downloading';
    }
    if (this.downloadedModelIds.has(modelId)) {
      return 'downloaded';
    }
    return 'not-downloaded';
  }

  private modelDownloadStatusText(state: 'downloaded' | 'downloading' | 'not-downloaded'): string {
    switch (state) {
      case 'downloaded':
        return 'Downloaded';
      case 'downloading':
        return 'Downloading';
      case 'not-downloaded':
        return 'Not downloaded';
    }
  }

  private toggleFavorite(modelId: string): void {
    if (this.favoriteModelIds.has(modelId)) {
      this.favoriteModelIds.delete(modelId);
    } else {
      this.favoriteModelIds.add(modelId);
    }
    this.writeStoredModelIds(this.favoriteStorageKey, [...this.favoriteModelIds]);
    this.renderModelManagerList();
    this.renderARModelPicker();
  }

  private markModelRecent(modelId: string): void {
    this.recentModelIds = [modelId, ...this.recentModelIds.filter((recentId) => recentId !== modelId)].slice(0, 12);
    this.writeStoredModelIds(this.recentStorageKey, this.recentModelIds);
  }

  private readStoredModelIds(key: string): string[] {
    try {
      const value = window.localStorage.getItem(key);
      const parsed = value ? (JSON.parse(value) as unknown) : [];
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  private writeStoredModelIds(key: string, modelIds: string[]): void {
    try {
      window.localStorage.setItem(key, JSON.stringify(modelIds));
    } catch {
      // Local library state is a convenience; storage failure should not block AR usage.
    }
  }

  private modelRailPlaceholderText(model: ModelOption): string {
    switch (this.modelKind(model)) {
      case 'uploaded':
        return 'GLB';
      case 'generated':
        return 'Gen';
      case 'built-in':
        return '3D';
    }
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
    placeholder.textContent = this.modelKind(model) === 'uploaded' ? 'GLB' : this.modelKind(model) === 'generated' ? 'Generated' : 'Built-in';
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

  private handleModelThumbnailChange(modelId: string, input: HTMLInputElement, statusTarget?: HTMLElement): boolean {
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return false;
    }

    if (!file.type.startsWith('image/')) {
      const message = 'Choose an image file for the thumbnail.';
      if (statusTarget) {
        statusTarget.textContent = message;
      } else {
        this.updateModelManagerStatus(message);
      }
      return false;
    }

    this.handlers.onUpdateModelThumbnail(modelId, file);
    return true;
  }

  private openModelEditDialog(model: ModelOption): void {
    this.closeModelEditDialog();

    const dialog = document.createElement('div');
    dialog.className = 'model-edit-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', `Edit ${model.label}`);

    const panel = document.createElement('div');
    panel.className = 'model-edit-panel';

    const title = document.createElement('h3');
    title.textContent = 'Edit model';

    const nameLabel = document.createElement('label');
    nameLabel.className = 'model-edit-field';
    const nameText = document.createElement('span');
    nameText.textContent = 'Name';
    const nameInput = document.createElement('input');
    nameInput.name = 'modelLabel';
    nameInput.type = 'text';
    nameInput.autocomplete = 'off';
    nameInput.value = model.label;
    nameInput.setAttribute('aria-label', `Name for ${model.label}`);
    nameLabel.append(nameText, nameInput);

    const thumbnailLabel = document.createElement('label');
    thumbnailLabel.className = 'model-edit-field';
    const thumbnailText = document.createElement('span');
    thumbnailText.textContent = 'Thumbnail';
    const thumbnailInput = document.createElement('input');
    thumbnailInput.type = 'file';
    thumbnailInput.accept = 'image/*';
    thumbnailInput.setAttribute('aria-label', `Thumbnail for ${model.label}`);
    thumbnailLabel.append(thumbnailText, thumbnailInput);

    const status = document.createElement('p');
    status.className = 'model-edit-status';
    status.textContent = 'Update the visible name or choose a new image thumbnail.';

    const actions = document.createElement('div');
    actions.className = 'model-edit-actions';
    const cancelButton = this.createButton('Cancel', '', () => this.closeModelEditDialog());
    cancelButton.dataset.action = 'cancel-edit';
    const saveButton = this.createButton('Save changes', 'primary', () => {
      const nextLabel = nameInput.value.trim();
      if (!nextLabel) {
        status.textContent = 'Enter a model name before saving.';
        nameInput.focus();
        return;
      }

      if (nextLabel !== model.label.trim()) {
        this.handleModelRename(model.id, nextLabel);
      }

      const hasThumbnailFile = Boolean(thumbnailInput.files?.length);
      const thumbnailSaved = this.handleModelThumbnailChange(model.id, thumbnailInput, status);
      if (hasThumbnailFile && !thumbnailSaved) {
        return;
      }

      this.closeModelEditDialog();
    });
    saveButton.dataset.action = 'save-edit';
    actions.append(cancelButton, saveButton);

    panel.append(title, nameLabel, thumbnailLabel, status, actions);
    dialog.appendChild(panel);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        this.closeModelEditDialog();
      }
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeModelEditDialog();
      }
    });

    this.modelManager.appendChild(dialog);
    this.modelEditDialog = dialog;
    nameInput.focus();
  }

  private closeModelEditDialog(): void {
    this.modelEditDialog?.classList.add('hidden');
    this.modelEditDialog?.remove();
    this.modelEditDialog = null;
  }

  private closeModelPreviewIfOpen(): void {
    if (!this.modelPreview.classList.contains('hidden')) {
      this.handlers.onCloseModelPreview();
    }
  }

  private clearFullFlowModelOption(): void {
    if (!this.fullFlowModelOption) {
      return;
    }

    this.fullFlowModelOption = null;
    this.renderModelSelect();
  }

  private isModelManagerControl(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(target.closest('button, input, select, textarea, a, label'));
  }

  private generationButtonLabel(): string {
    return this.activeRoute === 'full-flow' || this.activeRoute === 'dynamic'
      ? 'Generate and place'
      : 'Generate model';
  }

  private syncCameraActionLayout(): void {
    const visibleButtons = [...this.cameraActions.querySelectorAll<HTMLButtonElement>('button')]
      .filter((button) => !button.classList.contains('hidden'));
    this.cameraActions.classList.toggle('single-primary', visibleButtons.length === 1);
  }

  private setCreationStage(stage: 'capture' | 'generate' | 'place' | null): void {
    const showSteps = this.activeRoute === 'full-flow' || this.activeRoute === 'dynamic';
    const list = this.cameraPanel.querySelector<HTMLElement>('.creation-step-list')!;
    list.classList.toggle('hidden', !showSteps);
    for (const item of list.querySelectorAll<HTMLElement>('[data-creation-stage]')) {
      const itemStage = item.dataset.creationStage;
      item.classList.toggle('is-active', itemStage === stage);
      item.classList.toggle(
        'is-done',
        (stage === 'generate' && itemStage === 'capture')
          || (stage === 'place' && itemStage !== 'place'),
      );
    }
  }

  private startAttachedARCamera(): void {
    const arControl = this.arButtonSlot.querySelector<HTMLElement>('button, a');
    if (arControl?.textContent?.trim().toUpperCase().includes('STOP')) {
      return;
    }

    arControl?.click();
  }

  private createModelLibraryControls(
    searchName: string,
    filterName: string,
  ): { root: HTMLElement; searchInput: HTMLInputElement; filterSelect: HTMLSelectElement } {
    const root = document.createElement('div');
    root.className = 'model-library-controls';

    const searchLabel = document.createElement('label');
    searchLabel.className = 'model-library-search';
    const searchText = document.createElement('span');
    searchText.textContent = 'Search';
    const searchInput = document.createElement('input');
    searchInput.name = searchName;
    searchInput.type = 'search';
    searchInput.autocomplete = 'off';
    searchInput.placeholder = 'Search models';
    searchInput.value = this.modelSearchQuery;
    searchInput.addEventListener('input', () => this.setModelSearchQuery(searchInput.value));
    searchLabel.append(searchText, searchInput);

    const filterLabel = document.createElement('label');
    filterLabel.className = 'model-library-filter';
    const filterText = document.createElement('span');
    filterText.textContent = 'View';
    const filterSelect = document.createElement('select');
    filterSelect.name = filterName;
    [
      ['all', 'All models'],
      ['generated', 'Generated'],
      ['uploaded', 'Uploaded'],
      ['favorites', 'Favorites'],
      ['recent', 'Recent'],
    ].forEach(([value, label]) => {
      filterSelect.append(new Option(label, value));
    });
    filterSelect.value = this.modelFilter;
    filterSelect.addEventListener('change', () => this.setModelFilter(filterSelect.value));
    filterLabel.append(filterText, filterSelect);

    root.append(searchLabel, filterLabel);
    return { root, searchInput, filterSelect };
  }

  private createModeGroup(title: string, description: string, actions: HTMLElement[]): HTMLElement {
    const group = document.createElement('section');
    group.className = 'mode-group';
    group.innerHTML = `
      <div class="mode-group-heading">
        <h2>${title}</h2>
        <p>${description}</p>
      </div>
    `;
    const actionList = document.createElement('div');
    actionList.className = 'mode-action-list';
    actionList.append(...actions);
    group.appendChild(actionList);
    return group;
  }

  private createModeAction(button: HTMLButtonElement, icon: string): HTMLElement {
    const action = document.createElement('div');
    action.className = 'mode-action';
    button.dataset.icon = icon;
    action.appendChild(button);
    return action;
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

  private createHudActionButton(
    label: string,
    visibleLabel: string,
    className: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = this.createButton(visibleLabel, ['hud-action-chip', className].filter(Boolean).join(' '), onClick);
    button.setAttribute('aria-label', label);
    button.title = label;
    return button;
  }

  private createRotateControl(): HTMLLabelElement {
    const control = document.createElement('label');
    control.className = 'rotate-control';

    const label = document.createElement('span');
    label.textContent = 'Rotate';

    const input = document.createElement('input');
    input.type = 'range';
    input.min = '-180';
    input.max = '180';
    input.step = '1';
    input.value = '0';
    input.setAttribute('aria-label', 'Rotate selected object');
    input.addEventListener('input', () => this.handleRotationInput());
    input.addEventListener('change', () => this.resetRotationInput());
    input.addEventListener('pointerup', () => this.resetRotationInput());
    input.addEventListener('touchend', () => this.resetRotationInput());
    input.disabled = true;

    this.rotateInput = input;
    control.append(label, input);
    return control;
  }

  private createAnimationControl(): { control: HTMLLabelElement; select: HTMLSelectElement } {
    const control = document.createElement('label');
    control.className = 'animation-control hidden';

    const label = document.createElement('span');
    label.textContent = 'Animation';

    const select = document.createElement('select');
    select.name = 'animationClip';
    select.setAttribute('aria-label', 'Animation clip');
    select.disabled = true;
    select.addEventListener('change', () => {
      const animationIndex = Number(select.value);
      if (Number.isInteger(animationIndex)) {
        this.handlers.onAnimationSelect(animationIndex);
      }
    });

    control.append(label, select);
    return { control, select };
  }

  private handleRotationInput(): void {
    const nextValue = Number(this.rotateInput.value);
    if (!Number.isFinite(nextValue)) {
      return;
    }

    const deltaDegrees = nextValue - this.rotationInputValue;
    this.rotationInputValue = nextValue;
    if (deltaDegrees !== 0) {
      this.handlers.onRotate(deltaDegrees * (Math.PI / 180));
    }
  }

  private resetRotationInput(): void {
    this.rotationInputValue = 0;
    this.rotateInput.value = '0';
  }

  private createModelActionButton(
    label: string,
    icon: ModelActionIcon,
    action: string,
    className: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = this.createButton('', ['model-manager-icon-button', className].filter(Boolean).join(' '), onClick);
    button.dataset.action = action;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.append(this.createIconSvg(icon));
    const text = document.createElement('span');
    text.className = 'sr-only';
    text.textContent = label;
    button.appendChild(text);
    return button;
  }

  private createIconSvg(icon: ModelActionIcon): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const paths: Record<ModelActionIcon, string[]> = {
      preview: [
        'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z',
        'M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z',
      ],
      download: ['M12 4v10', 'M8 10l4 4 4-4', 'M5 20h14'],
      favorite: ['M12 3.6l2.6 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8L12 3.6Z'],
      'favorite-filled': ['M12 3.6l2.6 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8L12 3.6Z'],
      'visibility-public': ['M6 10V8a6 6 0 0 1 11.6-2', 'M7 10h10a2 2 0 0 1 2 2v7H5v-7a2 2 0 0 1 2-2Z'],
      'visibility-private': ['M7 10V8a5 5 0 0 1 10 0v2', 'M7 10h10a2 2 0 0 1 2 2v7H5v-7a2 2 0 0 1 2-2Z'],
      edit: ['M4 20h4.2L19.4 8.8a2.1 2.1 0 0 0-3-3L5.2 17H4v3Z', 'M14.8 7.4l1.8 1.8'],
      delete: ['M4 7h16', 'M9 7V5h6v2', 'M6 7l1 13h10l1-13', 'M10 11v5', 'M14 11v5'],
    };

    paths[icon].forEach((pathData) => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('fill', icon === 'favorite-filled' ? 'currentColor' : 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '1.8');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
    });

    return svg;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
        return 'Object placed. Drag with one finger to move. Use Rotate to turn it.';
      case 'editing':
        return 'Editing object. Drag on the floor to move. Use Rotate to turn it.';
    }
  }
}
