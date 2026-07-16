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
});
