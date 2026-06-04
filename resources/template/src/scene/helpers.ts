import * as THREE from 'three'

export type HelpersOptions = {
  showGrid: boolean
  showAxes: boolean
  gridSize: number
  gridDivisions: number
}

export function createHelpers(opts: HelpersOptions) {
  const group = new THREE.Group()

  if (opts.showGrid) {
    const grid = new THREE.GridHelper(opts.gridSize, opts.gridDivisions, 0x3a3f58, 0x262a3d)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.65
    group.add(grid)
  }

  if (opts.showAxes) {
    const axes = new THREE.AxesHelper(2.5)
    axes.position.set(0, 0.01, 0)
    group.add(axes)
  }

  return group
}
