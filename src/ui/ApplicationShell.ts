import type { AuthUser } from '../services/authClient';
import { getAccountDisplayName } from './accountIdentity';
import { apertureLogoUrl } from './brandAssets';
import { ROUTES, type HudRoute } from './routes';

interface ApplicationShellHandlers {
  onNavigate(route: HudRoute): void;
  onBack(): void;
  onLogout(): void;
}

const createRoutes: HudRoute[] = [
  'camera',
  'upload',
  'upload-model',
  'speech',
  'full-flow',
  'dynamic',
];

export class ApplicationShell {
  readonly root: HTMLElement;
  readonly pageHost: HTMLElement;
  readonly overlay: HTMLElement;

  private readonly routeTitle: HTMLElement;
  private readonly mobileRouteTitle: HTMLElement;
  private readonly immersiveTitle: HTMLElement;
  private readonly immersiveStatus: HTMLElement;
  private readonly createTrigger: HTMLButtonElement;
  private readonly mobileCreateTrigger: HTMLButtonElement;
  private readonly createMenu: HTMLElement;
  private readonly accountTriggers: HTMLButtonElement[];
  private readonly mobileAccountLink: HTMLButtonElement;
  private readonly accountMenu: HTMLElement;
  private readonly accountName: HTMLElement;
  private readonly accountEmail: HTMLElement;
  private readonly accountAdminButton: HTMLButtonElement;
  private readonly accountLogoutButton: HTMLButtonElement;
  private readonly sessionNotice: HTMLElement;
  private createMenuOpener: HTMLButtonElement | null = null;
  private accountMenuOpener: HTMLButtonElement | null = null;
  private currentUser: AuthUser | null = null;
  private sessionNoticeTimer: number | null = null;
  private activeRoute: HudRoute = 'home';

  constructor(host: HTMLElement, private readonly handlers: ApplicationShellHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'app-shell';
    this.root.innerHTML = `
      <header class="app-header">
        <button class="brand-button" type="button" data-nav-route="home" aria-label="WebXRify by Arvenilo home">
          <img
            class="brand-aperture"
            src="${apertureLogoUrl}"
            alt=""
            width="325"
            height="325"
          >
          <span class="brand-copy" aria-hidden="true">
            <strong class="brand-product-name">WebXRify</strong>
            <small class="brand-endorsement">by Arvenilo</small>
          </span>
        </button>
        <nav class="desktop-nav" aria-label="Primary">
          <button type="button" data-nav-route="home">Home</button>
          <div class="create-menu-wrap">
            <button
              class="create-menu-trigger"
              type="button"
              data-nav-section="create"
              aria-expanded="false"
              aria-controls="createMenu"
            >Create</button>
          </div>
          <button type="button" data-nav-route="models">Models</button>
          <button type="button" data-nav-route="ar">Place in AR</button>
          <button type="button" data-nav-route="multi-object">Multi-object</button>
        </nav>
        <div class="shell-account">
          <button
            class="account-menu-trigger desktop-account-trigger"
            type="button"
            aria-expanded="false"
            aria-controls="accountMenu"
          >
            <span class="account-status-dot" aria-hidden="true" hidden></span>
            <span class="account-trigger-label">Account</span>
          </button>
        </div>
      </header>
      <div id="createMenu" class="create-menu" role="menu" aria-label="Creation methods" hidden></div>
      <div class="route-bar">
        <button class="route-back" type="button">Back</button>
        <div class="calibration-heading">
          <span class="calibration-label">Spatial workspace</span>
          <h1 class="app-route-title"></h1>
        </div>
      </div>
      <div class="mobile-top-bar">
        <button
          class="mobile-brand-button"
          type="button"
          data-nav-route="home"
          aria-label="WebXRify by Arvenilo home"
        >
          <img
            class="brand-aperture"
            src="${apertureLogoUrl}"
            alt=""
            width="325"
            height="325"
          >
        </button>
        <button class="route-back" type="button">Back</button>
        <strong class="mobile-route-title"></strong>
        <button
          class="mobile-account-link account-menu-trigger"
          type="button"
          aria-expanded="false"
          aria-controls="accountMenu"
        >
          <span class="account-status-dot" aria-hidden="true" hidden></span>
          <span class="account-trigger-label">Account</span>
        </button>
      </div>
      <section id="accountMenu" class="account-menu" role="menu" aria-label="Account" hidden>
        <div class="account-menu-identity" role="none">
          <strong class="account-menu-name"></strong>
          <span class="account-menu-email"></span>
        </div>
        <button class="account-menu-admin" type="button" role="menuitem" hidden>
          Admin dashboard
        </button>
        <button class="account-menu-logout" type="button" role="menuitem">
          Log out
        </button>
      </section>
      <div class="session-notice" role="status" aria-live="polite" hidden></div>
      <div class="immersive-bar">
        <button class="immersive-exit" type="button">Exit</button>
        <div>
          <strong class="immersive-title"></strong>
          <span class="immersive-status"></span>
        </div>
      </div>
      <main class="app-page-host"></main>
      <nav class="mobile-bottom-nav" aria-label="Primary">
        <button type="button" data-nav-route="home">Home</button>
        <button
          class="mobile-create-trigger"
          type="button"
          data-nav-section="create"
          aria-expanded="false"
          aria-controls="createMenu"
        >Create</button>
        <button type="button" data-nav-route="models">Models</button>
        <button type="button" data-nav-route="ar">AR</button>
      </nav>
      <div class="xr-overlay"></div>
    `;
    host.appendChild(this.root);

    this.pageHost = this.root.querySelector<HTMLElement>('.app-page-host')!;
    this.overlay = this.root.querySelector<HTMLElement>('.xr-overlay')!;
    this.routeTitle = this.root.querySelector<HTMLElement>('.app-route-title')!;
    this.mobileRouteTitle = this.root.querySelector<HTMLElement>('.mobile-route-title')!;
    this.immersiveTitle = this.root.querySelector<HTMLElement>('.immersive-title')!;
    this.immersiveStatus = this.root.querySelector<HTMLElement>('.immersive-status')!;
    this.createTrigger = this.root.querySelector<HTMLButtonElement>('.create-menu-trigger')!;
    this.mobileCreateTrigger = this.root.querySelector<HTMLButtonElement>('.mobile-create-trigger')!;
    this.createMenu = this.root.querySelector<HTMLElement>('.create-menu')!;
    this.accountTriggers = [
      ...this.root.querySelectorAll<HTMLButtonElement>('.account-menu-trigger'),
    ];
    this.mobileAccountLink = this.root.querySelector<HTMLButtonElement>('.mobile-account-link')!;
    this.accountMenu = this.root.querySelector<HTMLElement>('.account-menu')!;
    this.accountName = this.root.querySelector<HTMLElement>('.account-menu-name')!;
    this.accountEmail = this.root.querySelector<HTMLElement>('.account-menu-email')!;
    this.accountAdminButton = this.root.querySelector<HTMLButtonElement>('.account-menu-admin')!;
    this.accountLogoutButton = this.root.querySelector<HTMLButtonElement>('.account-menu-logout')!;
    this.sessionNotice = this.root.querySelector<HTMLElement>('.session-notice')!;

    for (const route of createRoutes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.navRoute = route;
      button.textContent = ROUTES[route].title;
      button.setAttribute('role', 'menuitem');
      this.createMenu.appendChild(button);
    }

    this.root.addEventListener('click', (event) => this.handleClick(event));
    this.root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') {
        return;
      }
      if (!this.accountMenu.hidden) {
        event.preventDefault();
        this.closeAccountMenu(true);
        return;
      }
      if (!this.createMenu.hidden) {
        event.preventDefault();
        const opener = this.createMenuOpener;
        this.closeCreateMenu();
        opener?.focus();
      }
    });
  }

  setRoute(route: HudRoute): void {
    const meta = ROUTES[route];
    this.activeRoute = route;
    this.root.dataset.route = route;
    this.setShell(meta.shell);
    this.routeTitle.textContent = meta.title;
    this.mobileRouteTitle.textContent = meta.shortTitle;
    this.immersiveTitle.textContent = meta.title;
    this.immersiveStatus.textContent = meta.initialStatus;
    const concealMobileAccount = route === 'login';
    this.mobileAccountLink.classList.toggle('is-concealed', concealMobileAccount);
    this.mobileAccountLink.tabIndex = concealMobileAccount ? -1 : 0;
    if (concealMobileAccount) {
      this.mobileAccountLink.setAttribute('aria-hidden', 'true');
    } else {
      this.mobileAccountLink.removeAttribute('aria-hidden');
    }
    for (const button of this.root.querySelectorAll<HTMLElement>('[data-nav-route], [data-nav-section]')) {
      const target = button.dataset.navRoute as HudRoute | undefined;
      const section = button.dataset.navSection;
      const isMobileArSection = target === 'ar'
        && meta.section === 'ar'
        && Boolean(button.closest('.mobile-bottom-nav'));
      const active = target === route
        || isMobileArSection
        || (!target && section === meta.section);
      if (active) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    }

    for (const backButton of this.root.querySelectorAll<HTMLButtonElement>('.route-back')) {
      backButton.hidden = route === 'home';
    }
    this.closeCreateMenu();
    this.closeAccountMenu();
  }

  setImmersiveMode(isImmersive: boolean): void {
    this.setShell(isImmersive ? 'immersive' : ROUTES[this.activeRoute].shell);
  }

  setUser(user: AuthUser | null): void {
    this.currentUser = user;
    this.closeAccountMenu();

    if (!user) {
      if (this.sessionNoticeTimer !== null) {
        window.clearTimeout(this.sessionNoticeTimer);
        this.sessionNoticeTimer = null;
      }
      this.sessionNotice.textContent = '';
      this.sessionNotice.hidden = true;
    }

    const displayName = user ? getAccountDisplayName(user) : '';
    for (const trigger of this.accountTriggers) {
      const label = trigger.querySelector<HTMLElement>('.account-trigger-label')!;
      const dot = trigger.querySelector<HTMLElement>('.account-status-dot')!;
      label.textContent = user ? `Hi, ${displayName}` : 'Account';
      dot.hidden = !user;
      trigger.title = user
        ? `Signed in as ${displayName}. Open account menu.`
        : 'Sign in or create an account.';
    }

    this.accountName.textContent = displayName;
    this.accountEmail.textContent = user?.email ?? '';
    this.accountAdminButton.hidden = user?.role !== 'admin' || user.status !== 'active';
  }

  setRestoring(isRestoring: boolean): void {
    this.root.toggleAttribute('data-restoring', isRestoring);
  }

  showSessionNotice(message: string): void {
    if (this.sessionNoticeTimer !== null) {
      window.clearTimeout(this.sessionNoticeTimer);
    }
    this.sessionNotice.textContent = message;
    this.sessionNotice.hidden = false;
    this.sessionNoticeTimer = window.setTimeout(() => {
      this.sessionNotice.hidden = true;
      this.sessionNoticeTimer = null;
    }, 4500);
  }

  openCreateMenu(opener: HTMLButtonElement = this.createTrigger): void {
    this.closeAccountMenu();
    this.createMenuOpener = opener;
    this.createMenu.hidden = false;
    this.createTrigger.setAttribute('aria-expanded', 'true');
    this.mobileCreateTrigger.setAttribute('aria-expanded', 'true');
    this.createMenu.querySelector<HTMLButtonElement>('button')?.focus();
  }

  private handleClick(event: MouseEvent): void {
    const eventTarget = event.target instanceof Element ? event.target : null;
    if (
      !this.accountMenu.hidden
      && !eventTarget?.closest('.account-menu, .account-menu-trigger')
    ) {
      this.closeAccountMenu();
    }

    const target = eventTarget
      ? eventTarget.closest<HTMLButtonElement>('button')
      : null;
    if (!target) {
      return;
    }

    if (target.matches('.route-back, .immersive-exit')) {
      this.handlers.onBack();
      return;
    }
    if (target.matches('.account-menu-trigger')) {
      if (this.accountMenu.hidden) {
        this.openAccountMenu(target);
      } else {
        this.closeAccountMenu();
      }
      return;
    }
    if (target.matches('.account-menu-logout')) {
      this.closeAccountMenu();
      this.handlers.onLogout();
      return;
    }
    if (target.matches('.account-menu-admin')) {
      this.closeAccountMenu();
      this.handlers.onNavigate('admin');
      return;
    }
    if (target.matches('.create-menu-trigger, .mobile-create-trigger')) {
      if (this.createMenu.hidden) {
        this.openCreateMenu(target);
      } else {
        this.closeCreateMenu();
      }
      return;
    }

    const route = target.dataset.navRoute as HudRoute | undefined;
    if (route) {
      this.handlers.onNavigate(route);
      this.closeCreateMenu();
    }
  }

  private closeCreateMenu(): void {
    this.createMenu.hidden = true;
    this.createTrigger.setAttribute('aria-expanded', 'false');
    this.mobileCreateTrigger.setAttribute('aria-expanded', 'false');
    this.createMenuOpener = null;
  }

  private openAccountMenu(opener: HTMLButtonElement): void {
    if (!this.currentUser) {
      this.handlers.onNavigate('login');
      return;
    }

    this.closeCreateMenu();
    this.accountMenuOpener = opener;
    this.accountMenu.hidden = false;
    for (const trigger of this.accountTriggers) {
      trigger.setAttribute('aria-expanded', String(trigger === opener));
    }
    const initialFocus = this.accountAdminButton.hidden
      ? this.accountLogoutButton
      : this.accountAdminButton;
    initialFocus.focus();
  }

  private closeAccountMenu(restoreFocus = false): void {
    const opener = this.accountMenuOpener;
    this.accountMenu.hidden = true;
    for (const trigger of this.accountTriggers) {
      trigger.setAttribute('aria-expanded', 'false');
    }
    this.accountMenuOpener = null;
    if (restoreFocus) {
      opener?.focus();
    }
  }

  private setShell(shell: 'standard' | 'immersive'): void {
    this.root.dataset.shell = shell;
    this.root.querySelector<HTMLElement>('.app-header')!.setAttribute(
      'aria-hidden',
      String(shell === 'immersive'),
    );
  }
}
