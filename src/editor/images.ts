export async function compressImage(file: Blob): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml")
    throw new Error("יש לבחור קובץ תמונה JPG, PNG או WebP");
  if (file.size > 30 * 1024 * 1024)
    throw new Error("התמונה גדולה מדי. המגבלה היא 30MB");
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.82),
  );
  if (!blob) throw new Error("לא ניתן לקרוא את התמונה");
  return blob;
}
export function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
