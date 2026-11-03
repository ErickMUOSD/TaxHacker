import { describe, expect, it } from "vitest"
import { clampQuad, containTransform, coverTransform, defaultQuad, orderCorners, polygonArea, quadOutputSize } from "./geometry"

describe("orderCorners", () => {
  it("orders shuffled corners as TL, TR, BR, BL", () => {
    const tl = { x: 10, y: 12 }
    const tr = { x: 300, y: 8 }
    const br = { x: 310, y: 420 }
    const bl = { x: 5, y: 400 }
    expect(orderCorners([br, tl, bl, tr])).toEqual([tl, tr, br, bl])
  })

  it("rejects anything that is not 4 points", () => {
    expect(() => orderCorners([{ x: 0, y: 0 }])).toThrow()
  })
})

describe("quadOutputSize", () => {
  it("uses the longest opposite edges", () => {
    const quad = orderCorners([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 220, y: 300 },
      { x: 0, y: 300 },
    ])
    const size = quadOutputSize(quad, 10_000, 10_000)
    expect(size.width).toBe(220)
    expect(size.height).toBeGreaterThanOrEqual(300)
  })

  it("scales down to fit the max size, keeping aspect ratio", () => {
    const size = quadOutputSize(defaultQuad(5000, 2500, 0), 2400, 2400)
    expect(size).toEqual({ width: 2400, height: 1200 })
  })
})

describe("helpers", () => {
  it("computes polygon area", () => {
    expect(polygonArea(defaultQuad(100, 50, 0))).toBe(5000)
  })

  it("clamps corners inside the image", () => {
    const q = clampQuad(
      [
        { x: -5, y: -5 },
        { x: 120, y: 0 },
        { x: 120, y: 80 },
        { x: 0, y: 80 },
      ],
      100,
      50
    )
    expect(q).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ])
  })

  it("maps cover and contain transforms consistently", () => {
    const cover = coverTransform(640, 480, 320, 480)
    expect(cover.toView({ x: 320, y: 240 })).toEqual({ x: 160, y: 240 })
    const contain = containTransform(1000, 500, 500, 500)
    const p = { x: 250, y: 100 }
    const back = contain.toSource(contain.toView(p))
    expect(back.x).toBeCloseTo(p.x)
    expect(back.y).toBeCloseTo(p.y)
  })
})
