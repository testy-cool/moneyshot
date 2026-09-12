import { annotationBounds, annotationHandles } from "./geometry";
import type { AiBox, Annotation, EditorImage, Point, Rect } from "./types";

export function loadEditorImage(dataUrl: string, fileName: string): Promise<EditorImage> {
  return new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () =>
      resolve({
        element,
        dataUrl,
        fileName,
        width: element.naturalWidth,
        height: element.naturalHeight,
      });
    element.onerror = () => reject(new Error("That image could not be opened."));
    element.src = dataUrl;
  });
}

export function moveAnnotation(annotation: Annotation, dx: number, dy: number): Annotation {
  if (annotation.type === "arrow") {
    return {
      ...annotation,
      start: { x: annotation.start.x + dx, y: annotation.start.y + dy },
      end: { x: annotation.end.x + dx, y: annotation.end.y + dy },
    };
  }
  return { ...annotation, x: annotation.x + dx, y: annotation.y + dy };
}

export function shiftAnnotationAfterCrop(annotation: Annotation, crop: Rect): Annotation {
  return moveAnnotation(annotation, -crop.x, -crop.y);
}

function lineScale(image: EditorImage): number {
  return Math.max(1, Math.min(2.2, image.width / 900));
}

function roundRectPath(context: CanvasRenderingContext2D, rect: Rect, radius: number) {
  const r = Math.min(radius, rect.width / 2, rect.height / 2);
  context.beginPath();
  context.roundRect(rect.x, rect.y, rect.width, rect.height, r);
}

function drawLabel(
  context: CanvasRenderingContext2D,
  text: string,
  point: Point,
  color: string,
  fontSize: number,
) {
  if (!text.trim()) return;
  context.save();
  context.translate(point.x, point.y);
  context.rotate((-3 * Math.PI) / 180);
  context.font = `400 ${Math.round(fontSize)}px "Shantell Sans Variable", "Shantell Sans", cursive`;
  context.textBaseline = "top";
  context.fillStyle = color;
  context.globalAlpha = 0.96;
  context.fillText(text, 0, 0);
  context.restore();
}

function drawArrow(
  context: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  color: string,
  scale: number,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normal = { x: -dy / length, y: dx / length };
  const bend = Math.min(22 * scale, length * 0.08);
  const control = {
    x: start.x + dx * 0.53 + normal.x * bend,
    y: start.y + dy * 0.53 + normal.y * bend,
  };

  context.save();
  context.strokeStyle = color;
  context.lineWidth = 1.65 * scale;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalAlpha = 0.96;
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.quadraticCurveTo(control.x, control.y, end.x, end.y);
  context.stroke();

  const tangent = Math.atan2(end.y - control.y, end.x - control.x);
  const head = 10 * scale;
  context.beginPath();
  context.moveTo(
    end.x - Math.cos(tangent - 0.62) * head,
    end.y - Math.sin(tangent - 0.62) * head,
  );
  context.lineTo(end.x, end.y);
  context.lineTo(
    end.x - Math.cos(tangent + 0.62) * head,
    end.y - Math.sin(tangent + 0.62) * head,
  );
  context.stroke();
  context.restore();
}

function drawAnnotation(
  context: CanvasRenderingContext2D,
  image: EditorImage,
  annotation: Annotation,
) {
  const scale = lineScale(image);
  if (annotation.type === "blur") {
    context.save();
    context.beginPath();
    context.rect(annotation.x, annotation.y, annotation.width, annotation.height);
    context.clip();
    context.filter = `blur(${Math.round(14 * scale)}px)`;
    context.drawImage(image.element, 0, 0, image.width, image.height);
    context.restore();
    return;
  }
  if (annotation.type === "box") {
    context.save();
    context.strokeStyle = annotation.color;
    context.lineWidth = 2 * scale;
    context.lineCap = "round";
    context.globalAlpha = 0.96;
    roundRectPath(context, annotation, 7 * scale);
    context.stroke();
    if (annotation.label) {
      drawLabel(
        context,
        annotation.label,
        { x: annotation.x + 4 * scale, y: annotation.y - 29 * scale },
        annotation.color,
        22 * scale,
      );
    }
    context.restore();
    return;
  }
  if (annotation.type === "arrow") {
    drawLabel(context, annotation.label, annotation.start, annotation.color, 22 * scale);
    const labelWidth = Math.min(annotation.label.length * 10 * scale, 140 * scale);
    drawArrow(
      context,
      { x: annotation.start.x + labelWidth * 0.42, y: annotation.start.y + 27 * scale },
      annotation.end,
      annotation.color,
      scale,
    );
    return;
  }
  drawLabel(context, annotation.text, annotation, annotation.color, annotation.fontSize);
}

function drawAiBoxes(
  context: CanvasRenderingContext2D,
  image: EditorImage,
  boxes: AiBox[],
  selectedId?: string | null,
) {
  const scale = lineScale(image);
  boxes.forEach((box, index) => {
    const selected = box.id === selectedId;
    context.save();
    context.strokeStyle = selected ? "#2563eb" : "rgba(37, 99, 235, 0.5)";
    context.lineWidth = (selected ? 2.4 : 1.4) * scale;
    context.setLineDash(selected ? [] : [7 * scale, 5 * scale]);
    roundRectPath(context, box, 6 * scale);
    context.stroke();

    const marker = String(index + 1);
    context.setLineDash([]);
    context.fillStyle = "#2563eb";
    context.beginPath();
    context.arc(box.x + 11 * scale, box.y + 11 * scale, 10 * scale, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "white";
    context.font = `600 ${Math.round(12 * scale)}px Geist, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(marker, box.x + 11 * scale, box.y + 11 * scale);
    context.restore();
  });
}

function drawSelection(
  context: CanvasRenderingContext2D,
  image: EditorImage,
  annotation: Annotation,
) {
  const scale = lineScale(image);
  const bounds = annotationBounds(annotation);
  context.save();
  context.strokeStyle = "rgba(37, 99, 235, 0.9)";
  context.lineWidth = 1.2 * scale;
  context.setLineDash([5 * scale, 4 * scale]);
  context.strokeRect(bounds.x - 6, bounds.y - 6, bounds.width + 12, bounds.height + 12);
  context.setLineDash([]);
  annotationHandles(annotation).forEach(({ point }) => {
    context.beginPath();
    context.arc(point.x, point.y, 5.5 * scale, 0, Math.PI * 2);
    context.fillStyle = "white";
    context.fill();
    context.strokeStyle = "#2563eb";
    context.lineWidth = 1.8 * scale;
    context.stroke();
  });
  context.restore();
}

export interface RenderOptions {
  annotations: Annotation[];
  selectedId?: string | null;
  draft?: Annotation | null;
  crop?: Rect | null;
  aiBoxes?: AiBox[];
  selectedAiBoxId?: string | null;
  clean?: boolean;
}

export function renderCanvas(
  canvas: HTMLCanvasElement,
  image: EditorImage,
  options: RenderOptions,
) {
  if (canvas.width !== image.width) canvas.width = image.width;
  if (canvas.height !== image.height) canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image.element, 0, 0, image.width, image.height);

  options.annotations.forEach((annotation) => drawAnnotation(context, image, annotation));
  if (options.draft) drawAnnotation(context, image, options.draft);
  if (options.clean) return;
  if (options.aiBoxes?.length) {
    drawAiBoxes(context, image, options.aiBoxes, options.selectedAiBoxId);
  }

  const selected = options.annotations.find((annotation) => annotation.id === options.selectedId);
  if (selected) drawSelection(context, image, selected);

  if (options.crop) {
    const crop = options.crop;
    context.save();
    context.fillStyle = "rgba(20, 20, 19, 0.52)";
    context.beginPath();
    context.rect(0, 0, image.width, image.height);
    context.rect(crop.x, crop.y, crop.width, crop.height);
    context.fill("evenodd");
    context.strokeStyle = "rgba(255, 255, 255, 0.96)";
    context.lineWidth = 1.5 * lineScale(image);
    context.setLineDash([7 * lineScale(image), 5 * lineScale(image)]);
    context.strokeRect(crop.x, crop.y, crop.width, crop.height);
    context.restore();
  }
}

export function exportImage(image: EditorImage, annotations: Annotation[]): string {
  const canvas = document.createElement("canvas");
  renderCanvas(canvas, image, { annotations, clean: true });
  return canvas.toDataURL("image/png");
}

export async function cropImage(image: EditorImage, crop: Rect): Promise<EditorImage> {
  const x = Math.max(0, Math.round(crop.x));
  const y = Math.max(0, Math.round(crop.y));
  const width = Math.max(1, Math.min(image.width - x, Math.round(crop.width)));
  const height = Math.max(1, Math.min(image.height - y, Math.round(crop.height)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The crop could not be created.");
  context.drawImage(image.element, x, y, width, height, 0, 0, width, height);
  const dataUrl = canvas.toDataURL("image/png");
  return loadEditorImage(dataUrl, image.fileName.replace(/\.[^.]+$/, "") + "-cropped.png");
}
