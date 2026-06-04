import * as THREE from 'three'

export function installResizeHandler({
  renderer,
  camera,
  canvas,
}: {
  renderer: THREE.WebGLRenderer
  camera: THREE.PerspectiveCamera
  canvas: HTMLCanvasElement
}) {
  const resize = () => {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    renderer.setSize(width, height, false)
    camera.aspect = Math.max(width, 1) / Math.max(height, 1)
    camera.updateProjectionMatrix()
  }

  resize()
  const obs = new ResizeObserver(resize)
  obs.observe(canvas)
  window.addEventListener('orientationchange', resize)
  window.addEventListener('resize', resize)

  return () => {
    obs.disconnect()
    window.removeEventListener('orientationchange', resize)
    window.removeEventListener('resize', resize)
  }
}
