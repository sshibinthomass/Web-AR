export interface LayoutVector3 {
  x: number;
  y: number;
  z: number;
}

export interface LayoutObject {
  id: string;
  modelId: string;
  modelLabel: string;
  modelUrl: string;
  transform: {
    position: LayoutVector3;
    rotation: LayoutVector3;
    scale: LayoutVector3;
  };
}
