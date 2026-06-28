export function resolvePublicAssetUrl(assetPath: string, baseUrl = '/'): string {
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const cleanPath = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;
  return `${cleanBase}${cleanPath}`;
}

type ResolveModelUrlOptions = {
  configuredUrl?: string;
  fallbackAssetPath: string;
  baseUrl?: string;
};

export function resolveModelUrl({ configuredUrl, fallbackAssetPath, baseUrl }: ResolveModelUrlOptions): string {
  const cleanConfiguredUrl = configuredUrl?.trim();

  if (cleanConfiguredUrl) {
    return cleanConfiguredUrl;
  }

  return resolvePublicAssetUrl(fallbackAssetPath, baseUrl);
}
