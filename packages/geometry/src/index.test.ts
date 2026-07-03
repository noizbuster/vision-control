import { describe, expect, it } from "vitest";
import {
  identityMatrix,
  sampleRect,
  sampleSnapshot,
  sampleTarget,
} from "./__fixtures__/geometry.js";
import {
  add,
  applyToPoint,
  clientToFrameLocal,
  clientToLocal,
  clientToOffsetParent,
  clientToViewport,
  cssToDevicePixel,
  DEFAULT_POINT_TOLERANCE,
  DEFAULT_RECT_TOLERANCE,
  type DomRectLike,
  decompose,
  devicePixelToCss,
  distance,
  equals,
  frameLocalToClient,
  fromString,
  GeometrySnapshotSchema,
  identity,
  invert,
  localToClient,
  MalformedTransformError,
  type Matrix2D,
  multiply,
  offsetParentToClient,
  pageToClient,
  rectCenter,
  rectContains,
  rectEquals,
  rectFromDomRect,
  rectIntersects,
  rotate,
  scale,
  subtract,
  translate,
  UnsupportedTransformError,
  viewportToClient,
} from "./index.js";

const approx = (a: number, b: number, tol = 1e-9): boolean => Math.abs(a - b) <= tol;

describe("point math", () => {
  it("add and subtract are inverses", () => {
    const a = { x: 1.5, y: 2.5 };
    const b = { x: 0.5, y: -1 };
    expect(subtract(add(a, b), b)).toEqual(a);
  });

  it("distance is the Euclidean norm", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("equals uses a tolerance", () => {
    expect(equals({ x: 1, y: 1 }, { x: 1 + DEFAULT_POINT_TOLERANCE / 2, y: 1 })).toBe(true);
    expect(equals({ x: 1, y: 1 }, { x: 2, y: 1 })).toBe(false);
  });
});

describe("rect math", () => {
  it("rectFromDomRect converts a DomRectLike without DOM coupling", () => {
    const dom: DomRectLike = { x: 5, y: 6, width: 7, height: 8 };
    expect(rectFromDomRect(dom)).toEqual({ x: 5, y: 6, width: 7, height: 8 });
  });

  it("rectCenter returns the geometric center", () => {
    expect(rectCenter(sampleRect)).toEqual({ x: 60, y: 45 });
  });

  it("rectContains is inclusive of edges", () => {
    const r = sampleRect;
    expect(rectContains(r, { x: 10, y: 20 })).toBe(true); // top-left
    expect(rectContains(r, { x: 110, y: 70 })).toBe(true); // bottom-right
    expect(rectContains(r, { x: 9, y: 20 })).toBe(false);
  });

  it("rectIntersects detects overlap and non-overlap", () => {
    const a = sampleRect;
    expect(rectIntersects(a, { x: 50, y: 40, width: 10, height: 10 })).toBe(true);
    expect(rectIntersects(a, { x: 200, y: 200, width: 5, height: 5 })).toBe(false);
  });

  it("rectEquals uses a tolerance", () => {
    const a = sampleRect;
    expect(rectEquals(a, { ...a, x: a.x + DEFAULT_RECT_TOLERANCE / 2 })).toBe(true);
    expect(rectEquals(a, { ...a, x: a.x + 1 })).toBe(false);
  });
});

describe("matrix2D algebra", () => {
  it("identity is the multiplicative identity", () => {
    expect(multiply(identity(), [2, 0, 0, 3, 1, 1])).toEqual([2, 0, 0, 3, 1, 1]);
    expect(multiply([2, 0, 0, 3, 1, 1], identity())).toEqual([2, 0, 0, 3, 1, 1]);
  });

  it("translate composes a translation matrix", () => {
    const p = applyToPoint(translate(identity(), 10, 20), { x: 1, y: 1 });
    expect(p).toEqual({ x: 11, y: 21 });
  });

  it("scale composes a scale matrix", () => {
    const p = applyToPoint(scale(identity(), 2, 3), { x: 5, y: 4 });
    expect(p).toEqual({ x: 10, y: 12 });
  });

  it("rotate composes a rotation matrix (90deg)", () => {
    const m = rotate(identity(), Math.PI / 2);
    const p = applyToPoint(m, { x: 1, y: 0 });
    expect(approx(p.x, 0)).toBe(true);
    expect(approx(p.y, 1)).toBe(true);
  });

  it("multiply is associative", () => {
    const a: Matrix2D = [1, 2, 3, 4, 5, 6];
    const b: Matrix2D = [7, 8, 9, 10, 11, 12];
    const c: Matrix2D = [13, 14, 15, 16, 17, 18];
    const left = multiply(multiply(a, b), c);
    const right = multiply(a, multiply(b, c));
    expect(left.every((v, i) => approx(v, right[i] ?? 0))).toBe(true);
  });

  it("invert is the inverse of the original", () => {
    const m: Matrix2D = [2, 0, 0, 4, 5, 6];
    const inv = invert(m);
    expect(inv).toBeDefined();
    if (inv !== undefined) {
      const product = multiply(m, inv);
      expect(product.every((v) => approx(v, 1) || approx(v, 0))).toBe(true);
      const id = identityMatrix;
      expect(product.every((v, i) => approx(v, id[i] ?? 0))).toBe(true);
    }
  });

  it("invert returns undefined for a singular matrix", () => {
    expect(invert([0, 0, 0, 0, 0, 0])).toBeUndefined();
  });
});

describe("matrix round-trip (parse -> apply -> decompose -> reconstruct)", () => {
  // decompose assumes the canonical CSS form M = T * R * S (translate outermost,
  // scale applied first to a point), so both sides are built in that order.
  it("reconstructs a composed transform within tolerance", () => {
    const expected = multiply(
      multiply(translate(identity(), 10, 20), rotate(identity(), Math.PI / 4)),
      scale(identity(), 2, 3),
    );
    const { translateX, translateY, scaleX, scaleY, rotation } = decompose(expected);
    const reconstructed = multiply(
      multiply(translate(identity(), translateX, translateY), rotate(identity(), rotation)),
      scale(identity(), scaleX, scaleY),
    );
    for (let i = 0; i < 6; i += 1) {
      expect(approx(reconstructed[i] ?? 0, expected[i] ?? 0, 1e-6)).toBe(true);
    }
    // Sanity: the decomposed values match what we put in.
    expect(approx(translateX, 10)).toBe(true);
    expect(approx(translateY, 20)).toBe(true);
    expect(approx(scaleX, 2, 1e-6)).toBe(true);
    expect(approx(scaleY, 3, 1e-6)).toBe(true);
    expect(approx(rotation, Math.PI / 4, 1e-6)).toBe(true);
  });

  it("applyToPoint of the reconstructed matrix matches the original", () => {
    const original = multiply(
      multiply(translate(identity(), 10, 20), rotate(identity(), Math.PI / 4)),
      scale(identity(), 2, 3),
    );
    const d = decompose(original);
    const reconstructed = multiply(
      multiply(translate(identity(), d.translateX, d.translateY), rotate(identity(), d.rotation)),
      scale(identity(), d.scaleX, d.scaleY),
    );
    const p = { x: 7, y: -3 };
    expect(applyToPoint(reconstructed, p)).toEqual(applyToPoint(original, p));
  });
});

describe("fromString parsing", () => {
  it("parses a translate", () => {
    expect(fromString("translate(10px, 20px)")).toEqual([1, 0, 0, 1, 10, 20]);
  });

  it("tolerates bare numbers and whitespace", () => {
    expect(fromString("translate(10, 20)")).toEqual([1, 0, 0, 1, 10, 20]);
    expect(fromString("  translate( 5 , 6 )  ")).toEqual([1, 0, 0, 1, 5, 6]);
  });

  it("composes multiple functions left-to-right (translate then rotate)", () => {
    const m = fromString("translate(10px, 20px) rotate(45deg)");
    // CSS "translate rotate" yields the matrix T * R (translate outermost).
    const expected = multiply(translate(identity(), 10, 20), rotate(identity(), Math.PI / 4));
    expect(m.every((v, i) => approx(v, expected[i] ?? 0))).toBe(true);
  });

  it("parses scale with a single argument (uniform)", () => {
    expect(fromString("scale(2)")).toEqual([2, 0, 0, 2, 0, 0]);
  });

  it("parses matrix() literal", () => {
    expect(fromString("matrix(1, 0, 0, 1, 5, 6)")).toEqual([1, 0, 0, 1, 5, 6]);
  });

  it("parses matrix3d by down-projecting to 2D", () => {
    const m3d = fromString("matrix3d(2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 10, 20, 0, 1)");
    expect(m3d).toEqual([2, 0, 0, 3, 10, 20]);
  });

  it("returns identity for an empty string", () => {
    expect(fromString("")).toEqual([1, 0, 0, 1, 0, 0]);
    expect(fromString("   ")).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("throws UnsupportedTransformError for skew and perspective", () => {
    expect(() => fromString("skew(10deg)")).toThrow(UnsupportedTransformError);
    expect(() => fromString("perspective(100px)")).toThrow(UnsupportedTransformError);
  });

  it("throws UnsupportedTransformError for an unknown function", () => {
    expect(() => fromString("warp(5)")).toThrow(UnsupportedTransformError);
  });

  it("throws MalformedTransformError for a bad matrix() arity", () => {
    expect(() => fromString("matrix(1, 2, 3)")).toThrow(MalformedTransformError);
  });
});

describe("coordinate conversion round-trip", () => {
  const scroll = { x: 12, y: 34 };
  const client = { x: 100, y: 200 };

  it("client -> viewport -> client round-trips", () => {
    const vp = clientToViewport(client, scroll);
    expect(viewportToClient(vp, scroll)).toEqual(client);
  });

  it("viewport = client + scrollOffset", () => {
    expect(clientToViewport(client, scroll)).toEqual({ x: 112, y: 234 });
  });

  it("pageToClient is the inverse of client->viewport", () => {
    const vp = clientToViewport(client, scroll);
    expect(pageToClient(vp, scroll)).toEqual(client);
  });

  // Regression: the PRD §11 extension (frame-local / offsetParent /
  // transformed-local / device-pixel) must NOT alter the pre-existing
  // scroll-offset round-trip. Pinned explicitly per the task contract.
  it("regression: existing client<->viewport round-trip is unchanged", () => {
    for (const c of [
      { x: 0, y: 0 },
      { x: -5, y: 7.5 },
      { x: 1000, y: -200 },
    ]) {
      expect(viewportToClient(clientToViewport(c, scroll), scroll)).toEqual(c);
      expect(pageToClient(clientToViewport(c, scroll), scroll)).toEqual(c);
    }
  });
});

describe("frame-local conversion (same-origin iframe)", () => {
  // iframe element's border-box top-left in the parent document's client space.
  const iframeOrigin = { x: 200, y: 150 };

  it("client -> frame-local subtracts the iframe origin", () => {
    expect(clientToFrameLocal({ x: 250, y: 180 }, iframeOrigin)).toEqual({ x: 50, y: 30 });
    // pointer at the iframe's top-left corner maps to {0,0}
    expect(clientToFrameLocal(iframeOrigin, iframeOrigin)).toEqual({ x: 0, y: 0 });
  });

  it("frame-local -> client -> frame-local round-trips", () => {
    const local = { x: 73, y: -9 };
    const back = clientToFrameLocal(frameLocalToClient(local, iframeOrigin), iframeOrigin);
    expect(back).toEqual(local);
  });
});

describe("offsetParent conversion", () => {
  // offsetParent border-box top-left in client space.
  const offsetParentOrigin = { x: 40, y: 60 };

  it("client -> offsetParent subtracts the offsetParent origin", () => {
    expect(clientToOffsetParent({ x: 100, y: 160 }, offsetParentOrigin)).toEqual({ x: 60, y: 100 });
  });

  it("offsetParent -> client -> offsetParent round-trips", () => {
    const local = { x: 12.5, y: -3.25 };
    const back = clientToOffsetParent(
      offsetParentToClient(local, offsetParentOrigin),
      offsetParentOrigin,
    );
    expect(back).toEqual(local);
  });
});

describe("transformed-local conversion (CSS-transformed ancestors)", () => {
  // Non-trivial transform: scale(2,3) then translate(10,20) — composed so the
  // scale applies first (matches the matrix decomposition invariant).
  const transform: Matrix2D = [2, 0, 0, 3, 10, 20];
  const origin = { x: 5, y: 7 };

  it("localToClient then clientToLocal round-trips (transformed ancestor pointer)", () => {
    const local = { x: 11, y: -3 };
    const clientPoint = localToClient(local, transform, origin);
    const back = clientToLocal(clientPoint, transform, origin);
    expect(back).toBeDefined();
    expect(back).toEqual(local);
  });

  it("clientToLocal then localToClient round-trips", () => {
    const clientPoint = { x: 27, y: 42 };
    const local = clientToLocal(clientPoint, transform, origin);
    expect(local).toBeDefined();
    expect(localToClient(local ?? { x: 0, y: 0 }, transform, origin)).toEqual(clientPoint);
  });

  it("respects the transform-origin pivot (origin shift changes the result)", () => {
    const local = { x: 11, y: -3 };
    const zeroOrigin = localToClient(local, transform, { x: 0, y: 0 });
    const pivoted = localToClient(local, transform, origin);
    // The pivot is not just a translation; the scaled vector rotates around it.
    expect(zeroOrigin).not.toEqual(pivoted);
    // Matrix inversion introduces float error, so round-trips use tolerance.
    const zeroBack = clientToLocal(zeroOrigin, transform, { x: 0, y: 0 });
    const pivotedBack = clientToLocal(pivoted, transform, origin);
    expect(zeroBack).toBeDefined();
    expect(pivotedBack).toBeDefined();
    expect(approx(zeroBack?.x ?? NaN, local.x, 1e-9)).toBe(true);
    expect(approx(zeroBack?.y ?? NaN, local.y, 1e-9)).toBe(true);
    expect(approx(pivotedBack?.x ?? NaN, local.x, 1e-9)).toBe(true);
    expect(approx(pivotedBack?.y ?? NaN, local.y, 1e-9)).toBe(true);
  });

  it("identity transform with zero origin is a pass-through", () => {
    const local = { x: 13, y: 21 };
    expect(localToClient(local, identityMatrix, { x: 0, y: 0 })).toEqual(local);
    expect(clientToLocal(local, identityMatrix, { x: 0, y: 0 })).toEqual(local);
  });

  it("composes with a parsed transform string (translate then rotate)", () => {
    const m = fromString("translate(10px, 20px) rotate(45deg)");
    const local = { x: 4, y: 8 };
    const clientPoint = localToClient(local, m, { x: 0, y: 0 });
    const back = clientToLocal(clientPoint, m, { x: 0, y: 0 });
    expect(back).toBeDefined();
    expect(approx(back?.x ?? NaN, local.x)).toBe(true);
    expect(approx(back?.y ?? NaN, local.y)).toBe(true);
  });

  it("clientToLocal returns undefined for a singular (non-invertible) transform", () => {
    const singular: Matrix2D = [0, 0, 0, 0, 10, 20];
    expect(clientToLocal({ x: 5, y: 5 }, singular, origin)).toBeUndefined();
  });
});

describe("device-pixel conversion", () => {
  it("css -> device scales by devicePixelRatio", () => {
    expect(cssToDevicePixel({ x: 100, y: 50 }, 2)).toEqual({ x: 200, y: 100 });
    expect(cssToDevicePixel({ x: 100, y: 50 }, 1)).toEqual({ x: 100, y: 50 });
    expect(cssToDevicePixel({ x: 100, y: 50 }, 1.5)).toEqual({ x: 150, y: 75 });
  });

  it("device -> css divides by devicePixelRatio", () => {
    expect(devicePixelToCss({ x: 200, y: 100 }, 2)).toEqual({ x: 100, y: 50 });
  });

  it("css -> device -> css round-trips", () => {
    const css = { x: 123.5, y: -7.25 };
    for (const dpr of [1, 2, 1.5, 3]) {
      expect(devicePixelToCss(cssToDevicePixel(css, dpr), dpr)).toEqual(css);
    }
  });

  it("respects the snapshot devicePixelRatio field", () => {
    const dpr = sampleSnapshot.devicePixelRatio;
    expect(dpr).toBe(2);
    expect(cssToDevicePixel({ x: 50, y: 25 }, dpr)).toEqual({ x: 100, y: 50 });
  });
});

describe("scroll-parents accumulation", () => {
  it("accumulates scroll offsets purely", async () => {
    const { accumulateScrollOffset } = await import("./scroll-parents.js");
    const parents = [
      { element: sampleTarget, scrollOffset: { x: 1, y: 2 }, scrollRange: sampleRect },
      { element: sampleTarget, scrollOffset: { x: 10, y: 20 }, scrollRange: sampleRect },
    ];
    expect(accumulateScrollOffset(parents)).toEqual({ x: 11, y: 22 });
    expect(accumulateScrollOffset([])).toEqual({ x: 0, y: 0 });
  });
});

describe("geometry snapshot", () => {
  it("validates against the Zod schema", () => {
    expect(GeometrySnapshotSchema.safeParse(sampleSnapshot).success).toBe(true);
  });

  it("defaults transformOrigin and devicePixelRatio when omitted (PRD §11 fields)", () => {
    const minimal = {
      target: sampleTarget,
      borderRect: sampleSnapshot.borderRect,
      paddingRect: sampleSnapshot.paddingRect,
      contentRect: sampleSnapshot.contentRect,
      scrollOffset: sampleSnapshot.scrollOffset,
      viewportSize: sampleSnapshot.viewportSize,
      capturedAt: sampleSnapshot.capturedAt,
    };
    const parsed = GeometrySnapshotSchema.safeParse(minimal);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.transformOrigin).toEqual({ x: 0, y: 0 });
      expect(parsed.data.devicePixelRatio).toBe(1);
    }
  });

  it("rejects a non-positive devicePixelRatio", () => {
    expect(
      GeometrySnapshotSchema.safeParse({ ...sampleSnapshot, devicePixelRatio: 0 }).success,
    ).toBe(false);
    expect(
      GeometrySnapshotSchema.safeParse({ ...sampleSnapshot, devicePixelRatio: -1 }).success,
    ).toBe(false);
  });

  it("rejects a negative capturedAt", () => {
    expect(GeometrySnapshotSchema.safeParse({ ...sampleSnapshot, capturedAt: -1 }).success).toBe(
      false,
    );
  });

  it("round-trips through JSON (JSON-safe)", () => {
    const json = JSON.stringify(sampleSnapshot);
    const round = JSON.parse(json);
    expect(GeometrySnapshotSchema.safeParse(round).success).toBe(true);
  });
});
