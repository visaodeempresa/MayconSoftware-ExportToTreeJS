import * as THREE from 'three'

export type TextSpriteOptions = {
  lines: string[]
  background?: string
  color?: string
  paddingPx?: number
  font?: string
  maxWidthPx?: number
}

export function createTextSprite(opts: TextSpriteOptions) {
  const padding = opts.paddingPx ?? 12
  const font = opts.font ?? '600 22px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto'
  const maxWidth = opts.maxWidthPx ?? 512

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context not available')

  ctx.font = font
  const widths = opts.lines.map((l) => Math.min(ctx.measureText(l).width, maxWidth))
  const lineHeight = 28
  const w = Math.ceil(Math.max(...widths, 10) + padding * 2)
  const h = Math.ceil(opts.lines.length * lineHeight + padding * 2)
  canvas.width = w
  canvas.height = h

  // Background
  ctx.fillStyle = opts.background ?? 'rgba(10, 14, 26, 0.70)'
  roundRect(ctx, 0, 0, w, h, 12)
  ctx.fill()

  // Border
  ctx.strokeStyle = 'rgba(232, 236, 255, 0.18)'
  ctx.lineWidth = 2
  roundRect(ctx, 1, 1, w - 2, h - 2, 11)
  ctx.stroke()

  // Text
  ctx.font = font
  ctx.fillStyle = opts.color ?? 'rgba(232, 236, 255, 0.96)'
  ctx.textBaseline = 'top'
  for (let i = 0; i < opts.lines.length; i++) {
    ctx.fillText(opts.lines[i], padding, padding + i * lineHeight)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(material)

  const scale = 0.01 // meters per pixel
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1)
  return sprite
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
