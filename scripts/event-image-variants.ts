import { readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

export async function generateEventImageVariants(directory: string) {
  const originals = (await readdir(directory, { withFileTypes: true })).filter(
    (entry) => entry.isFile() && /\.webp$/i.test(entry.name) && !/-(thumb|480)\.webp$/i.test(entry.name),
  );
  for (const { name } of originals) {
    const original = join(directory, name);
    for (const [suffix, width] of [["thumb", 160], ["480", 480]] as const) {
      const output = original.replace(/\.webp$/i, `-${suffix}.webp`);
      const image = sharp(original).resize({ width, withoutEnlargement: true });
      let quality = suffix === "thumb" ? 70 : 78;
      let data = await image.webp({ quality }).toBuffer();
      while (suffix === "thumb" && data.length > 20_000 && quality > 10) {
        quality -= 10;
        data = await image.webp({ quality, alphaQuality: quality }).toBuffer();
      }
      if (suffix === "thumb" && data.length > 20_000)
        throw new Error(`Thumbnail exceeds 20 KB: ${name}`);
      const temporary = `${output}.${process.pid}.tmp`;
      await writeFile(temporary, data);
      await rename(temporary, output);
    }
  }
}
