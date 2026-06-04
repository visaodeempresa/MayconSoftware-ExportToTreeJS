import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createRenderer } from './scene/renderer'
import { createCamera } from './scene/camera'
import { createLights } from './scene/lights'
import { createHelpers } from './scene/helpers'
import { installResizeHandler } from './scene/resize'
import { createApartmentFloorplan } from './floorplan/generate'
import { apartmentPlan } from './floorplan/model'

export type AppOptions = {
  canvas: HTMLCanvasElement
}

export function startApp({ canvas }: AppOptions) {
  const renderer = createRenderer(canvas)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#0b1020')

  const camera = createCamera()
  camera.position.set(12, 10, 12)
  camera.lookAt(0, 0, 0)

  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.set(6, 0, 4)
  controls.update()

  const lights = createLights()
  scene.add(lights)

  const helpers = createHelpers({
    showAxes: true,
    showGrid: true,
    gridSize: 40,
    gridDivisions: 40,
  })
  scene.add(helpers)

  const { group, bounds } = createApartmentFloorplan(apartmentPlan)
  scene.add(group)

  // Frame the plan a bit better
  controls.target.set(bounds.center.x, 0, bounds.center.z)
  camera.position.set(bounds.center.x + bounds.size.x * 0.9, 10, bounds.center.z + bounds.size.z)
  camera.lookAt(bounds.center.x, 0, bounds.center.z)
  controls.update()

  installResizeHandler({ renderer, camera, canvas })

  const clock = new THREE.Clock()
  function animate() {
    clock.getDelta()
    controls.update()
    renderer.render(scene, camera)
    requestAnimationFrame(animate)
  }
  animate()
}
