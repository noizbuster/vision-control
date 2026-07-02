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
  clientToViewport,
  DEFAULT_POINT_TOLERANCE,
  DEFAULT_RECT_TOLERANCE,
  type DomRectLike,
  decompose,
  distance,
  equals,
  fromString,
  GeometrySnapshotSchema,
  identity,
  invert,
  MalformedTransformError,
  type Matrix2D,
  multiply,
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
