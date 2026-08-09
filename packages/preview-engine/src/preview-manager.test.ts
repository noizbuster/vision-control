import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTestDomAdapter,
  FakeMutationObserver,
  makeReorder,
  makeReparent,
} from "./__fixtures__/helpers.js";
import { createPreviewManager, noopGhostRenderer, type PreviewDomAdapter } from "./index.js";

const childNodeKinds = (element: Element): readonly string[] =>
  Array.from(element.childNodes).map((node) => `${node.nodeType}:${node.textContent}`);

describe("PreviewManager structural rollback", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    document.head.querySelectorAll("style[data-vc-preview-stylesheet]").forEach((style) => {
      style.remove();
    });
    FakeMutationObserver.instances.length = 0;
  });

  it("rolls a structural preview back once, including its binding cleanup callback", () => {
    const dom = createTestDomAdapter(FakeMutationObserver);
    const manager = createPreviewManager({ dom });
    const parent = document.createElement("div");
    const first = document.createElement("div");
    const second = document.createElement("div");
    first.textContent = "A";
    second.textContent = "B";
    parent.append("prefix", first, document.createComment("between"), second, "suffix");
    dom.registerElement("parent", parent);
    dom.registerElement("first", first);
    dom.registerElement("second", second);
    const original = childNodeKinds(parent);
    const onRollback = vi.fn();

    const rollback = manager.applyOperation(makeReorder("parent", "second", 1, 0), { onRollback });
    rollback();
    rollback();

    expect(childNodeKinds(parent)).toEqual(original);
    expect(onRollback).toHaveBeenCalledTimes(1);
    expect(manager.activeCount).toBe(0);
  });

  it("restores every child node when a structural insert throws", () => {
    const dom = createTestDomAdapter(FakeMutationObserver);
    const manager = createPreviewManager({ dom });
    const source = document.createElement("div");
    const target = document.createElement("div");
    const moving = document.createElement("div");
    moving.textContent = "moving";
    source.append("source", moving, document.createComment("source-comment"));
    target.append("target", document.createComment("target-comment"));
    dom.registerElement("source", source);
    dom.registerElement("target", target);
    dom.registerElement("moving", moving);
    const sourceBefore = childNodeKinds(source);
    const targetBefore = childNodeKinds(target);
    const insertBefore = target.insertBefore.bind(target);
    target.insertBefore = <T extends Node>(_node: T, _child: Node | null): T => {
      throw new Error("insert failed");
    };

    expect(() => manager.applyOperation(makeReparent("moving", "source", 0, "target", 0))).toThrow(
      "insert failed",
    );
    target.insertBefore = insertBefore;

    expect(childNodeKinds(source)).toEqual(sourceBefore);
    expect(childNodeKinds(target)).toEqual(targetBefore);
    expect(manager.activeCount).toBe(0);
  });

  it("unwinds an already-applied structural preview when observer setup fails", () => {
    const base = createTestDomAdapter(FakeMutationObserver);
    const dom: PreviewDomAdapter = {
      ...base,
      createMutationObserver: () => {
        throw new Error("observer setup failed");
      },
    };
    const manager = createPreviewManager({ dom, ghostRenderer: noopGhostRenderer });
    const source = document.createElement("div");
    const target = document.createElement("div");
    const moving = document.createElement("div");
    source.append("source", moving);
    target.append("target");
    dom.registerElement("source", source);
    dom.registerElement("target", target);
    dom.registerElement("moving", moving);
    const sourceBefore = childNodeKinds(source);
    const targetBefore = childNodeKinds(target);

    expect(() => manager.applyOperation(makeReparent("moving", "source", 0, "target", 0))).toThrow(
      "observer setup failed",
    );

    expect(childNodeKinds(source)).toEqual(sourceBefore);
    expect(childNodeKinds(target)).toEqual(targetBefore);
    expect(manager.activeCount).toBe(0);
  });
});
