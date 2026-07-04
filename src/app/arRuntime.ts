import * as THREE from 'three';
import { GestureController } from '../interaction/GestureController';
import { ObjectTransformController } from '../interaction/ObjectTransformController';
import {
  classifyPlacementGesture,
  rotationDeltaFromVerticalDrag,
  type PlacementGestureZone,
} from '../interaction/PlacementGestureZone';
import { createScene, type SceneContext } from '../scene/createScene';
import { screenPointToFloorPoint, type Point2 } from '../utils/math';
import { HitTestManager } from '../xr/HitTestManager';
import { PlaneTrackingManager } from '../xr/PlaneTrackingManager';
import { checkXRSupport } from '../xr/XRSupport';
import { createARSessionButton } from '../xr/XRSessionManager';

export const arRuntime = {
  THREE,
  GestureController,
  ObjectTransformController,
  classifyPlacementGesture,
  rotationDeltaFromVerticalDrag,
  createScene,
  screenPointToFloorPoint,
  HitTestManager,
  PlaneTrackingManager,
  checkXRSupport,
  createARSessionButton,
};

export type ARRuntime = typeof arRuntime;
export type { PlacementGestureZone, Point2, SceneContext };
