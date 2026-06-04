import './style.css'
import { startApp } from './app'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="hud">
    <div class="title">Floorplan 3D</div>
    <div class="hint">Mouse: orbit | Wheel: zoom | Right-drag: pan</div>
  </div>
  <canvas id="scene"></canvas>
`

startApp({
  canvas: document.querySelector<HTMLCanvasElement>('#scene')!,
})
