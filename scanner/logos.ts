import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";
import { emptyField, type ImportConflict, type ImportRow } from "./merge.ts";

const webpPath = /^logos\/[\w.-]+\.webp$/i;
const placeholderName = /^(?:.*[_.-])?(?:placeholder|blank|transparent|spacer|generic|fallback|default|no[_.-]?(?:logo|image))(?:[_.-].*)?\.webp$/i;
const maxBytes = 8 * 1024 * 1024;
const minBytes = 256;
const minSide = 64;

async function fileAt(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function inspect(path: string, logo: string) {
  const name = logo.slice("logos/".length);
  if (placeholderName.test(name)) throw Error("placeholder filename");
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let bytes: Buffer;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw Error("expected a regular file of at most 8 MiB");
    bytes = await file.readFile();
    if (bytes.length > maxBytes) throw Error("file exceeds 8 MiB");
  } finally {
    await file.close();
  }
  if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WEBP" || bytes.readUInt32LE(4) !== bytes.length - 8)
    throw Error("invalid WebP");
  const raster = sharp(bytes, { animated: true, limitInputPixels: 16_000_000, failOn: "warning" });
  const { width, height, pageHeight } = await raster.metadata();
  if (Math.min(width, pageHeight ?? height) < minSide)
    throw Error(`image is ${width}×${pageHeight ?? height}, minimum side is ${minSide}px`);
  if (bytes.length < minBytes) throw Error(`file is ${bytes.length} bytes, minimum is ${minBytes}`);
  // Decode the full raster, including animation frames, and check visual variation.
  const { channels, isOpaque } = await raster.stats();
  if ((!isOpaque && channels.at(-1)?.max === 0) ||
      channels.every(({ min, max }) => max - min <= 8))
    throw Error("blank or single-colour image");
  return bytes;
}

export async function planLogos(exportPath: string, rows: ImportRow[]) {
  const from = dirname(resolve(exportPath));
  const staged = new Map<string, Buffer>();
  const inspected = new Map<string, Promise<{ bytes: Buffer } | { reason: string }>>();
  const inspectOnce = (path: string, logo: string) => {
    if (!inspected.has(path)) {
      inspected.set(path, inspect(path, logo).then(
        (bytes) => ({ bytes }),
        (error: NodeJS.ErrnoException) => ({ reason: error.code === "ENOENT" ? "logo file missing" : error.message }),
      ));
    }
    return inspected.get(path)!;
  };
  const rejections: { event_id: string; export_id: string; logo: unknown; reason: string }[] = [];
  const conflicts: ImportConflict[] = [];
  let fieldsFilled = 0;
  for (const { event, previous, incoming } of rows) {
    const { logo, logo_kind: kind } = incoming;
    const ids = { event_id: event.id, export_id: incoming.id };
    const reject = (reason: string) => rejections.push({ ...ids, logo, reason });
    const conflict = (field: "logo" | "logo_kind") => {
      if (incoming[field] !== undefined && !emptyField(previous?.[field]) && previous?.[field] !== incoming[field])
        conflicts.push({ ...ids, field, curated: previous?.[field], incoming: incoming[field], reason: "curated value kept" });
    };
    const curatedLogo = previous?.logo;
    // Reset the logo pair on new rows until the imported asset or a local file is usable.
    if (!previous && (!emptyField(logo) || !emptyField(kind))) {
      event.logo = null;
      event.logo_kind = null;
    }
    if (emptyField(logo)) {
      conflict("logo");
      conflict("logo_kind");
      continue;
    }
    if (typeof logo !== "string" || !webpPath.test(logo)) {
      reject("expected logos/<filename>.webp");
      conflict("logo");
      conflict("logo_kind");
      continue;
    }
    if (!emptyField(curatedLogo) && curatedLogo !== logo) {
      reject(`existing curated logo kept (${curatedLogo})`);
      conflict("logo");
      conflict("logo_kind");
      continue;
    }
    const dest = join("public", logo);
    const result = await inspectOnce(join(from, logo), logo);
    const destination = await fileAt(dest);
    const local = destination ? await inspectOnce(dest, logo) : undefined;
    if ("reason" in result) reject(result.reason === "logo file missing" ? "export logo file missing" : result.reason);
    if (local && "reason" in local) reject(`existing logo file kept but unusable: ${local.reason}`);
    const useImportedBytes = "bytes" in result && (!local || "bytes" in local && local.bytes.equals(result.bytes));
    if ("bytes" in result && local && "bytes" in local && !useImportedBytes) reject("existing logo file kept");
    if (useImportedBytes && !destination) staged.set(dest, result.bytes);
    if ((!local || "reason" in local) && !staged.has(dest)) {
      conflict("logo_kind");
      continue;
    }
    if (event.logo !== logo) {
      event.logo = logo;
      if (previous && emptyField(curatedLogo)) fieldsFilled++;
    }
    if (useImportedBytes && emptyField(event.logo_kind) && !emptyField(kind)) {
      event.logo_kind = kind;
      if (previous) fieldsFilled++;
    } else conflict("logo_kind");
  }
  return { staged, rejections, conflicts, fieldsFilled };
}
