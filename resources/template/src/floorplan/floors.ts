import * as THREE from 'three'
import type { Floorplan, Room } from './types'
import { createTextSprite } from '../utils/textSprite'

export function buildFloors(plan: Floorplan) {
  const group = new THREE.Group()
  group.name = 'floors'

  for (const room of plan.rooms) {
    const roomGroup = new THREE.Group()
    roomGroup.name = `room:${room.id}`

    const floor = room.polygon
      ? createPolygonFloor(room, plan)
      : createRoomFloor(room, plan)
    roomGroup.add(floor)

    const outline = createOutline(floor)
    roomGroup.add(outline)

    // Compute label position — centroid of polygon or bbox center
    const labelPos = room.polygon
      ? computePolygonCentroid(room.polygon, plan.defaults.floorThickness)
      : new THREE.Vector3(
          room.origin.x + room.size.x / 2,
          plan.defaults.floorThickness + 0.02,
          room.origin.z + room.size.z / 2,
        )

    const label = createRoomLabel(room)
    label.position.copy(labelPos)
    label.center.set(0.5, 0)
    roomGroup.add(label)

    if (room.zones?.length) {
      for (const zone of room.zones) {
        const zoneFloor = createZoneFloor(zone, plan.defaults.floorThickness)
        zoneFloor.position.set(
          room.origin.x + zone.origin.x + zone.size.x / 2,
          plan.defaults.floorThickness + zoneFloor.userData.topOffsetY,
          room.origin.z + zone.origin.z + zone.size.z / 2,
        )
        roomGroup.add(zoneFloor)

        const zoneOutline = createZoneOutline(zoneFloor)
        roomGroup.add(zoneOutline)

        const zoneLabel = createZoneLabel(zone)
        zoneLabel.position.set(
          room.origin.x + zone.origin.x + zone.size.x / 2,
          plan.defaults.floorThickness + zoneFloor.userData.topOffsetY + 0.03,
          room.origin.z + zone.origin.z + zone.size.z / 2,
        )
        zoneLabel.center.set(0.5, 0)
        roomGroup.add(zoneLabel)
      }
    }

    group.add(roomGroup)
  }

  return group
}

/**
 * Creates a floor mesh from the room's polygon using THREE.Shape + ExtrudeGeometry.
 *
 * THREE.Shape works in a 2D plane (X, Y). We map:
 *   room vertex.x → shape X
 *   room vertex.z → shape Y
 *
 * After extrusion, the geometry extends along the shape's local Z axis.
 * We rotate -90° around X to lay it flat in the XZ plane, then position
 * it at y=0 so the top surface is at y = thickness.
 */
function createPolygonFloor(room: Room, plan: Floorplan): THREE.Mesh {
  const thickness = plan.defaults.floorThickness
  const opacity = plan.defaults.floorOpacity ?? 1.0
  const isTransparent = opacity < 1.0

  const pts = room.polygon!
  const shape = new THREE.Shape()
  shape.moveTo(pts[0].x, pts[0].z)
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i].x, pts[i].z)
  }
  shape.closePath()

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
  })

  const mat = new THREE.MeshStandardMaterial({
    color: room.floorColor,
    roughness: 0.95,
    metalness: 0.0,
    transparent: isTransparent,
    opacity,
    side: isTransparent ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: !isTransparent,
  })

  const mesh = new THREE.Mesh(geom, mat)
  mesh.receiveShadow = true

  // Rotate so extruded shape lies flat on the XZ plane.
  // THREE.Shape XY maps to: shape.X → world X, shape.Y → world Z (via rotation).
  // With +π/2 rotation: world Z = +shape.Y = +vertex.z (correct orientation).
  // Geometry spans y = -thickness..0 after rotation; offset to y = 0..thickness.
  mesh.rotation.x = Math.PI / 2
  mesh.position.y = thickness

  return mesh
}

/**
 * Computes the centroid of a polygon for label placement.
 */
function computePolygonCentroid(polygon: Array<{ x: number; z: number }>, floorThickness: number): THREE.Vector3 {
  let cx = 0
  let cz = 0
  for (const p of polygon) {
    cx += p.x
    cz += p.z
  }
  cx /= polygon.length
  cz /= polygon.length
  return new THREE.Vector3(cx, floorThickness + 0.02, cz)
}

/**
 * Creates a rectangular floor using BoxGeometry (fallback for rooms without polygon data).
 */
function createRoomFloor(room: Room, plan: Floorplan) {
  const thickness = plan.defaults.floorThickness
  const opacity = plan.defaults.floorOpacity ?? 1.0
  const isTransparent = opacity < 1.0

  const geom = new THREE.BoxGeometry(room.size.x, thickness, room.size.z)
  const mat = new THREE.MeshStandardMaterial({
    color: room.floorColor,
    roughness: 0.95,
    metalness: 0.0,
    transparent: isTransparent,
    opacity,
    side: isTransparent ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: !isTransparent,
  })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.receiveShadow = true
  mesh.position.set(room.origin.x + room.size.x / 2, thickness / 2, room.origin.z + room.size.z / 2)
  return mesh
}

function createOutline(mesh: THREE.Mesh) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, 30)
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0x0a0e1a, transparent: true, opacity: 0.85 }),
  )
  line.position.copy(mesh.position)
  line.quaternion.copy(mesh.quaternion)
  line.renderOrder = 1
  return line
}

function createRoomLabel(room: Room) {
  const lines = [
    room.name,
    `${room.size.x.toFixed(1)}m × ${room.size.z.toFixed(1)}m`,
  ]
  const sprite = createTextSprite({
    lines,
  })
  sprite.renderOrder = 10
  return sprite
}

function createZoneFloor(
  zone: NonNullable<Room['zones']>[number],
  floorThickness: number,
): THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> {
  const overlayThickness = Math.min(0.015, floorThickness * 0.35)
  const geom = new THREE.BoxGeometry(zone.size.x, overlayThickness, zone.size.z)
  const mat = new THREE.MeshStandardMaterial({
    color: zone.color ?? 0x2448a6,
    roughness: 0.95,
    metalness: 0.0,
    transparent: true,
    opacity: 0.9,
  })
  const mesh = new THREE.Mesh(geom, mat)
  mesh.receiveShadow = false

  // Store how far above the base top surface the overlay starts.
  // Base top surface is at y = floorThickness (since the base floor is centered at floorThickness/2).
  mesh.userData.topOffsetY = overlayThickness / 2 + 0.002
  return mesh
}

function createZoneOutline(zoneFloor: THREE.Mesh) {
  const edges = new THREE.EdgesGeometry(zoneFloor.geometry, 20)
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0x0a0e1a, transparent: true, opacity: 0.75 }),
  )
  line.position.copy(zoneFloor.position)
  line.quaternion.copy(zoneFloor.quaternion)
  line.renderOrder = 6
  return line
}

function createZoneLabel(zone: NonNullable<Room['zones']>[number]) {
  const lines = [
    zone.name,
    `${zone.size.x.toFixed(1)}m × ${zone.size.z.toFixed(1)}m`,
  ]
  const sprite = createTextSprite({
    lines,
    background: 'rgba(10, 14, 26, 0.55)',
  })
  sprite.renderOrder = 10
  return sprite
}
