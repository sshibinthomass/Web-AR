export interface XRSupportStatus {
  hasNavigatorXR: boolean;
  supportsImmersiveAR: boolean;
}

export async function checkXRSupport(): Promise<XRSupportStatus> {
  const xr = navigator.xr;
  const supportsImmersiveAR = xr ? await xr.isSessionSupported('immersive-ar') : false;

  return {
    hasNavigatorXR: Boolean(xr),
    supportsImmersiveAR,
  };
}
