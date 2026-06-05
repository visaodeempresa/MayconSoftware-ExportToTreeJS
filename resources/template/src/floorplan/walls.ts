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

  const glassColor = plan.defaults.glassColor ?? 0x88ccee
  const glassOpacity = plan.defaults.glassOpacity ?? 0.25
  const glassMat = new THREE.MeshStandardMaterial({
    color: glassColor,
    transparent: true,
    opacity: glassOpacity,
    roughness: 0.05,
    metalness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  })

  const doorColor = plan.defaults.doorColor ?? 0x6b4226
  const doorOpacity = plan.defaults.doorOpacity ?? 0.85
  const doorMat = new THREE.MeshStandardMaterial({
    color: doorColor,
    roughness: 0.6,
    metalness: 0.0,
    transparent: doorOpacity < 1.0,
    opacity: doorOpacity,
    side: THREE.DoubleSide,
  })

  for (const wall of plan.walls) {
    const mat = wall.color != null ? baseMat.clone() : baseMat
    if (wall.color != null) mat.color.set(wall.color)
    const wallGroup = buildWall(wall, plan, mat, glassMat, doorMat)
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
  /** Number of glass panes for windows: 2 or 4. Undefined for doors. */
  panes?: 2 | 4
}

function resolveOpenings(openings: WallOpening[]): ResolvedOpening[] {
  return openings.map((o) => {
    if (o.kind === 'door') {
      return { offset: o.offset, width: o.width, bottom: 0, top: o.height }
    }
    // window
    return {
      offset: o.offset, width: o.width,
      bottom: o.elevation, top: o.elevation + o.height,
      panes: o.panes ?? 2,
    }
  })
}

function buildWall(
  wall: Wall,
  plan: Floorplan,
  material: THREE.MeshStandardMaterial,
  glassMaterial: THREE.MeshStandardMaterial,
  doorMaterial: THREE.MeshStandardMaterial,
) {
  const group = new THREE.Group()

  const height = wall.height ?? plan.defaults.wallHeight
  const thickness = wall.thickness ?? plan.defaults.wallThickness

  const from = new THREE.Vector3(wall.from.x, 0, wall.from.z)
  const to = new THREE.Vector3(wall.to.x, 0, wall.to.z)
  const dir = new THREE.Vector3().subVectors(to, from)
  const len = dir.length()
  if (len < 1e-6) return group
  dir.normalize()

  const angleY = Math.atan2(-dir.z, dir.x)

  const rawOpenings = (wall.openings ?? []).filter((o) => o.width > 0 && o.height > 0)
  const openings = resolveOpenings(rawOpenings).sort((a, b) => a.offset - b.offset)

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

    // ── Window leaves for windows (openings with elevation > 0) ──
    if (op.bottom > 1e-4 && right > left + 1e-4) {
      const windowHeight = op.top - op.bottom
      if (windowHeight > 1e-4) {
        const leaves = op.panes === 4
          ? createWindow4Panes(from, dir, left, right, windowHeight, angleY, glassMaterial, op.bottom)
          : createWindow2Panes(from, dir, left, right, windowHeight, angleY, glassMaterial, op.bottom)
        for (const leaf of leaves) group.add(leaf)
      }
    }

    // ── Door leaf for doors (openings at floor level) ──
    if (op.bottom < 1e-4 && right > left + 1e-4) {
      const doorHeight = op.top
      if (doorHeight > 1e-4) {
        group.add(createDoorLeaf(from, dir, left, right, doorHeight, thickness, angleY, doorMaterial))
      }
    }

    cursor = Math.max(cursor, right)
  }

  // Wall segment after all openings
  if (len > cursor + 1e-4) {
    group.add(createWallPiece(from, dir, cursor, len, height, thickness, angleY, material))
  }

  // Outline edges for wall meshes (skip glass panes and doors)
  const wallMeshes = group.children.filter(
    (obj): obj is THREE.Mesh => obj instanceof THREE.Mesh && !obj.userData.isGlass && !obj.userData.isDoor,
  )
  for (const obj of wallMeshes) {
    const edges = new THREE.EdgesGeometry(obj.geometry, 22)
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x0a0e1a, transparent: true, opacity: 0.6 }),
    )
    line.position.copy(obj.position)
    line.quaternion.copy(obj.quaternion)
    group.add(line)
  }

  // Subtle outline for glass panes
  const glassMeshes = group.children.filter(
    (obj): obj is THREE.Mesh => obj instanceof THREE.Mesh && obj.userData.isGlass === true,
  )
  for (const obj of glassMeshes) {
    const edges = new THREE.EdgesGeometry(obj.geometry, 10)
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x4499bb, transparent: true, opacity: 0.4 }),
    )
    line.position.copy(obj.position)
    line.quaternion.copy(obj.quaternion)
    group.add(line)
  }

  // Outline for door leaves
  const doorMeshes = group.children.filter(
    (obj): obj is THREE.Mesh => obj instanceof THREE.Mesh && obj.userData.isDoor === true,
  )
  for (const obj of doorMeshes) {
    const edges = new THREE.EdgesGeometry(obj.geometry, 15)
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x3a2211, transparent: true, opacity: 0.5 }),
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

/**
 * Creates a 2-pane sliding window (both panes mobile):
 *   [ Abre←Esq | Abre→Dir ]
 *
 * Left pane slides left, right pane slides right.
 * Each pane on a separate track for depth separation.
 */
function createWindow2Panes(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  a: number,
  b: number,
  height: number,
  angleY: number,
  material: THREE.MeshStandardMaterial,
  yOffset: number,
): THREE.Mesh[] {
  const totalWidth = Math.max(b - a, 0)
  const halfWidth = totalWidth / 2
  const glassThickness = 0.006
  const slideAmount = halfWidth * 0.35
  const trackOffset = glassThickness * 2.5

  const meshes: THREE.Mesh[] = []
  const wallNormal = new THREE.Vector3(-dir.z, 0, dir.x)

  const createPane = (centerAlongWall: number, zOffset: number, paneWidth: number): THREE.Mesh => {
    const geom = new THREE.BoxGeometry(paneWidth, height, glassThickness)
    const mesh = new THREE.Mesh(geom, material)
    mesh.userData.isGlass = true
    const pos = new THREE.Vector3()
      .copy(origin)
      .addScaledVector(dir, centerAlongWall)
      .addScaledVector(wallNormal, zOffset)
      .setY(yOffset + height / 2)
    mesh.position.copy(pos)
    mesh.rotation.y = angleY
    return mesh
  }

  // Left pane: slides left
  meshes.push(createPane(a + halfWidth / 2 - slideAmount, 0, halfWidth))

  // Right pane: slides right (on inner track)
  meshes.push(createPane(a + halfWidth + halfWidth / 2 + slideAmount, trackOffset, halfWidth))

  return meshes
}

/**
 * Creates a 4-pane sliding window:
 *   [ Fixed | Abre←Esq | Abre→Dir | Fixed ]
 *
 * The two outer panes (F) are fixed, flush with the wall plane.
 * The two inner panes (A) slide outward — left slides left, right slides right —
 * on a second track slightly offset from the wall.
 */
function createWindow4Panes(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  a: number,
  b: number,
  height: number,
  angleY: number,
  material: THREE.MeshStandardMaterial,
  yOffset: number,
): THREE.Mesh[] {
  const totalWidth = Math.max(b - a, 0)
  const quarterWidth = totalWidth / 4
  const glassThickness = 0.006
  const slideAmount = quarterWidth * 0.7
  const trackOffset = glassThickness * 2.5

  const meshes: THREE.Mesh[] = []
  const wallNormal = new THREE.Vector3(-dir.z, 0, dir.x)

  const createPane = (centerAlongWall: number, zOffset: number): THREE.Mesh => {
    const geom = new THREE.BoxGeometry(quarterWidth, height, glassThickness)
    const mesh = new THREE.Mesh(geom, material)
    mesh.userData.isGlass = true
    const pos = new THREE.Vector3()
      .copy(origin)
      .addScaledVector(dir, centerAlongWall)
      .addScaledVector(wallNormal, zOffset)
      .setY(yOffset + height / 2)
    mesh.position.copy(pos)
    mesh.rotation.y = angleY
    return mesh
  }

  // 1. Fixed left (flush with wall)
  meshes.push(createPane(a + quarterWidth * 0.5, 0))

  // 2. Abre←Esq (slides left toward fixed-left, on inner track)
  meshes.push(createPane(a + quarterWidth * 1.5 - slideAmount, trackOffset))

  // 3. Abre→Dir (slides right toward fixed-right, on inner track)
  meshes.push(createPane(a + quarterWidth * 2.5 + slideAmount, trackOffset))

  // 4. Fixed right (flush with wall)
  meshes.push(createPane(a + quarterWidth * 3.5, 0))

  return meshes
}

/**
 * Creates a door leaf inside a door opening.
 * The leaf is a thin panel (3cm) hinged on the left edge,
 * rotated 30° inward to show the door is ajar.
 */
function createDoorLeaf(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  a: number,
  b: number,
  height: number,
  _wallThickness: number,
  angleY: number,
  material: THREE.MeshStandardMaterial,
) {
  const doorWidth = Math.max(b - a, 0)
  const doorThickness = 0.03 // 3cm thick door
  const swingAngle = Math.PI / 6 // 30° ajar

  // Geometry centered at origin — we'll offset the pivot to the hinge edge
  const geom = new THREE.BoxGeometry(doorWidth, height, doorThickness)
  // Shift geometry so the left edge is at x=0 (hinge point)
  geom.translate(doorWidth / 2, 0, 0)

  const mesh = new THREE.Mesh(geom, material)
  mesh.userData.isDoor = true
  mesh.castShadow = true

  // Position at the hinge point (left edge of the opening)
  const hingePos = new THREE.Vector3()
    .copy(origin)
    .addScaledVector(dir, a)
    .setY(height / 2)

  mesh.position.copy(hingePos)
  // Rotate to align with wall, then swing open
  mesh.rotation.y = angleY - swingAngle
  return mesh
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}
