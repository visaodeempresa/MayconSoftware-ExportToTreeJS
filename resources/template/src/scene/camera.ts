import * as THREE from 'three'

export function createCamera() {
  return new THREE.PerspectiveCamera(55, 1, 0.1, 500)
}
