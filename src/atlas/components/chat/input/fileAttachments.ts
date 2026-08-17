import type { Attachment } from "../types";

// Non-image files are registered into the chat's attachment store by the
// backend (from this base64 data URL) and read on demand by the agent — we no
// longer read their text here. readAsText mangled binary docs (docx/xlsx/pdf)
// anyway. Images are downscaled + re-encoded here to cut vision-token cost
// before we base64 them across IPC.

// LLM image token cost scales with pixel dimensions, not bytes. Capping the
// long edge at ~1568px matches the point where major vision models stop
// gaining detail per tile, so anything larger is pure token waste.
const MAX_IMAGE_EDGE = 1568;
// WebP at this quality is visually lossless for screenshots/photos at chat
// scale while roughly halving the payload vs PNG/JPEG.
const WEBP_QUALITY = 0.8;
// Formats we never re-encode: SVG is vector (rasterizing loses fidelity + is
// pointless for tokens) and GIF may be animated (canvas would flatten it).
const REENCODE_SKIP = /^image\/(svg\+xml|gif)$/;

function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode failed"));
    img.src = url;
  });
}

/**
 * Downscale to `MAX_IMAGE_EDGE` long edge and re-encode as WebP. Returns the
 * smaller of the original vs re-encoded data URL (never inflate a tiny image),
 * or the original on any failure. Re-encoding through a canvas also strips EXIF
 * (orientation/GPS) as a side effect, which is the privacy-safe default.
 */
async function optimizeImage(file: File): Promise<string> {
  const original = await readAsDataURL(file);
  if (REENCODE_SKIP.test(file.type)) return original;

  try {
    const img = await loadImage(original);
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h) return original;

    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const encoded = canvas.toDataURL("image/webp", WEBP_QUALITY);
    // Guard against browsers that ignore WebP and hand back a PNG, or an
    // encode that somehow grew the payload.
    if (!encoded.startsWith("data:image/webp")) return original;
    return encoded.length < original.length ? encoded : original;
  } catch {
    return original;
  }
}

export async function fileToAttachment(file: File): Promise<Attachment> {
  const isImage = file.type.startsWith("image/");
  if (isImage) {
    return {
      name: file.name,
      type: "image",
      data: await optimizeImage(file),
      mimeType: file.type,
    };
  }
  return {
    name: file.name,
    type: "file",
    data: await readAsDataURL(file),
    mimeType: file.type,
  };
}
