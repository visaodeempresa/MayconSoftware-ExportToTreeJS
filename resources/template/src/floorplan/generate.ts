import * as THREE from 'three'
import type { Floorplan } from './types'
import { buildFloors } from './floors'
import { buildWalls } from './walls'

export type PlanBounds = {
  min: THREE.Vector3
  max: THREE.Vector3
  size: THREE.Vector3
  center: THREE.Vector3
}

export function createApartmentFloorplan(plan: Floorplan): { group: THREE.Group; bounds: PlanBounds } {
  const group = new THREE.Group()
  group.name = 'floorplan'

  const floors = buildFloors(plan)
  const walls = buildWalls(plan)
  group.add(floors)
  group.add(walls)

  group.position.y = 0.01

  const bounds = computeBounds(group)
  return { group, bounds }
}

function computeBounds(root: THREE.Object3D): PlanBounds {
  const box = new THREE.Box3().setFromObject(root)
  const min = box.min.clone()
  const max = box.max.clone()
  const size = new THREE.Vector3().subVectors(max, min)
  const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5)
  return { min, max, size, center }
}
