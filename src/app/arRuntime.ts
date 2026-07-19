import * as THREE from 'three';
import { GestureController } from '../interaction/GestureController';
import { ObjectTransformController } from '../interaction/ObjectTransformController';
import { SpatialMotionController } from '../interaction/SpatialMotionController';
import {
  classifyPlacementGesture,
  type PlacementGestureZone,
} from '../interaction/PlacementGestureZone';
import { createScene, type SceneContext } from '../scene/createScene';
import { LayoutSceneManager } from '../scene/LayoutSceneManager';
import { screenPointToFloorPoint, type Point2 } from '../utils/math';
import { HitTestManager } from '../xr/HitTestManager';
import { AnchorManager } from '../xr/AnchorManager';
import { PoseStabilizer } from '../xr/PoseStabilizer';
import { checkXRSupport } from '../xr/XRSupport';
import { createARSessionButton } from '../xr/XRSessionManager';
import { EstimatedLightingController } from '../xr/EstimatedLightingController';
import { XREstimatedLight } from 'three/addons/webxr/XREstimatedLight.js';

export const arRuntime = {
  THREE,
  GestureController,
  ObjectTransformController,
  SpatialMotionController,
  classifyPlacementGesture,
  LayoutSceneManager,
  createScene,
  screenPointToFloorPoint,
  HitTestManager,
  AnchorManager,
  PoseStabilizer,
  checkXRSupport,
  createARSessionButton,
  EstimatedLightingController,
  XREstimatedLight,
};

export type ARRuntime = typeof arRuntime;
export type { PlacementGestureZone, Point2, SceneContext };
