import type { LoggerMessage } from "tesseract.js";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function cropPixelBounds(width: number, height: number, crop: CropRect) {
  if (
    ![width, height, crop.x, crop.y, crop.width, crop.height].every(
      Number.isFinite,
    ) ||
    width < 24 ||
    height < 24 ||
    crop.width < 0 ||
    crop.height < 0
  )
    throw new Error("אזור התמונה אינו תקין");
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const left = Math.floor(clamp(crop.x) * width);
  const top = Math.floor(clamp(crop.y) * height);
  const right = Math.ceil(clamp(crop.x + crop.width) * width);
  const bottom = Math.ceil(clamp(crop.y + crop.height) * height);
  if (right - left < 24 || bottom - top < 24)
    throw new Error("בחרו אזור גדול יותר של התרגיל");
  return { left, top, width: right - left, height: bottom - top };
}

export async function cropExerciseImage(
  image: Blob,
  crop: CropRect,
): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  try {
    const bounds = cropPixelBounds(bitmap.width, bitmap.height, crop);
    const canvas = document.createElement("canvas");
    canvas.width = bounds.width;
    canvas.height = bounds.height;
    canvas
      .getContext("2d")!
      .drawImage(
        bitmap,
        bounds.left,
        bounds.top,
        bounds.width,
        bounds.height,
        0,
        0,
        bounds.width,
        bounds.height,
      );
    const result = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!result) throw new Error("לא ניתן לחתוך את התמונה");
    return result;
  } finally {
    bitmap.close();
  }
}

export async function prepareExerciseImage(file: Blob): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml")
    throw new Error("יש לבחור תמונת JPG, PNG או WebP");
  if (file.size > 30 * 1024 * 1024)
    throw new Error("התמונה גדולה מדי. המגבלה היא 30MB");
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!image) throw new Error("לא ניתן לעבד את התמונה");
    return image;
  } finally {
    bitmap.close();
  }
}

export async function recognizeExercise(
  image: Blob,
  onProgress: (value: number) => void,
  signal: AbortSignal,
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const base = new URL(
    "ocr/",
    new URL(import.meta.env.BASE_URL, location.href),
  );
  const worker = await createWorker(["heb", "eng"], 1, {
    workerPath: new URL("worker.min.js", base).href,
    corePath: new URL("core/", base).href,
    langPath: new URL("lang/", base).href,
    gzip: false,
    workerBlobURL: false,
    logger: (message: LoggerMessage) => {
      if (message.status === "recognizing text")
        onProgress(Math.round(100 * message.progress));
    },
  });
  let rejectAbort: (reason: Error) => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => {
    rejectAbort(new DOMException("Aborted", "AbortError"));
    void worker.terminate().catch(() => {});
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const result = await Promise.race([worker.recognize(image), aborted]);
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    return result.data.text.trim().slice(0, 2000);
  } finally {
    signal.removeEventListener("abort", onAbort);
    await worker.terminate().catch(() => {});
  }
}
