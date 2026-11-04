import { execFileSync } from "node:child_process";
/** Update static gallery cards, optional lightbox content and prices from the JSON files. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
// Load the formatter before making any changes, so missing dependencies fail safely.
const prettier = await import("prettier");
const pages = new Map();
const portraits = JSON.parse(read("src/data/portraits.json"));
const prices = JSON.parse(read("src/data/prices.json"));
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
const ids = new Set();
for (const art of portraits) {
  if (!art.id || ids.has(art.id)) throw new Error(`Missing or duplicate artwork ID: ${art.id}`);
  ids.add(art.id);
  if (!art.image?.startsWith("/assets/images/") || !fs.existsSync(path.join(root, art.image)))
    throw new Error(`Missing local artwork image: ${art.image}`);
}
for (const row of prices.sizes)
  if (!Number.isFinite(row.price) || row.price <= 0)
    throw new Error("Prices must be positive numbers.");
const order = ["mazie", "duncan", "juanita", "masquerade", "wangelisa"];
const featured = order.map((part) => portraits.find((p) => p.id.includes(part))).filter(Boolean);
const ordered = [...featured, ...portraits.filter((p) => !featured.includes(p))];
function dimensions(src) {
  const bytes = fs.readFileSync(path.join(root, src));
  // Original assets use WebP. Include intrinsic dimensions to prevent layout shift.
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    let offset = 12;
    while (offset + 8 < bytes.length) {
      const kind = bytes.toString("ascii", offset, offset + 4),
        size = bytes.readUInt32LE(offset + 4),
        start = offset + 8;
      if (kind === "VP8X")
        return [1 + bytes.readUIntLE(start + 4, 3), 1 + bytes.readUIntLE(start + 7, 3)];
      if (kind === "VP8 ")
        return [bytes.readUInt16LE(start + 6) & 0x3fff, bytes.readUInt16LE(start + 8) & 0x3fff];
      if (kind === "VP8L") {
        const b = bytes.readUInt32LE(start + 1);
        return [(b & 0x3fff) + 1, ((b >>> 14) & 0x3fff) + 1];
      }
      offset += 8 + size + (size % 2);
    }
  }
  // For another format, browser intrinsic dimensions still preserve the artwork ratio.
  return null;
}
function card(art, language, home = false) {
  const caption = art.caption?.[language] || art.description?.[language] || art.name;
  const alt = art.description?.[language] || caption;
  const dims = dimensions(art.image);
  return `<figure class="art-card"><a href="${escape(art.image)}" data-portrait="${escape(art.id)}" aria-label="${escape((language === "sv" ? "Visa " : "View ") + alt)}"${home ? ' class="art-image"' : ""}><img src="${escape(art.image)}" alt="${escape(alt)}"${dims ? ` width="${dims[0]}" height="${dims[1]}"` : ""} loading="lazy" decoding="async"></a><figcaption class="art-caption"><strong>${escape(caption)}</strong><span>${language === "sv" ? "Olja på linneduk" : "Oil on linen"}</span></figcaption></figure>`;
}
const configurations = [
  {
    language: "en",
    home: "index.html",
    gallery: "html/pet-portraits-oils-gallery.html",
    prices: "html/pet-portrait-commission-prices.html",
    wildlife: "html/wildlife-art-oils-gallery.html",
  },
  {
    language: "sv",
    home: "se/index.html",
    gallery: "se/djurportratt-olja-galleri.html",
    prices: "se/priser-for-djurportratt.html",
    wildlife: "se/djurmotiv-olja-galleri.html",
  },
];
for (const config of configurations) {
  const language = config.language;
  for (const key of ["home", "gallery"]) {
    const filename = config[key];
    let page = read(filename);
    const cards =
      key === "home"
        ? ["mazie", "juanita", "wangelisa"]
            .map((part) => portraits.find((a) => a.id.includes(part)))
            .filter(Boolean)
        : ordered;
    const className = key === "home" ? "featured-grid" : "masonry";
    const regex = new RegExp(`<div class="${className}">[\\s\\S]*?<\\/div>`);
    if (!regex.test(page)) throw new Error(`Cannot locate ${className} in ${filename}`);
    page = page.replace(
      regex,
      `<div class="${className}">${cards.map((a) => card(a, language, key === "home")).join("")}</div>`
    );
    const data = JSON.stringify(portraits).replace(/<\//g, "<\\/");
    page = page.replace(
      /(<script type="application\/json" id="portrait-data">)[\s\S]*?(<\/script>)/,
      () => `<script type="application/json" id="portrait-data">${data}</script>`
    );
    pages.set(filename, page);
  }
  let pricePage = read(config.prices);
  const rows = prices.sizes
    .map(
      (row) =>
        `<tr><td data-description="${escape(row[language])}">${escape(row.cm)} cm${row.inches ? `<br><small>${escape(row.inches)} ${language === "sv" ? "tum (ca)" : "in (approx.)"}</small>` : ""}</td><td>${escape(row[language])}</td><td><span class="dcconvert" data-amount="${row.price}">€${row.price.toLocaleString("en-GB")}</span></td></tr>`
    )
    .join("");
  pricePage = pricePage.replace(/<tbody>[\s\S]*?<\/tbody>/, `<tbody>${rows}</tbody>`);
  // Keep the existing final-quote note. Only replace our legacy preview wording.
  const finalNote =
    language === "sv"
      ? "Alla grundpriser är i EUR. Ditt slutliga pris bekräftas innan bokning."
      : "All base prices are in EUR. Your final quote is confirmed before booking.";
  pricePage = pricePage.replace(
    /<p class="price-note">\s*(?:Provisional EUR prices|Preliminära EUR-priser)[\s\S]*?<\/p>/g,
    `<p class="price-note">${finalNote}</p>`
  );
  pages.set(config.prices, pricePage);
  let wildlife = read(config.wildlife);
  let index = 0;
  const values = [prices.wildlife.wonderment, prices.wildlife["curious-encounter"]];
  wildlife = wildlife.replace(
    /<p class="wildlife-price">[^<]*<\/p>/g,
    () => `<p class="wildlife-price">€${values[index++].toLocaleString("en-GB")}</p>`
  );
  if (prices.wildlifeProvisional === false)
    wildlife = wildlife.replace(/<p class="price-note"[^>]*>[\s\S]*?<\/p>/g, "");
  pages.set(config.wildlife, wildlife);
}
// Format every page before writing any of them.
for (const [filename, page] of pages) {
  pages.set(
    filename,
    await prettier.format(page, {
      parser: "html",
      printWidth: 100,
      tabWidth: 2,
    })
  );
}
for (const [filename, page] of pages) {
  fs.writeFileSync(path.join(root, filename), page);
}
console.log(
  `Updated ${portraits.length} portraits, EN/SV gallery cards and EUR prices (converter markup preserved).`
);

// Reapply responsive markup after cards are rebuilt.
execFileSync(process.execPath, [path.join(root, "scripts/responsive-images.mjs")], {
  stdio: "inherit",
});
