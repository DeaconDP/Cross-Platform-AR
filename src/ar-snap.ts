export type ArSnapProduct = "place" | "scan" | "emily" | "cubes";
export type ArSnapReason =
  | "ok"
  | "not-ready"
  | "busy"
  | "empty"
  | "denied"
  | "unsupported"
  | "fail";

export type ArSnapNative = {
  ok?: boolean;
  mime?: string;
  data?: string;
  reason?: string;
};

export type ArSnapParsed = {
  ok: boolean;
  mime: string;
  data: string;
  reason: ArSnapReason;
};

export const AR_SNAP_QUALITY = 0.82;
export const AR_SNAP_MIME = "image/jpeg";

const REASONS: ArSnapReason[] = [
  "ok",
  "not-ready",
  "busy",
  "empty",
  "denied",
  "unsupported",
  "fail",
];

export function arCanSnap(args: { ready: boolean; busy: boolean }): ArSnapReason {
  if (args.busy) return "busy";
  if (!args.ready) return "not-ready";
  return "ok";
}

export function arSnapCoach(
  reason: ArSnapReason,
  product: ArSnapProduct,
): string {
  if (reason === "ok") {
    if (product === "emily") return "Save a photo of me in your room.";
    if (product === "scan") return "Save a photo of this exhibit.";
    if (product === "cubes") return "Save a photo of your cubes.";
    return "Save a photo of this fossil on your table.";
  }
  if (reason === "not-ready") {
    if (product === "emily") return "Place me first, then save a photo.";
    if (product === "scan") return "Find the marker first, then save a photo.";
    if (product === "cubes") return "Place a cube first, then save a photo.";
    return "Place the fossil first, then save a photo.";
  }
  if (reason === "busy") return "Saving…";
  if (reason === "empty") return "Nothing to save yet.";
  if (reason === "denied") return "";
  if (reason === "unsupported") return "Saved to your downloads.";
  return "Couldn't save that photo. Try again.";
}

export function arSnapDoneCoach(reason: ArSnapReason): string {
  if (reason === "ok") return "Photo ready — share it from the sheet.";
  if (reason === "unsupported") return "Saved to your downloads.";
  if (reason === "denied") return "";
  return arSnapCoach(reason, "place");
}

export function arSnapSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug || "souvenir";
}

export function arSnapPrefix(product: ArSnapProduct): string {
  if (product === "place") return "coh";
  if (product === "scan") return "origins";
  if (product === "emily") return "emily";
  return "cube-ar";
}

export function arSnapStamp(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function arSnapFilename(
  product: ArSnapProduct,
  title = "",
  now: Date = new Date(),
): string {
  return `${arSnapPrefix(product)}-${arSnapSlug(title)}-${arSnapStamp(now)}.jpg`;
}

export function arSnapTitle(product: ArSnapProduct, title = ""): string {
  if (title.trim()) return title.trim();
  if (product === "emily") return "Emily";
  if (product === "cubes") return "Cube AR";
  if (product === "scan") return "Origins Centre";
  return "Cradle of Humankind";
}

export function arParseSnapReason(raw: string | undefined): ArSnapReason {
  return REASONS.includes(raw as ArSnapReason) ? (raw as ArSnapReason) : "fail";
}

export function arParseSnapResult(
  data: ArSnapNative | null | undefined,
): ArSnapParsed {
  const mime =
    typeof data?.mime === "string" && data.mime.startsWith("image/")
      ? data.mime
      : AR_SNAP_MIME;
  const b64 = typeof data?.data === "string" ? data.data.replace(/\s+/g, "") : "";
  if (data?.ok && b64.length > 32) {
    return { ok: true, mime, data: b64, reason: "ok" };
  }
  return {
    ok: false,
    mime,
    data: "",
    reason: data?.ok === false ? arParseSnapReason(data.reason) : "empty",
  };
}

export function arBlobFromBase64(
  data: string,
  mime = AR_SNAP_MIME,
): Blob {
  const clean = data.replace(/\s+/g, "");
  const bytes = decodeB64(clean);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: mime });
}

function decodeB64(clean: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  const g = globalThis as {
    Buffer?: { from: (s: string, enc: string) => Uint8Array };
  };
  if (g.Buffer) return Uint8Array.from(g.Buffer.from(clean, "base64"));
  throw new Error("base64");
}

export function arCanvasToBlob(
  canvas: HTMLCanvasElement,
  quality = AR_SNAP_QUALITY,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(
        (blob) => resolve(blob && blob.size > 32 ? blob : null),
        AR_SNAP_MIME,
        quality,
      );
    } catch {
      resolve(null);
    }
  });
}

export async function arCompositeSnap(
  background: Blob | CanvasImageSource,
  overlay: HTMLCanvasElement,
  quality = AR_SNAP_QUALITY,
): Promise<Blob | null> {
  const src =
    background instanceof Blob
      ? await blobToImage(background)
      : background;
  if (!src) return arCanvasToBlob(overlay, quality);
  const w =
    "videoWidth" in src && src.videoWidth
      ? src.videoWidth
      : "naturalWidth" in src && src.naturalWidth
        ? src.naturalWidth
        : overlay.width;
  const h =
    "videoHeight" in src && src.videoHeight
      ? src.videoHeight
      : "naturalHeight" in src && src.naturalHeight
        ? src.naturalHeight
        : overlay.height;
  if (!w || !h) return arCanvasToBlob(overlay, quality);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, w, h);
  ctx.drawImage(overlay, 0, 0, w, h);
  return arCanvasToBlob(out, quality);
}

async function blobToImage(blob: Blob): Promise<CanvasImageSource | null> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* fall through */
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export async function arShareSnap(args: {
  blob: Blob;
  filename: string;
  title: string;
  text?: string;
}): Promise<ArSnapReason> {
  const file = new File([args.blob], args.filename, {
    type: args.blob.type || AR_SNAP_MIME,
  });
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  try {
    if (nav?.canShare?.({ files: [file] })) {
      await nav.share({
        files: [file],
        title: args.title,
        text: args.text ?? args.title,
      });
      return "ok";
    }
  } catch (err) {
    if ((err as DOMException)?.name === "AbortError") return "denied";
  }
  if (typeof document === "undefined") return "fail";
  try {
    const url = URL.createObjectURL(args.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = args.filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return "unsupported";
  } catch {
    return "fail";
  }
}
