export interface XRSupportStatus {
  supportsImmersiveAR: boolean;
}

export async function checkXRSupport(): Promise<XRSupportStatus> {
  const xr = navigator.xr;

  return {
    supportsImmersiveAR: xr ? await xr.isSessionSupported('immersive-ar') : false,
  };
}
