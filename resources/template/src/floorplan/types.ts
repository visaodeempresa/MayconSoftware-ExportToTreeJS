export type Vec2 = { x: number; z: number }

export type DoorOpening = {
  kind: 'door'
  offset: number
  width: number
  height: number
}

export type WindowOpening = {
  kind: 'window'
  offset: number
  width: number
  height: number
  elevation: number
}

export type WallOpening = DoorOpening | WindowOpening

export type Wall = {
  id: string
  from: Vec2
  to: Vec2
  thickness?: number
  height?: number
  openings?: WallOpening[]
}

export type Room = {
  id: string
  name: string
  origin: Vec2
  size: { x: number; z: number }
  floorColor: number
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
  }
  rooms: Room[]
  walls: Wall[]
}
