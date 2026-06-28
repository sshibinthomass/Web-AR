export class AnchorManager {
  private anchor: XRAnchor | null = null;

  get currentAnchor(): XRAnchor | null {
    return this.anchor;
  }

  async createAnchor(frame: XRFrame, pose: XRPose, space: XRSpace): Promise<XRAnchor | null> {
    const createAnchor = frame.createAnchor?.bind(frame);
    if (!createAnchor) {
      this.anchor = null;
      return null;
    }

    try {
      this.anchor = await createAnchor(pose.transform, space);
      return this.anchor;
    } catch {
      this.anchor = null;
      return null;
    }
  }

  clear(): void {
    this.anchor?.delete();
    this.anchor = null;
  }
}
