export type AppMode = 'unsupported' | 'loading' | 'scanning' | 'readyToPlace' | 'placed' | 'editing';

export class AppState {
  mode: AppMode = 'loading';
  modelLoaded = false;
  floorLocked = false;
  lastError: string | null = null;

  setMode(mode: AppMode): void {
    this.mode = mode;
  }

  setError(message: string): void {
    this.lastError = message;
    this.mode = 'unsupported';
  }
}
