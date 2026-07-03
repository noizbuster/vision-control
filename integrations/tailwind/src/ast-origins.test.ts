/**
 * AST origin detection tests (VC-V1V2-11) — TDD-first.
 *
 * Defines how className string literals inside JSX `className="..."`,
 * `cn(...)`, `clsx(...)`, and `cva(...)` calls map to AST origin locations,
 * and how dynamic expressions correctly fail to produce a static origin.
 */
import { describe, expect, it } from "vitest";

import { findClassNameOrigins, findOriginForClass } from "./ast-origins.js";

describe("findClassNameOrigins — static JSX className string", () => {
  it("locates a single class in a static JSX className string", () => {
    const content = ["export const Box = () => (", '  <div className="gap-2">hi</div>', ");"].join(
      "\n",
    );
    const origins = findClassNameOrigins(content, "src/Box.tsx");
    const gap = findOriginForClass(origins, "gap-2");
    expect(gap).toBeDefined();
    expect(gap?.callee).toBe("jsx-className");
    expect(gap?.isStatic).toBe(true);
    expect(gap?.workspaceRelativePath).toBe("src/Box.tsx");
    expect(gap?.startLine).toBe(1); // 0-based
  });

  it("locates each class in a multi-class static string", () => {
    const content = '<div className="flex gap-2 p-4">x</div>';
    const origins = findClassNameOrigins(content, "src/F.tsx");
    expect(findOriginForClass(origins, "flex")?.isStatic).toBe(true);
    expect(findOriginForClass(origins, "gap-2")?.isStatic).toBe(true);
    expect(findOriginForClass(origins, "p-4")?.isStatic).toBe(true);
  });
});

describe("findClassNameOrigins — cn / clsx / cva call sites", () => {
  it("locates a static string literal inside cn()", () => {
    const content = [
      "import { cn } from '../utils';",
      "export const B = ({ active }) => (",
      '  <button className={cn("gap-2", active && "bg-blue-500")}>x</button>',
      ");",
    ].join("\n");
    const origins = findClassNameOrigins(content, "src/B.tsx");
    const gap = findOriginForClass(origins, "gap-2");
    expect(gap?.callee).toBe("cn");
    expect(gap?.isStatic).toBe(true);
  });

  it("locates a static string literal inside clsx()", () => {
    const content = '<div className={clsx("p-4", cond && "hidden")} />';
    const origins = findClassNameOrigins(content, "src/C.tsx");
    const p = findOriginForClass(origins, "p-4");
    expect(p?.callee).toBe("clsx");
    expect(p?.isStatic).toBe(true);
  });

  it("locates a static string literal inside cva() definition", () => {
    const content = [
      "import { cva } from 'class-variance-authority';",
      "const btn = cva('gap-2', { variants: { tone: { dark: 'bg-gray-900' } } });",
    ].join("\n");
    const origins = findClassNameOrigins(content, "src/btn.ts");
    const gap = findOriginForClass(origins, "gap-2");
    expect(gap?.callee).toBe("cva");
    expect(gap?.isStatic).toBe(true);
  });

  it("records distinct column offsets for two classes in one cn() call", () => {
    const content = '<div className={cn("gap-2", "p-4")} />';
    const origins = findClassNameOrigins(content, "src/D.tsx");
    const gap = findOriginForClass(origins, "gap-2");
    const pad = findOriginForClass(origins, "p-4");
    expect(gap).toBeDefined();
    expect(pad).toBeDefined();
    expect(gap?.startColumn).not.toBe(pad?.startColumn);
  });
});

describe("findClassNameOrigins — DYNAMIC className (must NOT be static)", () => {
  it("marks a member expression className (props.className) as dynamic", () => {
    const content = "<div className={props.className}>x</div>";
    const origins = findClassNameOrigins(content, "src/P.tsx");
    // No static class tokens are present, so no static origins are recorded.
    expect(origins.filter((o) => o.isStatic)).toHaveLength(0);
  });

  it("marks a conditional expression className as dynamic (no static claim)", () => {
    const content = '<div className={cond ? "gap-2" : "gap-4"}>x</div>';
    const origins = findClassNameOrigins(content, "src/T.tsx");
    // The adapter MUST NOT treat a conditional literal as a proven static origin.
    // Such origins are recorded but flagged isStatic=false so the candidate downgrades.
    const gap2 = findOriginForClass(origins, "gap-2");
    expect(gap2).toBeDefined();
    expect(gap2?.isStatic).toBe(false);
  });

  it("marks a template-literal className as dynamic", () => {
    // `${` built from a char code so no source string literal trips noTemplateCurlyInString.
    const interp = String.fromCharCode(36, 123);
    const content = "<div className={`flex gap-" + interp + "size}`}>x</div>";
    const origins = findClassNameOrigins(content, "src/TL.tsx");
    expect(origins.filter((o) => o.isStatic)).toHaveLength(0);
  });

  it("marks a computed cn() argument (variable, not literal) as not-a-static-origin", () => {
    const content = "const cls = computeClass(); <div className={cn(cls)} />";
    const origins = findClassNameOrigins(content, "src/V.tsx");
    expect(origins.filter((o) => o.isStatic)).toHaveLength(0);
  });
});

describe("findClassNameOrigins — malformed / empty input", () => {
  it("returns no origins for an empty source string", () => {
    expect(findClassNameOrigins("", "src/Empty.tsx")).toEqual([]);
  });

  it("returns no origins for source with no JSX className", () => {
    expect(findClassNameOrigins("export const x = 1;", "src/x.ts")).toEqual([]);
  });

  it("does not throw on a syntax error (degrades to empty origins)", () => {
    const broken = "<div className={";
    expect(() => findClassNameOrigins(broken, "src/Broken.tsx")).not.toThrow();
    expect(findClassNameOrigins(broken, "src/Broken.tsx")).toEqual([]);
  });
});

describe("findClassNameOrigins — range integrity", () => {
  it("the recorded range text matches the className token", () => {
    const content = '<div className="gap-2">x</div>';
    const origins = findClassNameOrigins(content, "src/R.tsx");
    const gap = findOriginForClass(origins, "gap-2");
    expect(gap).toBeDefined();
    if (gap === undefined) return;
    const line = content.split("\n")[gap.startLine];
    const slice = line?.slice(gap.startColumn, gap.endColumn);
    expect(slice).toBe("gap-2");
  });
});
