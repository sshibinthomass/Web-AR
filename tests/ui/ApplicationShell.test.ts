import { describe, expect, it, vi } from 'vitest';
import { ApplicationShell } from '../../src/ui/ApplicationShell';

const adminUser = {
  email: 'admin@example.com',
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

  it('shows administrator navigation only for an active admin', () => {
    const host = document.createElement('div');
    const shell = new ApplicationShell(host, {
      onNavigate: vi.fn(),
      onBack: vi.fn(),
      onLogout: vi.fn(),
    });
    const adminLink = host.querySelector<HTMLButtonElement>('.shell-admin')!;

    shell.setUser(null);
    expect(adminLink.hidden).toBe(true);

    shell.setUser(adminUser);
    expect(adminLink.hidden).toBe(false);
    expect(host.querySelector('.shell-identity')?.textContent).toBe(adminUser.email);
  });

  it('avoids duplicate account destinations and marks only the exact admin route current', () => {
    const host = document.createElement('div');
    const shell = new ApplicationShell(host, {
      onNavigate: vi.fn(),
      onBack: vi.fn(),
      onLogout: vi.fn(),
    });
    const mobileAccountLink = host.querySelector<HTMLButtonElement>('.mobile-account-link')!;
    const desktopAccountLink = host.querySelector<HTMLButtonElement>(
      '.shell-account [data-nav-route="login"]',
    )!;
    const adminLink = host.querySelector<HTMLButtonElement>('.shell-admin')!;

    shell.setRoute('login');

    expect(mobileAccountLink.classList.contains('is-concealed')).toBe(true);
    expect(mobileAccountLink.getAttribute('aria-hidden')).toBe('true');
    expect(mobileAccountLink.tabIndex).toBe(-1);

    shell.setRoute('admin');

    expect(mobileAccountLink.classList.contains('is-concealed')).toBe(false);
    expect(mobileAccountLink.hasAttribute('aria-hidden')).toBe(false);
    expect(mobileAccountLink.tabIndex).toBe(0);
    expect(desktopAccountLink.hasAttribute('aria-current')).toBe(false);
    expect(adminLink.getAttribute('aria-current')).toBe('page');
  });
});
