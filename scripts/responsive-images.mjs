import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { format } from "prettier";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const layouts = JSON.parse(
  await fs.readFile(path.join(root, "scripts/image-layouts.json"), "utf8")
);
const result = {};
let created = 0;
for (const src of [...new Set(Object.values(layouts).flatMap((p) => Object.keys(p)))].sort()) {
  const input = path.join(root, src);
  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height || (meta.pages || 1) > 1)
    throw new Error(`Unsupported image: ${src}`);
  const sources = [];
  for (const width of [320, 480, 800]) {
    if (width >= meta.width) continue;
    const outputSrc =
      "/assets/images/responsive/" +
      src.replace(/^\/assets\/images\//, "").replace(/\.[^.]+$/, `-${width}.webp`);
    const output = path.join(root, outputSrc);
    await fs.mkdir(path.dirname(output), { recursive: true });
    let fresh = false;
    try {
      fresh = (await fs.stat(output)).mtimeMs >= (await fs.stat(input)).mtimeMs;
    } catch {}
    if (!fresh) {
      await sharp(input)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 85, effort: 6 })
        .toFile(output);
      created++;
    }
    sources.push({ src: outputSrc, width });
  }
  sources.push({ src, width: meta.width });
  result[src] = { width: meta.width, height: meta.height, sources };
}
await fs.mkdir(path.join(root, "assets/data"), { recursive: true });
await fs.writeFile(
  path.join(root, "assets/data/responsive-images.json"),
  JSON.stringify(result, null, 2) + "\n"
);
for (const [page, images] of Object.entries(layouts)) {
  const filename = path.join(root, page);
  let html = await fs.readFile(filename, "utf8");
  html = html.replace(/<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="image")[^>]*>/gi, "");
  html = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = tag.match(/\bsrc="([^"]+)"/)?.[1];
    if (!result[src]) return tag;
    const data = result[src];
    tag = tag.replace(/\s+(?:width|height|srcset|sizes)="[^"]*"/gi, "");
    const dynamic = /\bid="art-image"/.test(tag);
    const sizes = images[src];
    const attrs =
      ` width="${data.width}" height="${data.height}"` +
      (!dynamic && sizes
        ? ` srcset="${data.sources.map((s) => `${s.src} ${s.width}w`).join(", ")}" sizes="${sizes}"`
        : "");
    return tag.replace(/\s*\/?>$/, attrs + " />");
  });
  await fs.writeFile(filename, await format(html, { parser: "html", printWidth: 100, tabWidth: 2 }));
}
console.log(
  `Prepared ${Object.keys(result).length} images; created ${created} derivatives; updated ${Object.keys(layouts).length} pages.`
);
