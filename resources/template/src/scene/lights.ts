import * as THREE from 'three'

export function createLights() {
  const group = new THREE.Group()

  const ambient = new THREE.AmbientLight(0xffffff, 0.6)
  group.add(ambient)

  const key = new THREE.DirectionalLight(0xffffff, 1.0)
  key.position.set(15, 18, 10)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.near = 1
  key.shadow.camera.far = 80
  key.shadow.camera.left = -30
  key.shadow.camera.right = 30
  key.shadow.camera.top = 30
  key.shadow.camera.bottom = -30
  group.add(key)

  const fill = new THREE.DirectionalLight(0xb9d5ff, 0.35)
  fill.position.set(-10, 10, -12)
  group.add(fill)

  return group
}
