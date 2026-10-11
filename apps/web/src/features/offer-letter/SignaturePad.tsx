import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// The pad draws on a fixed 3:1 surface and is scaled by CSS, so the picture it
// produces is the same size on a phone as on a desktop, and a window resize
// never clears a signature half-drawn.
const WIDTH = 900
const HEIGHT = 300
const INK = '#000'
const PAPER = '#fff'

/**
 * A box to sign in, with a mouse, a finger or a pen.
 *
 * `onChange` gets the signature as a PNG data URL once a stroke ends, and
 * `null` when the box is emptied. The picture is black ink on white — not
 * transparent — so it reads the same on the page in either theme and lays onto
 * the letter without an alpha channel to go wrong.
 */
export function SignaturePad({
  onChange,
  clearLabel,
  label,
  className,
}: {
  onChange: (png: string | null) => void
  clearLabel: string
  /** Accessible name of the drawing surface. */
  label: string
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [empty, setEmpty] = useState(true)

  function paper() {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    ctx.strokeStyle = INK
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    return ctx
  }

  useEffect(() => {
    paper()
  }, [])

  /** Pointer position in the canvas's own units, however CSS has scaled it. */
  function at(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) * WIDTH) / rect.width,
      y: ((e.clientY - rect.top) * HEIGHT) / rect.height,
    }
  }

  function start(e: PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = at(e)
    last.current = p
    // A tap is a dot: a zero-length stroke with a round cap.
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x + 0.01, p.y)
    ctx.stroke()
    setEmpty(false)
  }

  function move(e: PointerEvent<HTMLCanvasElement>) {
    const from = last.current
    if (!from) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = at(e)
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }

  function end() {
    if (!last.current) return
    last.current = null
    onChange(canvasRef.current?.toDataURL('image/png') ?? null)
  }

  function clear() {
    last.current = null
    paper()
    setEmpty(true)
    onChange(null)
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label={label}
        className="aspect-[3/1] w-full cursor-crosshair touch-none rounded-md border bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <div>
        <Button type="button" variant="ghost" size="sm" disabled={empty} onClick={clear}>
          {clearLabel}
        </Button>
      </div>
    </div>
  )
}
