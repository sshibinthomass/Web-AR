import { describe, expect, it, vi } from 'vitest';
import { ApplicationShell } from '../../src/ui/ApplicationShell';

const activeUser = {
  email: 'maker@example.com',
  name: 'Maya Stone',
  role: 'user' as const,
  status: 'active' as const,
};

const adminUser = {
  email: 'admin@example.com',
  name: 'Alex Admin',
  role: 'admin' as const,
  status: 'active' as const,
};

describe('ApplicationShell', () => {
  it('renders labelled desktop and mobile navigation with one active section', () => {
    const host = document.createElement('div');
    const onNavigate = vi.fn();
    const shell = new ApplicationShell(host, {
      onNavigate,
      onBack: vi.fn(),
      onLogout: vi.fn(),
    });

    shell.setRoute('models');

    expect(shell.pageHost.tagName).toBe('MAIN');
    expect(host.querySelector('.app-route-title')?.textContent).toBe('Models');
    expect(host.querySelector('[data-nav-route="models"]')?.getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('.mobile-bottom-nav')?.getAttribute('aria-label')).toBe('Primary');
    expect(host.querySelectorAll('[aria-current="page"]')).toHaveLength(2);
  });

  it('opens one creation menu and routes from a labelled action', () => {
    const host = document.createElement('div');
    const onNavigate = vi.fn();
    const shell = new ApplicationShell(host, {
      onNavigate,
      onBack: vi.fn(),
      onLogout: vi.fn(),
    });

    shell.openCreateMenu();

    const menu = host.querySelector<HTMLElement>('.create-menu')!;
    expect(menu.hidden).toBe(false);
    expect(host.querySelector<HTMLButtonElement>('.create-menu-trigger')?.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector<HTMLButtonElement>('.mobile-create-trigger')?.getAttribute('aria-expanded')).toBe('true');

    menu.querySelector<HTMLButtonElement>('[data-nav-route="speech"]')?.click();

    expect(onNavigate).toHaveBeenCalledWith('speech');
    expect(menu.hidden).toBe(true);
  });

  it('returns Create menu focus to the trigger that opened it', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    new ApplicationShell(host, {
      onNavigate: vi.fn(),
      onBack: vi.fn(),
      onLogout: vi.fn(),
    });
    const mobileTrigger = host.querySelector<HTMLButtonElement>('.mobile-create-trigger')!;
    const menu = host.querySelector<HTMLElement>('.create-menu')!;

    mobileTrigger.click();
    expect(menu.hidden).toBe(false);

    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    const activeElement = document.activeElement;
    host.remove();
    expect(menu.hidden).toBe(true);
    expect(activeElement).toBe(mobileTrigger);
    expect(mobileTrigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('changes both account triggers to Hi, Name and opens one shared menu', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shell = new ApplicationShell(host, {
      onNavigate: vi.fn(),
      onBack: vi.fn(),
      onLogout: vi.fn(),
    });

    shell.setUser(activeUser);

    const triggers = [...host.querySelectorAll<HTMLButtonElement>('.account-menu-trigger')];
    expect(triggers.map((trigger) => trigger.textContent?.trim())).toEqual([
      'Hi, Maya Stone',
      'Hi, Maya Stone',
    ]);

    const mobileTrigger = host.querySelector<HTMLButtonElement>('.mobile-account-link')!;
    mobileTrigger.click();

    const menu = host.querySelector<HTMLElement>('.account-menu')!;
    expect(menu.hidden).toBe(false);
    expect(mobileTrigger.getAttribute('aria-expanded')).toBe('true');
    expect(menu.querySelector('.account-menu-name')?.textContent).toBe('Maya Stone');
    expect(menu.querySelector('.account-menu-email')?.textContent).toBe('maker@example.com');
    expect(document.activeElement).toBe(menu.querySelector('.account-menu-logout'));
    host.remove();
  });

  it('routes guests to Login instead of opening an empty account menu', () => {
    const host = document.createElement('div');
    const onNavigate = vi.fn();
    const shell = new ApplicationShell(host, {
      onNavigate,
      onBack: vi.fn(),
      onLogout: vi.fn(),
    });

    shell.setUser(null);
    host.querySelector<HTMLButtonElement>('.mobile-account-link')?.click();

    expect(onNavigate).toHaveBeenCalledWith('login');
    expect(host.querySelector<HTMLElement>('.account-menu')?.hidden).toBe(true);
  });

  it('makes Admin and Log out available from the shared mobile menu', () => {
    const host = document.createElement('div');
    const onNavigate = vi.fn();
    const onLogout = vi.fn();
    const shell = new ApplicationShell(host, {
      onNavigate,
      onBack: vi.fn(),
      onLogout,
    });
    shell.setUser(adminUser);

    host.querySelector<HTMLButtonElement>('.mobile-account-link')?.click();
    host.querySelector<HTMLButtonElement>('.account-menu-admin')?.click();
    expect(onNavigate).toHaveBeenCalledWith('admin');

    host.querySelector<HTMLButtonElement>('.mobile-account-link')?.click();
    host.querySelector<HTMLButtonElement>('.account-menu-logout')?.click();
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('closes the account menu on Escape and restores the actual opener', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shell = new ApplicationShell(host, {
      onNavigate: vi.fn(),
      onBack: vi.fn(),
      onLogout: vi.fn(),
    });
    shell.setUser(activeUser);
    const mobileTrigger = host.querySelector<HTMLButtonElement>('.mobile-account-link')!;
    const menu = host.querySelector<HTMLElement>('.account-menu')!;

    mobileTrigger.click();
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(mobileTrigger);
    host.remove();
  });

  it('closes the account menu when another page area is activated', () => {
    const host = document.createElement('div');
    const shell = new ApplicationShell(host, {
      onNavigate: vi.fn(),
      onBack: vi.fn(),
      onLogout: vi.fn(),
    });
    shell.setUser(activeUser);
    const menu = host.querySelector<HTMLElement>('.account-menu')!;

    host.querySelector<HTMLButtonElement>('.mobile-account-link')?.click();
    host.querySelector<HTMLElement>('.app-page-host')?.click();

    expect(menu.hidden).toBe(true);
  });

  it('clears the signed-in notice when the session becomes signed out', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    const shell = new ApplicationShell(host, {
      onNavigate: vi.fn(),
      onBack: vi.fn(),
      onLogout: vi.fn(),
    });
    shell.setUser(activeUser);
    shell.showSessionNotice('Welcome back, Maya Stone.');

    shell.setUser(null);

    const notice = host.querySelector<HTMLElement>('.session-notice')!;
    expect(notice.hidden).toBe(true);
    expect(notice.textContent).toBe('');
    vi.useRealTimers();
  });

  it('uses immersive chrome without standard navigation', () => {
    const host = document.createElement('div');
    const onBack = vi.fn();
    const shell = new ApplicationShell(host, {
      onNavigate: vi.fn(),
      onBack,
      onLogout: vi.fn(),
    });

    shell.setRoute('camera');

    expect(host.querySelector('.app-shell')?.getAttribute('data-shell')).toBe('immersive');
    expect(host.querySelector('.immersive-title')?.textContent).toBe('Camera capture');
    expect(host.querySelector('.app-header')?.getAttribute('aria-hidden')).toBe('true');

    host.querySelector<HTMLButtonElement>('.immersive-exit')?.click();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('can switch a standard route into and back out of live immersive mode', () => {
    const host = document.createElement('div');
    const shell = new ApplicationShell(host, {
      onNavigate: vi.fn(),
      onBack: vi.fn(),
      onLogout: vi.fn(),
    });

    shell.setRoute('ar');
    expect(host.querySelector('.app-shell')?.getAttribute('data-shell')).toBe('standard');

    shell.setImmersiveMode(true);
    expect(host.querySelector('.app-shell')?.getAttribute('data-shell')).toBe('immersive');
    expect(host.querySelector('.app-header')?.getAttribute('aria-hidden')).toBe('true');

    shell.setImmersiveMode(false);
    expect(host.querySelector('.app-shell')?.getAttribute('data-shell')).toBe('standard');
    expect(host.querySelector('.app-header')?.getAttribute('aria-hidden')).toBe('false');
  });

  it('shows the account-menu administrator action only for an active admin', () => {
    const host = document.createElement('div');
    const shell = new ApplicationShell(host, {
      onNavigate: vi.fn(),
      onBack: vi.fn(),
      onLogout: vi.fn(),
    });
    const adminLink = host.querySelector<HTMLButtonElement>('.account-menu-admin')!;

    shell.setUser(null);
    expect(adminLink.hidden).toBe(true);

    shell.setUser(activeUser);
    expect(adminLink.hidden).toBe(true);

    shell.setUser(adminUser);
    expect(adminLink.hidden).toBe(false);
    expect(host.querySelector('.account-menu-name')?.textContent).toBe(adminUser.name);
  });

  it('conceals the redundant mobile account trigger on Login and restores it elsewhere', () => {
    const host = document.createElement('div');
    const shell = new ApplicationShell(host, {
      onNavigate: vi.fn(),
      onBack: vi.fn(),
      onLogout: vi.fn(),
    });
    const mobileAccountLink = host.querySelector<HTMLButtonElement>('.mobile-account-link')!;

    shell.setRoute('login');

    expect(mobileAccountLink.classList.contains('is-concealed')).toBe(true);
    expect(mobileAccountLink.getAttribute('aria-hidden')).toBe('true');
    expect(mobileAccountLink.tabIndex).toBe(-1);

    shell.setRoute('admin');

    expect(mobileAccountLink.classList.contains('is-concealed')).toBe(false);
    expect(mobileAccountLink.hasAttribute('aria-hidden')).toBe(false);
    expect(mobileAccountLink.tabIndex).toBe(0);
    expect(host.querySelector('.app-route-title')?.textContent).toBe('Admin');
    expect(mobileAccountLink.hasAttribute('aria-current')).toBe(false);
  });
});
