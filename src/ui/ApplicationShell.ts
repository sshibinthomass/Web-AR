import type { AuthUser } from '../services/authClient';
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
  private readonly identity: HTMLElement;
  private readonly adminLink: HTMLButtonElement;
  private readonly logoutButton: HTMLButtonElement;

  constructor(host: HTMLElement, private readonly handlers: ApplicationShellHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'app-shell';
    this.root.innerHTML = `
      <header class="app-header">
        <button class="brand-button" type="button" data-nav-route="home" aria-label="Anima You 3D home">
          <span class="brand-mark" aria-hidden="true"></span>
          <span>Anima You 3D</span>
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
          <span class="shell-identity">Guest</span>
          <button type="button" data-nav-route="login" data-nav-section="account">Account</button>
          <button class="shell-admin" type="button" data-nav-route="admin" hidden>Admin</button>
          <button class="shell-logout" type="button" hidden>Log out</button>
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
        <button class="route-back" type="button">Back</button>
        <strong class="mobile-route-title"></strong>
        <button type="button" data-nav-route="login" data-nav-section="account">Account</button>
      </div>
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
    this.identity = this.root.querySelector<HTMLElement>('.shell-identity')!;
    this.adminLink = this.root.querySelector<HTMLButtonElement>('.shell-admin')!;
    this.logoutButton = this.root.querySelector<HTMLButtonElement>('.shell-logout')!;

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
      if (event.key === 'Escape' && !this.createMenu.hidden) {
        event.preventDefault();
        this.closeCreateMenu();
        this.createTrigger.focus();
      }
    });
  }

  setRoute(route: HudRoute): void {
    const meta = ROUTES[route];
    this.root.dataset.route = route;
    this.root.dataset.shell = meta.shell;
    this.routeTitle.textContent = meta.title;
    this.mobileRouteTitle.textContent = meta.shortTitle;
    this.immersiveTitle.textContent = meta.title;
    this.immersiveStatus.textContent = meta.initialStatus;
    this.root.querySelector<HTMLElement>('.app-header')!.setAttribute(
      'aria-hidden',
      String(meta.shell === 'immersive'),
    );

    for (const button of this.root.querySelectorAll<HTMLElement>('[data-nav-route], [data-nav-section]')) {
      const target = button.dataset.navRoute as HudRoute | undefined;
      const section = button.dataset.navSection;
      const isMobileArSection = target === 'ar'
        && meta.section === 'ar'
        && Boolean(button.closest('.mobile-bottom-nav'));
      const active = target === route || isMobileArSection || section === meta.section;
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
  }

  setUser(user: AuthUser | null): void {
    this.identity.textContent = user ? user.email : 'Guest';
    this.logoutButton.hidden = !user;
    this.adminLink.hidden = user?.role !== 'admin' || user.status !== 'active';
  }

  setRestoring(isRestoring: boolean): void {
    this.root.toggleAttribute('data-restoring', isRestoring);
  }

  openCreateMenu(): void {
    this.createMenu.hidden = false;
    this.createTrigger.setAttribute('aria-expanded', 'true');
    this.mobileCreateTrigger.setAttribute('aria-expanded', 'true');
    this.createMenu.querySelector<HTMLButtonElement>('button')?.focus();
  }

  private handleClick(event: MouseEvent): void {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('button')
      : null;
    if (!target) {
      return;
    }

    if (target.matches('.route-back, .immersive-exit')) {
      this.handlers.onBack();
      return;
    }
    if (target.matches('.shell-logout')) {
      this.handlers.onLogout();
      return;
    }
    if (target.matches('.create-menu-trigger, .mobile-create-trigger')) {
      if (this.createMenu.hidden) {
        this.openCreateMenu();
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
  }
}
