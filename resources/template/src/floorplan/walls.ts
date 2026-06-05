import * as THREE from 'three'
import type { Floorplan, Wall, WallOpening } from './types'

export function buildWalls(plan: Floorplan) {
  const group = new THREE.Group()
  group.name = 'walls'

  const opacity = plan.defaults.wallOpacity ?? 1.0
  const isTransparent = opacity < 1.0

  const baseMat = new THREE.MeshStandardMaterial({
    color: plan.defaults.wallColor,
    roughness: 0.85,
    metalness: 0.0,
    transparent: isTransparent,
    opacity,
    side: isTransparent ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: !isTransparent,
  })

  for (const wall of plan.walls) {
    const mat = wall.color != null ? baseMat.clone() : baseMat
    if (wall.color != null) mat.color.set(wall.color)
    const wallGroup = buildWall(wall, plan, mat)
    wallGroup.name = `wall:${wall.id}`
    group.add(wallGroup)
  }

  return group
}

/**
 * Represents a resolved rectangular void in a wall segment.
 * `offset` is distance from wall start along the wall direction.
 */
type ResolvedOpening = {
  offset: number
  width: number
  /** Bottom of the opening (distance from floor). 0 for doors. */
  bottom: number
  /** Top of the opening (distance from floor). */
  top: number
}

function resolveOpenings(openings: WallOpening[]): ResolvedOpening[] {
  return openings.map((o) => {
    if (o.kind === 'door') {
      return { offset: o.offset, width: o.width, bottom: 0, top: o.height }
    }
    // window
    return { offset: o.offset, width: o.width, bottom: o.elevation, top: o.elevation + o.height }
  })
}

function buildWall(wall: Wall, plan: Floorplan, material: THREE.MeshStandardMaterial) {
  const group = new THREE.Group()

  const height = wall.height ?? plan.defaults.wallHeight
  const thickness = wall.thickness ?? plan.defaults.wallThickness

  const from = new THREE.Vector3(wall.from.x, 0, wall.from.z)
  const to = new THREE.Vector3(wall.to.x, 0, wall.to.z)
  const dir = new THREE.Vector3().subVectors(to, from)
  const len = dir.length()
  if (len < 1e-6) return group
  dir.normalize()

  // Rotate the box so its local X-axis aligns with `dir`.
  // Three.js Y-rotation: local X = (cos θ, 0, -sin θ).
  // We need cos θ = dir.x, -sin θ = dir.z → θ = atan2(-dir.z, dir.x).
  const angleY = Math.atan2(-dir.z, dir.x)

  const rawOpenings = (wall.openings ?? []).filter((o) => o.width > 0 && o.height > 0)
  const openings = resolveOpenings(rawOpenings).sort((a, b) => a.offset - b.offset)

  // For each opening, we need to:
  // 1. Fill wall segments to the left/right of openings
  // 2. Fill the lintel above doors (full height above door top)
  // 3. Fill the sill below windows + lintel above windows
  let cursor = 0
  for (const op of openings) {
    const left = clamp(op.offset, 0, len)
    const right = clamp(op.offset + op.width, 0, len)

    // Wall segment before this opening
    if (left > cursor + 1e-4) {
      group.add(createWallPiece(from, dir, cursor, left, height, thickness, angleY, material))
    }

    // Below the opening (sill for windows, nothing for doors since bottom=0)
    if (op.bottom > 1e-4 && right > left + 1e-4) {
      group.add(
        createWallPiece(from, dir, left, right, op.bottom, thickness, angleY, material, 0),
      )
    }

    // Above the opening (lintel)
    const topGap = height - op.top
    if (topGap > 1e-4 && right > left + 1e-4) {
      group.add(
        createWallPiece(from, dir, left, right, topGap, thickness, angleY, material, op.top),
      )
    }

    cursor = Math.max(cursor, right)
  }

  // Wall segment after all openings
  if (len > cursor + 1e-4) {
    group.add(createWallPiece(from, dir, cursor, len, height, thickness, angleY, material))
  }

  // Outline edges for each mesh
  for (const obj of group.children) {
    if (!(obj instanceof THREE.Mesh)) continue
    const edges = new THREE.EdgesGeometry(obj.geometry, 22)
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x0a0e1a, transparent: true, opacity: 0.6 }),
    )
    line.position.copy(obj.position)
    line.quaternion.copy(obj.quaternion)
    group.add(line)
  }

  return group
}

function createWallPiece(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  a: number,
  b: number,
  height: number,
  thickness: number,
  angleY: number,
  material: THREE.MeshStandardMaterial,
  yOffset = 0,
) {
  const segLen = Math.max(b - a, 0)
  const geom = new THREE.BoxGeometry(segLen, height, thickness)
  const mesh = new THREE.Mesh(geom, material)
  mesh.castShadow = true
  mesh.receiveShadow = true

  const mid = (a + b) / 2
  const center = new THREE.Vector3()
    .copy(origin)
    .addScaledVector(dir, mid)
    .setY(yOffset + height / 2)

  mesh.position.copy(center)
  mesh.rotation.y = angleY
  return mesh
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}
