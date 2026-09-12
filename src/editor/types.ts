export type Tool = "select" | "crop" | "box" | "arrow" | "text" | "blur";

export type ResizeHandle = "nw" | "ne" | "se" | "sw" | "start" | "end";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AnnotationBase {
  id: string;
  color: string;
}

export interface BoxAnnotation extends AnnotationBase, Rect {
  type: "box";
  label?: string;
}

export interface BlurAnnotation extends AnnotationBase, Rect {
  type: "blur";
}

export interface TextAnnotation extends AnnotationBase, Point {
  type: "text";
  text: string;
  fontSize: number;
}

export interface ArrowAnnotation extends AnnotationBase {
  type: "arrow";
  start: Point;
  end: Point;
  label: string;
}

export type Annotation = BoxAnnotation | BlurAnnotation | TextAnnotation | ArrowAnnotation;

export interface EditorImage {
  element: HTMLImageElement;
  dataUrl: string;
  fileName: string;
  width: number;
  height: number;
}

export interface AiLocation {
  box_2d: [number, number, number, number];
  label: string;
}

export interface AiPlan {
  message: string;
  boxes: AiLocation[];
}

export interface AiBox extends Rect {
  id: string;
  label: string;
}

export interface AiRun {
  id: string;
  prompt: string;
  message: string;
  createdAt: number;
  boxes: AiBox[];
}

export interface PaletteColor {
  name: string;
  value: string;
}

export const TAILWIND_COLORS: PaletteColor[] = [
  { name: "Neutral", value: "#525252" },
  { name: "Slate", value: "#64748b" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Yellow", value: "#eab308" },
  { name: "Lime", value: "#84cc16" },
  { name: "Green", value: "#22c55e" },
  { name: "Emerald", value: "#10b981" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Sky", value: "#0ea5e9" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Purple", value: "#a855f7" },
  { name: "Fuchsia", value: "#d946ef" },
  { name: "Pink", value: "#ec4899" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Black", value: "#171717" },
  { name: "White", value: "#fafafa" },
];

export const DEFAULT_COLOR = TAILWIND_COLORS[0].value;
