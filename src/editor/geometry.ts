import type {
  AiBox,
  AiLocation,
  Annotation,
  Point,
  Rect,
  ResizeHandle,
  TextAnnotation,
} from "./types";

const MIN_SIZE = 12;

export function normalizeRect(start: Point, end: Point): Rect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function normalizedBoxToRect(
  box: [number, number, number, number],
  width: number,
  height: number,
): Rect {
  const [yMin, xMin, yMax, xMax] = box.map((value) => Math.min(1000, Math.max(0, value)));
  return {
    x: (Math.min(xMin, xMax) / 1000) * width,
    y: (Math.min(yMin, yMax) / 1000) * height,
    width: (Math.abs(xMax - xMin) / 1000) * width,
    height: (Math.abs(yMax - yMin) / 1000) * height,
  };
}

export function textBounds(annotation: TextAnnotation): Rect {
  return {
    x: annotation.x,
    y: annotation.y,
    width: Math.max(annotation.fontSize * 2, annotation.text.length * annotation.fontSize * 0.58),
    height: annotation.fontSize * 1.35,
  };
}

export function annotationBounds(annotation: Annotation): Rect {
  if (annotation.type === "arrow") return normalizeRect(annotation.start, annotation.end);
  if (annotation.type === "text") return textBounds(annotation);
  return annotation;
}

export function pointInRect(point: Point, rect: Rect, padding = 0): boolean {
  return (
    point.x >= rect.x - padding &&
    point.x <= rect.x + rect.width + padding &&
    point.y >= rect.y - padding &&
    point.y <= rect.y + rect.height + padding
  );
}

export function pointInAnnotation(point: Point, annotation: Annotation): boolean {
  const bounds = annotationBounds(annotation);
  const padding = Math.max(10, Math.min(bounds.width, bounds.height) * 0.08);
  return pointInRect(point, bounds, padding);
}

export function annotationHandles(annotation: Annotation): Array<{ handle: ResizeHandle; point: Point }> {
  if (annotation.type === "arrow") {
    return [
      { handle: "start", point: annotation.start },
      { handle: "end", point: annotation.end },
    ];
  }
  const bounds = annotationBounds(annotation);
  if (annotation.type === "text") {
    return [{ handle: "se", point: { x: bounds.x + bounds.width, y: bounds.y + bounds.height } }];
  }
  return [
    { handle: "nw", point: { x: bounds.x, y: bounds.y } },
    { handle: "ne", point: { x: bounds.x + bounds.width, y: bounds.y } },
    { handle: "se", point: { x: bounds.x + bounds.width, y: bounds.y + bounds.height } },
    { handle: "sw", point: { x: bounds.x, y: bounds.y + bounds.height } },
  ];
}

export function hitResizeHandle(
  point: Point,
  annotation: Annotation,
  radius = 12,
): ResizeHandle | null {
  const hit = annotationHandles(annotation).find(
    ({ point: handlePoint }) => Math.hypot(point.x - handlePoint.x, point.y - handlePoint.y) <= radius,
  );
  return hit?.handle ?? null;
}

function resizeRect(original: Rect, handle: ResizeHandle, point: Point): Rect {
  const right = original.x + original.width;
  const bottom = original.y + original.height;
  if (handle === "nw") return normalizeRect(point, { x: right, y: bottom });
  if (handle === "ne") return normalizeRect({ x: original.x, y: bottom }, point);
  if (handle === "sw") return normalizeRect({ x: right, y: original.y }, point);
  return normalizeRect({ x: original.x, y: original.y }, point);
}

export function resizeAnnotation(
  original: Annotation,
  handle: ResizeHandle,
  point: Point,
): Annotation {
  if (original.type === "arrow") {
    if (handle === "start") return { ...original, start: point };
    if (handle === "end") return { ...original, end: point };
    return original;
  }
  if (original.type === "text") {
    const originalBounds = textBounds(original);
    const wantedWidth = Math.max(36, point.x - originalBounds.x);
    const fontSize = Math.max(12, Math.min(144, original.fontSize * (wantedWidth / originalBounds.width)));
    return { ...original, fontSize };
  }
  const resized = resizeRect(original, handle, point);
  if (resized.width < MIN_SIZE || resized.height < MIN_SIZE) return original;
  return { ...original, ...resized };
}

export function aiLocationToBox(
  location: AiLocation,
  imageWidth: number,
  imageHeight: number,
  id: string,
): AiBox | null {
  const rect = normalizedBoxToRect(location.box_2d, imageWidth, imageHeight);
  if (rect.width < 2 || rect.height < 2) return null;
  return { id, label: location.label || "AI result", ...rect };
}
