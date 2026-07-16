interface DialogOptions {
  initialFocus?: HTMLElement;
  onClose(): void;
}

const focusableSelector = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function openDialog(dialog: HTMLElement, options: DialogOptions): () => void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let released = false;

  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.tabIndex = -1;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      options.onClose();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }

    const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
      .filter((element) => !element.closest('.hidden'));
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onClick = (event: MouseEvent): void => {
    if (event.target === dialog) {
      options.onClose();
    }
  };

  dialog.addEventListener('keydown', onKeyDown);
  dialog.addEventListener('click', onClick);
  (options.initialFocus ?? dialog.querySelector<HTMLElement>(focusableSelector) ?? dialog).focus();

  return () => {
    if (released) {
      return;
    }
    released = true;
    dialog.removeEventListener('keydown', onKeyDown);
    dialog.removeEventListener('click', onClick);
    if (opener?.isConnected) {
      opener.focus();
    }
  };
}
