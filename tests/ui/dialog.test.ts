import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDialog } from '../../src/ui/dialog';

describe('openDialog', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('traps focus, closes on Escape, and restores the opener', () => {
    const opener = document.createElement('button');
    const dialog = document.createElement('div');
    const first = document.createElement('button');
    const last = document.createElement('button');
    dialog.append(first, last);
    document.body.append(opener, dialog);
    opener.focus();
    const onClose = vi.fn();

    const close = openDialog(dialog, { initialFocus: first, onClose });
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(first);

    last.focus();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(first);

    first.focus();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(last);

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledOnce();
    close();
    expect(document.activeElement).toBe(opener);
  });

  it('requests close only when the modal backdrop itself is clicked', () => {
    const dialog = document.createElement('div');
    const panel = document.createElement('div');
    const button = document.createElement('button');
    panel.appendChild(button);
    dialog.appendChild(panel);
    document.body.appendChild(dialog);
    const onClose = vi.fn();
    const close = openDialog(dialog, { onClose });

    panel.click();
    expect(onClose).not.toHaveBeenCalled();

    dialog.click();
    expect(onClose).toHaveBeenCalledOnce();
    close();
  });
});
