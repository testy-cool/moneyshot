import { describe, expect, it } from "vitest";
import {
  aiLocationToBox,
  hitResizeHandle,
  normalizeRect,
  normalizedBoxToRect,
  resizeAnnotation,
} from "./geometry";
import type { Annotation } from "./types";

describe("editor geometry", () => {
  it("normalizes a backwards drag", () => {
    expect(normalizeRect({ x: 90, y: 70 }, { x: 20, y: 10 })).toEqual({
      x: 20,
      y: 10,
      width: 70,
      height: 60,
    });
  });

  it("maps AI's normalized coordinates into image pixels", () => {
    expect(normalizedBoxToRect([100, 250, 900, 750], 1200, 800)).toEqual({
      x: 300,
      y: 80,
      width: 600,
      height: 640,
    });
  });

  it("keeps a AI result as a reversible candidate", () => {
    expect(
      aiLocationToBox({ box_2d: [250, 100, 750, 600], label: "dialog" }, 1000, 500, "ai-1"),
    ).toEqual({ id: "ai-1", label: "dialog", x: 100, y: 125, width: 500, height: 250 });
  });

  it("finds and moves a rectangle resize handle", () => {
    const box: Annotation = {
      id: "box-1",
      type: "box",
      color: "#ef4444",
      x: 20,
      y: 30,
      width: 100,
      height: 80,
    };
    expect(hitResizeHandle({ x: 120, y: 110 }, box)).toBe("se");
    expect(resizeAnnotation(box, "se", { x: 180, y: 150 })).toMatchObject({
      x: 20,
      y: 30,
      width: 160,
      height: 120,
    });
  });

  it("resizes handwritten text without dropping below 12 pixels", () => {
    const text: Annotation = {
      id: "text-1",
      type: "text",
      color: "#171717",
      x: 10,
      y: 10,
      text: "hello",
      fontSize: 28,
    };
    const resized = resizeAnnotation(text, "se", { x: 12, y: 12 });
    expect(resized.type).toBe("text");
    if (resized.type === "text") {
      expect(resized.fontSize).toBeGreaterThanOrEqual(12);
      expect(resized.fontSize).toBeLessThan(text.fontSize);
    }
  });

  it("moves either end of an arrow independently", () => {
    const arrow: Annotation = {
      id: "arrow-1",
      type: "arrow",
      color: "#3b82f6",
      label: "look",
      start: { x: 30, y: 40 },
      end: { x: 130, y: 90 },
    };
    expect(resizeAnnotation(arrow, "end", { x: 180, y: 120 })).toMatchObject({
      start: { x: 30, y: 40 },
      end: { x: 180, y: 120 },
    });
  });
});
