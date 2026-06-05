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
  /**
   * Number of glass panes: 2 (default) or 4.
   *   2 = two sliding leaves (both mobile)
   *   4 = two fixed outer + two sliding inner (janela de correr 4 folhas)
   */
  panes?: 2 | 4
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
    /**
     * Glass color for window panes (hex number).
     * Defaults to 0x88ccee (light blue) if omitted.
     */
    glassColor?: number
    /**
     * Glass opacity: 0.0 (invisible) to 1.0 (opaque).
     * Defaults to 0.25 if omitted.
     */
    glassOpacity?: number
    /**
     * Door leaf color (hex number, e.g. 0x8b6914).
     * Defaults to 0x6b4226 (dark wood) if omitted.
     */
    doorColor?: number
    /**
     * Door leaf opacity: 0.0 (invisible) to 1.0 (opaque).
     * Defaults to 0.85 if omitted.
     */
    doorOpacity?: number
  }
  rooms: Room[]
  walls: Wall[]
}

