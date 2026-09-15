import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowUpRight,
  Check,
  Crop,
  Download,
  Droplets,
  FolderOpen,
  History,
  KeyRound,
  Maximize2,
  Minus,
  MousePointer2,
  Paintbrush,
  Redo2,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cropImage,
  exportImage,
  loadEditorImage,
  moveAnnotation,
  renderCanvas,
  shiftAnnotationAfterCrop,
} from "./canvas";
import {
  aiLocationToBox,
  annotationBounds,
  hitResizeHandle,
  normalizeRect,
  pointInAnnotation,
  resizeAnnotation,
} from "./geometry";
import {
  DEFAULT_COLOR,
  TAILWIND_COLORS,
  type AiBox,
  type AiPlan,
  type AiRun,
  type Annotation,
  type EditorImage,
  type Point,
  type Rect,
  type ResizeHandle,
  type Tool,
} from "./types";

interface OpenedImagePayload {
  dataUrl: string;
  fileName: string;
}

interface Snapshot {
  dataUrl: string;
  fileName: string;
  annotations: Annotation[];
  aiRuns: AiRun[];
  selectedAiRunId: string | null;
  selectedAiBoxId: string | null;
}

interface Gesture {
  kind: "draw" | "move" | "resize";
  start: Point;
  last: Point;
  tool: Tool;
  moved: boolean;
  original?: Annotation;
  handle?: ResizeHandle;
}

const tools: Array<{ id: Tool; label: string; icon: typeof MousePointer2 }> = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "crop", label: "Crop", icon: Crop },
  { id: "box", label: "Box", icon: Square },
  { id: "arrow", label: "Arrow", icon: ArrowUpRight },
  { id: "text", label: "Text", icon: Type },
  { id: "blur", label: "Blur", icon: Droplets },
];

const isTauri = () => "__TAURI_INTERNALS__" in window;
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("That image could not be read."));
    reader.readAsDataURL(file);
  });
}

function intersects(first: Rect, second: Rect) {
  return !(
    first.x + first.width < second.x ||
    first.x > second.x + second.width ||
    first.y + first.height < second.y ||
    first.y > second.y + second.height
  );
}

function shiftAiRunsAfterCrop(runs: AiRun[], crop: Rect): AiRun[] {
  return runs.map((run) => ({
    ...run,
    boxes: run.boxes
      .filter((box) => intersects(box, crop))
      .map((box) => ({ ...box, x: box.x - crop.x, y: box.y - crop.y })),
  }));
}

function AppTitlebar({ fileName }: { fileName: string }) {
  const actOnWindow = async (action: "minimize" | "maximize" | "close") => {
    if (!isTauri()) return;
    const appWindow = getCurrentWindow();
    if (action === "minimize") await appWindow.minimize();
    if (action === "maximize") await appWindow.toggleMaximize();
    if (action === "close") await appWindow.close();
  };

  return (
    <header className="titlebar">
      <div className="titlebar-brand" data-tauri-drag-region>
        <span className="brand-mark" data-tauri-drag-region>m</span>
        <span data-tauri-drag-region>Moneyshot</span>
      </div>
      <div className="titlebar-file" data-tauri-drag-region>{fileName}</div>
      <div className="window-controls">
        <Button variant="ghost" size="icon-sm" aria-label="Minimize" onClick={() => void actOnWindow("minimize")}>
          <Minus />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Maximize" onClick={() => void actOnWindow("maximize")}>
          <Maximize2 />
        </Button>
        <Button className="close-window" variant="ghost" size="icon-sm" aria-label="Close" onClick={() => void actOnWindow("close")}>
          <X />
        </Button>
      </div>
    </header>
  );
}

function ColorPicker({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const selectedName = TAILWIND_COLORS.find((item) => item.value === color)?.name ?? "Custom";
  return (
    <details className="color-picker">
      <summary className={cn(buttonVariants({ variant: "outline" }), "color-trigger")}>
          <span className="color-chip" style={{ backgroundColor: color }} />
          {selectedName}
      </summary>
      <div className="color-popover">
        <div className="color-popover-heading">
          <strong>Tailwind colors</strong>
          <span>Choose a clear annotation color.</span>
        </div>
        <div className="color-grid">
          {TAILWIND_COLORS.map((item) => (
            <button
              key={item.name}
              className={cn("color-swatch", item.value === color && "is-selected")}
              style={{ backgroundColor: item.value }}
              aria-label={item.name}
              title={item.name}
              onClick={(event) => {
                onChange(item.value);
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
            />
          ))}
        </div>
      </div>
    </details>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const startupImageLoadedRef = useRef(false);
  const [image, setImage] = useState<EditorImage | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [prompt, setPrompt] = useState("");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("mark.geminiKey") ?? "");
  const [baseUrl, setBaseUrl] = useState(
    () => localStorage.getItem("mark.aiBaseUrl") ?? "",
  );
  const [model, setModel] = useState(
    () => localStorage.getItem("mark.aiModel") ?? "",
  );
  const [showConnection, setShowConnection] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiRuns, setAiRuns] = useState<AiRun[]>([]);
  const [selectedAiRunId, setSelectedAiRunId] = useState<string | null>(null);
  const [selectedAiBoxId, setSelectedAiBoxId] = useState<string | null>(null);
  const [status, setStatus] = useState("Open or paste a screenshot to begin.");

  const selected = useMemo(
    () => annotations.find((annotation) => annotation.id === selectedId) ?? null,
    [annotations, selectedId],
  );
  const currentAiRun = useMemo(
    () => aiRuns.find((run) => run.id === selectedAiRunId) ?? null,
    [aiRuns, selectedAiRunId],
  );
  const currentAiBox = useMemo(
    () => currentAiRun?.boxes.find((box) => box.id === selectedAiBoxId) ?? null,
    [currentAiRun, selectedAiBoxId],
  );

  const snapshot = useCallback((): Snapshot | null => {
    if (!image) return null;
    return {
      dataUrl: image.dataUrl,
      fileName: image.fileName,
      annotations: cloneValue(annotations),
      aiRuns: cloneValue(aiRuns),
      selectedAiRunId,
      selectedAiBoxId,
    };
  }, [aiRuns, annotations, image, selectedAiBoxId, selectedAiRunId]);

  const remember = useCallback(() => {
    const current = snapshot();
    if (!current) return;
    setPast((items) => [...items.slice(-39), current]);
    setFuture([]);
  }, [snapshot]);

  const restore = useCallback(async (next: Snapshot) => {
    const loaded = await loadEditorImage(next.dataUrl, next.fileName);
    setImage(loaded);
    setAnnotations(cloneValue(next.annotations));
    setAiRuns(cloneValue(next.aiRuns));
    setSelectedAiRunId(next.selectedAiRunId);
    setSelectedAiBoxId(next.selectedAiBoxId);
    setSelectedId(null);
    setCrop(null);
    setDraft(null);
  }, []);

  const undo = useCallback(async () => {
    const current = snapshot();
    const previous = past.at(-1);
    if (!current || !previous) return;
    setPast((items) => items.slice(0, -1));
    setFuture((items) => [current, ...items].slice(0, 40));
    await restore(previous);
    setStatus("Undid the last edit.");
  }, [past, restore, snapshot]);

  const redo = useCallback(async () => {
    const current = snapshot();
    const next = future[0];
    if (!current || !next) return;
    setPast((items) => [...items, current].slice(-40));
    setFuture((items) => items.slice(1));
    await restore(next);
    setStatus("Redid the edit.");
  }, [future, restore, snapshot]);

  useEffect(() => {
    if (!canvasRef.current || !image) return;
    renderCanvas(canvasRef.current, image, {
      annotations,
      selectedId,
      draft,
      crop,
      aiBoxes: currentAiRun?.boxes,
      selectedAiBoxId,
    });
  }, [annotations, crop, currentAiRun, draft, image, selectedAiBoxId, selectedId]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        void (event.shiftKey ? redo() : undo());
      } else if (!isTyping && (event.key === "Backspace" || event.key === "Delete") && selectedId) {
        event.preventDefault();
        remember();
        setAnnotations((items) => items.filter((item) => item.id !== selectedId));
        setSelectedId(null);
        setStatus("Removed the annotation.");
      } else if (!isTyping && event.key === "Escape") {
        setCrop(null);
        setDraft(null);
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [redo, remember, selectedId, undo]);

  const loadDataUrl = useCallback(async (dataUrl: string, fileName: string) => {
    try {
      const loaded = await loadEditorImage(dataUrl, fileName);
      setImage(loaded);
      setAnnotations([]);
      setAiRuns([]);
      setSelectedAiRunId(null);
      setSelectedAiBoxId(null);
      setPast([]);
      setFuture([]);
      setCrop(null);
      setSelectedId(null);
      setTool("select");
      setStatus(`${fileName} · ${loaded.width} × ${loaded.height}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    if (!isTauri() || startupImageLoadedRef.current) return;
    startupImageLoadedRef.current = true;
    void invoke<OpenedImagePayload | null>("open_startup_image")
      .then((opened) => {
        if (opened) return loadDataUrl(opened.dataUrl, opened.fileName);
      })
      .catch((error) => setStatus(String(error)));
  }, [loadDataUrl]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
        item.type.startsWith("image/"),
      );
      if (!file) return;
      event.preventDefault();
      void readFile(file).then((dataUrl) => loadDataUrl(dataUrl, "pasted-screenshot.png"));
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [loadDataUrl]);

  const openImage = async () => {
    if (!isTauri()) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const opened = await invoke<OpenedImagePayload | null>("open_image");
      if (opened) await loadDataUrl(opened.dataUrl, opened.fileName);
    } catch (error) {
      setStatus(String(error));
    }
  };

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * event.currentTarget.width,
      y: ((event.clientY - bounds.top) / bounds.height) * event.currentTarget.height,
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!image) return;
    const point = pointFromEvent(event);
    const canvasBounds = event.currentTarget.getBoundingClientRect();
    const handleRadius = 10 * (event.currentTarget.width / canvasBounds.width);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "select") {
      if (selected) {
        const handle = hitResizeHandle(point, selected, handleRadius);
        if (handle) {
          remember();
          gestureRef.current = {
            kind: "resize",
            start: point,
            last: point,
            tool,
            moved: false,
            original: cloneValue(selected),
            handle,
          };
          return;
        }
      }

      const hit = [...annotations].reverse().find((annotation) => pointInAnnotation(point, annotation));
      setSelectedId(hit?.id ?? null);
      if (hit) {
        setColor(hit.color);
        remember();
        gestureRef.current = { kind: "move", start: point, last: point, tool, moved: false };
      }
      return;
    }

    if (tool === "text") {
      remember();
      const annotation: Annotation = {
        id: makeId(),
        type: "text",
        color,
        x: point.x,
        y: point.y,
        text: "Note",
        fontSize: Math.round(24 * Math.max(1, Math.min(2.2, image.width / 900))),
      };
      setAnnotations((items) => [...items, annotation]);
      setSelectedId(annotation.id);
      setTool("select");
      setStatus("Type the note in the inspector, then drag or resize it.");
      return;
    }

    gestureRef.current = { kind: "draw", start: point, last: point, tool, moved: false };
    if (tool === "crop") setCrop({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!image || !gestureRef.current) return;
    const point = pointFromEvent(event);
    const gesture = gestureRef.current;
    gesture.moved = gesture.moved || Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > 3;

    if (gesture.kind === "move" && selectedId) {
      const dx = point.x - gesture.last.x;
      const dy = point.y - gesture.last.y;
      gesture.last = point;
      setAnnotations((items) =>
        items.map((annotation) =>
          annotation.id === selectedId ? moveAnnotation(annotation, dx, dy) : annotation,
        ),
      );
      return;
    }

    if (gesture.kind === "resize" && selectedId && gesture.original && gesture.handle) {
      const resized = resizeAnnotation(gesture.original, gesture.handle, point);
      setAnnotations((items) =>
        items.map((annotation) => (annotation.id === selectedId ? resized : annotation)),
      );
      return;
    }

    const rect = normalizeRect(gesture.start, point);
    if (gesture.tool === "crop") {
      setCrop(rect);
    } else if (gesture.tool === "arrow") {
      setDraft({
        id: "draft",
        type: "arrow",
        color,
        start: gesture.start,
        end: point,
        label: "note",
      });
    } else if (gesture.tool === "box" || gesture.tool === "blur") {
      setDraft({ id: "draft", type: gesture.tool, color, ...rect });
    }
  };

  const onPointerUp = () => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture) return;
    if (gesture.kind === "move" || gesture.kind === "resize") {
      if (gesture.moved) setStatus(gesture.kind === "move" ? "Moved the annotation." : "Resized the annotation.");
      return;
    }
    if (gesture.tool === "crop") {
      if (!gesture.moved) setCrop(null);
      else setStatus("Review the crop, then apply it from the inspector.");
      return;
    }
    if (!gesture.moved || !draft) {
      setDraft(null);
      return;
    }
    remember();
    const annotation = { ...draft, id: makeId() } as Annotation;
    setAnnotations((items) => [...items, annotation]);
    setSelectedId(annotation.id);
    setDraft(null);
    setTool("select");
    setStatus(annotation.type === "arrow" ? "Type the arrow label in the inspector." : "Added the annotation.");
  };

  const applyCrop = async () => {
    if (!image || !crop || crop.width < 8 || crop.height < 8) return;
    remember();
    const loaded = await cropImage(image, crop);
    const visible = annotations
      .filter((annotation) => intersects(annotationBounds(annotation), crop))
      .map((annotation) => shiftAnnotationAfterCrop(annotation, crop));
    const shiftedRuns = shiftAiRunsAfterCrop(aiRuns, crop);
    setImage(loaded);
    setAnnotations(visible);
    setAiRuns(shiftedRuns);
    setSelectedAiBoxId((id) =>
      shiftedRuns.some((run) => run.boxes.some((box) => box.id === id)) ? id : null,
    );
    setCrop(null);
    setSelectedId(null);
    setTool("select");
    setStatus(`Cropped to ${loaded.width} × ${loaded.height}`);
  };

  const saveImage = async () => {
    if (!image) return;
    const dataUrl = exportImage(image, annotations);
    const suggestedName = image.fileName.replace(/\.[^.]+$/, "") + "-marked.png";
    try {
      if (isTauri()) {
        const path = await invoke<string | null>("save_image", { dataUrl, suggestedName });
        if (path) setStatus(`Saved to ${path}`);
      } else {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = suggestedName;
        link.click();
        setStatus(`Saved ${suggestedName}`);
      }
    } catch (error) {
      setStatus(String(error));
    }
  };

  const updateSelected = (changes: Partial<Annotation>) => {
    if (!selectedId) return;
    setAnnotations((items) =>
      items.map((annotation) =>
        annotation.id === selectedId ? ({ ...annotation, ...changes } as Annotation) : annotation,
      ),
    );
  };

  const chooseColor = (next: string) => {
    setColor(next);
    if (selectedId) {
      remember();
      updateSelected({ color: next } as Partial<Annotation>);
    }
  };

  const runAI = async () => {
    if (!image) return;
    if (!apiKey.trim()) {
      setShowConnection(true);
      setStatus("Add your API key, then locate the region again.");
      return;
    }
    setAiBusy(true);
    setStatus("AI is locating the requested region…");
    try {
      const plan = await invoke<AiPlan>("ask_gemini", {
        request: { apiKey, baseUrl, model, prompt, imageDataUrl: image.dataUrl },
      });
      const boxes = plan.boxes
        .map((location) => aiLocationToBox(location, image.width, image.height, makeId()))
        .filter((box): box is AiBox => box !== null);
      const run: AiRun = {
        id: makeId(),
        prompt: prompt.trim(),
        message: plan.message,
        createdAt: Date.now(),
        boxes,
      };
      setAiRuns((items) => [run, ...items].slice(0, 24));
      setSelectedAiRunId(run.id);
      setSelectedAiBoxId(boxes[0]?.id ?? null);
      setPrompt("");
      setSelectedId(null);
      setStatus(
        boxes.length
          ? `AI found ${boxes.length} region${boxes.length === 1 ? "" : "s"}. Choose what to do next.`
          : plan.message || "AI found no matching region.",
      );
    } catch (error) {
      setStatus(String(error));
    } finally {
      setAiBusy(false);
    }
  };

  const chooseAiRun = (run: AiRun) => {
    setSelectedAiRunId(run.id);
    setSelectedAiBoxId(run.boxes[0]?.id ?? null);
    setSelectedId(null);
    setStatus(run.message || `Showing AI result for “${run.prompt}”.`);
  };

  const useAiBoxForCrop = () => {
    if (!currentAiBox) return;
    setCrop({
      x: currentAiBox.x,
      y: currentAiBox.y,
      width: currentAiBox.width,
      height: currentAiBox.height,
    });
    setTool("crop");
    setSelectedId(null);
    setStatus("Crop preview ready. Apply it when the framing looks right.");
  };

  const keepAiBox = () => {
    if (!currentAiBox) return;
    remember();
    const annotation: Annotation = {
      id: makeId(),
      type: "box",
      color,
      label: currentAiBox.label,
      x: currentAiBox.x,
      y: currentAiBox.y,
      width: currentAiBox.width,
      height: currentAiBox.height,
    };
    setAnnotations((items) => [...items, annotation]);
    setSelectedId(annotation.id);
    setTool("select");
    setStatus("Kept the AI region as an editable box.");
  };

  const removeSelected = () => {
    if (!selectedId) return;
    remember();
    setAnnotations((items) => items.filter((item) => item.id !== selectedId));
    setSelectedId(null);
    setStatus("Removed the annotation.");
  };

  const saveConnection = () => {
    localStorage.setItem("mark.geminiKey", apiKey.trim());
    localStorage.setItem("mark.aiBaseUrl", baseUrl.trim());
    localStorage.setItem("mark.aiModel", model.trim());
    setShowConnection(false);
    setStatus("AI connection saved on this device.");
  };

  return (
    <TooltipProvider>
      <main
        className="app-shell"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"));
          if (file) void readFile(file).then((dataUrl) => loadDataUrl(dataUrl, file.name));
        }}
      >
        <AppTitlebar fileName={image?.fileName ?? "Untitled"} />

        <div className="commandbar">
          <Button variant="outline" onClick={() => void openImage()}>
            <FolderOpen data-icon="inline-start" /> Open
          </Button>
          <div className="commandbar-spacer" />
          <Button variant="ghost" size="icon" aria-label="Undo" disabled={!past.length} onClick={() => void undo()}>
            <Undo2 />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Redo" disabled={!future.length} onClick={() => void redo()}>
            <Redo2 />
          </Button>
          <Button disabled={!image} onClick={() => void saveImage()}>
            <Download data-icon="inline-start" /> Export PNG
          </Button>
        </div>

        <section className="editor-layout">
          <nav className="tool-rail" aria-label="Annotation tools">
            {tools.map(({ id, label, icon: Icon }) => (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <Button
                    variant={tool === id ? "secondary" : "ghost"}
                    size="sm"
                    className="tool-button"
                    aria-label={label}
                    onClick={() => {
                      setTool(id);
                      setSelectedId(null);
                      if (id !== "crop") setCrop(null);
                    }}
                  >
                    <Icon />
                    <span>{label}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            ))}
          </nav>

          <div className="canvas-stage">
            {image ? (
              <canvas
                ref={canvasRef}
                className={cn("editor-canvas", `tool-${tool}`)}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            ) : (
              <Empty className="empty-state">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><FolderOpen /></EmptyMedia>
                  <EmptyTitle>Open a screenshot</EmptyTitle>
                  <EmptyDescription>Drop an image here, paste one, or choose a file.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={() => void openImage()}>
                    <FolderOpen data-icon="inline-start" /> Choose image
                  </Button>
                </EmptyContent>
              </Empty>
            )}
          </div>

          <aside className="inspector" aria-label="Editor inspector">
            <ScrollArea className="inspector-scroll">
              <div className="inspector-content">
                <section className="inspector-section">
                  <div className="section-heading">
                    <div>
                      <h2>Annotation</h2>
                      <p>{selected ? `Editing ${selected.type}` : "Choose a color or select an item."}</p>
                    </div>
                    <Paintbrush />
                  </div>
                  <ColorPicker color={color} onChange={chooseColor} />

                  {selected && (
                    <FieldGroup className="selection-fields">
                      {(selected.type === "arrow" || selected.type === "box") && (
                        <Field>
                          <FieldLabel htmlFor="annotation-label">Label</FieldLabel>
                          <Input
                            id="annotation-label"
                            value={selected.label ?? ""}
                            onFocus={remember}
                            onChange={(event) => updateSelected({ label: event.target.value } as Partial<Annotation>)}
                          />
                        </Field>
                      )}
                      {selected.type === "text" && (
                        <Field>
                          <FieldLabel htmlFor="annotation-text">Text</FieldLabel>
                          <Input
                            id="annotation-text"
                            value={selected.text}
                            onFocus={remember}
                            onChange={(event) => updateSelected({ text: event.target.value } as Partial<Annotation>)}
                          />
                          <FieldDescription>Drag the text to move it. Drag its handle to resize it.</FieldDescription>
                        </Field>
                      )}
                      <Button variant="destructive" onClick={removeSelected}>
                        <Trash2 data-icon="inline-start" /> Delete annotation
                      </Button>
                    </FieldGroup>
                  )}

                  {crop && (
                    <div className="crop-actions">
                      <div>
                        <strong>Crop preview</strong>
                        <span>{Math.round(crop.width)} × {Math.round(crop.height)}</span>
                      </div>
                      <div className="action-row">
                        <Button variant="outline" onClick={() => setCrop(null)}>
                          <X data-icon="inline-start" /> Cancel
                        </Button>
                        <Button onClick={() => void applyCrop()}>
                          <Check data-icon="inline-start" /> Apply crop
                        </Button>
                      </div>
                    </div>
                  )}
                </section>

                <Separator />

                <section className="inspector-section gemini-section">
                  <div className="section-heading">
                    <div>
                      <h2>AI locate</h2>
                      <p>Find an area first. You decide what happens to it.</p>
                    </div>
                    <Button variant="ghost" size="icon-sm" aria-label="AI connection" onClick={() => setShowConnection(true)}>
                      <KeyRound />
                    </Button>
                  </div>
                  <form
                    className="gemini-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void runAI();
                    }}
                  >
                    <Input
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      placeholder="the error dialog"
                      aria-label="Tell AI what to locate"
                      disabled={!image}
                    />
                    <Button disabled={!image || !prompt.trim() || aiBusy}>
                      <Sparkles data-icon="inline-start" /> {aiBusy ? "Locating…" : "Locate"}
                    </Button>
                  </form>

                  {currentAiBox && (
                    <div className="candidate-actions">
                      <div>
                        <strong>{currentAiBox.label}</strong>
                        <span>AI suggestion</span>
                      </div>
                      {currentAiRun && currentAiRun.boxes.length > 1 && (
                        <div className="candidate-tabs" aria-label="AI candidates">
                          {currentAiRun.boxes.map((box, index) => (
                            <Button
                              key={box.id}
                              variant={box.id === selectedAiBoxId ? "secondary" : "ghost"}
                              size="icon-sm"
                              aria-label={`Candidate ${index + 1}: ${box.label}`}
                              onClick={() => setSelectedAiBoxId(box.id)}
                            >
                              {index + 1}
                            </Button>
                          ))}
                        </div>
                      )}
                      <div className="action-stack">
                        <Button onClick={useAiBoxForCrop}>
                          <Crop data-icon="inline-start" /> Use for crop
                        </Button>
                        <Button variant="outline" onClick={keepAiBox}>
                          <Square data-icon="inline-start" /> Keep as box
                        </Button>
                      </div>
                    </div>
                  )}
                </section>

                {aiRuns.length > 0 && (
                  <>
                    <Separator />
                    <section className="inspector-section history-section">
                      <div className="section-heading">
                        <div>
                          <h2>AI history</h2>
                          <p>Switch back to any earlier result.</p>
                        </div>
                        <History />
                      </div>
                      <div className="history-list">
                        {aiRuns.map((run) => (
                          <Button
                            key={run.id}
                            variant={run.id === selectedAiRunId ? "secondary" : "ghost"}
                            className="history-item"
                            onClick={() => chooseAiRun(run)}
                          >
                            <span>{run.prompt}</span>
                            <small>{run.boxes.length} box{run.boxes.length === 1 ? "" : "es"}</small>
                          </Button>
                        ))}
                      </div>
                    </section>
                  </>
                )}
              </div>
            </ScrollArea>
          </aside>
        </section>

        <footer className="statusbar" aria-live="polite">{status}</footer>

        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file).then((dataUrl) => loadDataUrl(dataUrl, file.name));
            event.target.value = "";
          }}
        />

        <Dialog open={showConnection} onOpenChange={setShowConnection}>
          <DialogContent className="connection-dialog">
            <DialogHeader>
              <DialogTitle>AI connection</DialogTitle>
              <DialogDescription>Connect an image-capable model through an OpenAI-compatible API.</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="api-url">API URL</FieldLabel>
                <Input id="api-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="api-model">Model</FieldLabel>
                <Input id="api-model" value={model} onChange={(event) => setModel(event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="api-key">API key</FieldLabel>
                <Input id="api-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="API key" />
                <FieldDescription>Saved on this device. Screenshots are sent only when you click Locate.</FieldDescription>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button disabled={!apiKey.trim() || !baseUrl.trim() || !model.trim()} onClick={saveConnection}>
                Save connection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </TooltipProvider>
  );
}
