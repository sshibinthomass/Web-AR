export const DEFAULT_GENERATE_MODEL_API_URL = 'https://web-ar-generate-model.sshibinthomass.workers.dev/generate-3d';

export function getGenerateModelApiUrl(configuredUrl?: string): string {
  const trimmedUrl = configuredUrl?.trim();
  return trimmedUrl || DEFAULT_GENERATE_MODEL_API_URL;
}
