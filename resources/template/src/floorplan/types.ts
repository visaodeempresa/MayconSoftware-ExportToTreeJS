export type Vec2 = { x: number; z: number }

export type DoorOpening = {
  kind: 'door'
  /**
   * Offset from wall start (meters).
   */
  offset: number
  width: number
  height: number
}

export type WindowOpening = {
  kind: 'window'
  /**
   * Offset from wall start (meters).
   */
  offset: number
  width: number
  height: number
  /**
   * Elevation from the floor (meters).
   */
  elevation: number
}

export type WallOpening = DoorOpening | WindowOpening

export type Wall = {
  id: string
  from: Vec2
  to: Vec2
  /**
   * If omitted, uses plan defaults.
   */
  thickness?: number
  height?: number
  /**
   * Per-wall color override (hex number, e.g. 0xff0000).
   * If omitted, uses defaults.wallColor.
   */
  color?: number
  openings?: WallOpening[]
}

export type Room = {
  id: string
  name: string
  origin: Vec2
  size: { x: number; z: number }
  floorColor: number
  /**
   * Exact polygon from SH3D. If present, use THREE.Shape for floor geometry.
   * Coordinates are in meters in the XZ plane.
   */
  polygon?: Vec2[]
  zones?: Array<{
    id: string
    name: string
    origin: Vec2
    size: { x: number; z: number }
    color?: number
  }>
}

export type Floorplan = {
  units: 'm'
  defaults: {
    wallHeight: number
    wallThickness: number
    wallColor: number
    floorThickness: number
    /**
     * Wall opacity: 0.0 (fully transparent) to 1.0 (fully opaque).
     * Defaults to 1.0 if omitted.
     */
    wallOpacity?: number
    /**
     * Floor opacity: 0.0 (fully transparent) to 1.0 (fully opaque).
     * Defaults to 1.0 if omitted.
     */
    floorOpacity?: number
  }
  rooms: Room[]
  walls: Wall[]
}

