# Pet Art with Heart

![Portfolio Screenshot](https://pet-art.net/assets/images/petart-preview.webp)

Static website for custom, hand-painted pet portraits in oils.

## 📍 Live Site

[https://pet-art.net/](https://pet-art.net/)

## 💻 GitHub Repository

[https://github.com/KatjaTurnsek/PetArt](https://github.com/KatjaTurnsek/PetArt)

## 📝 What this is

- Plain HTML + CSS + a little vanilla JS
- One production CSS file built from multiple source files
- Hosted on Midphase/StackCP (Apache) with `.htaccess` for redirects/caching

## 🔧 Built With

- HTML5
- CSS3 (custom properties)
- JavaScript (no framework)
- PostCSS + `postcss-import` + `cssnano` (build step)

## 📁 Project Structure (excerpt)

```text
assets/
  images/
  icons.svg

src/
  css/
    reset.css
    variables.css
    global.css
    home.css
    about.css
    contact.css
    gallery.css
    prices.css
  js/
    analytics.js
    up.js

dist/
  styles.min.css

index.html
sitemap.xml
robots.txt
.htaccess
```

## 🧱 Local Development

Open `index.html` in a browser (or use VS Code “Live Server”).

### Build CSS

Install once:

```bash
npm install
```

### Build

```bash
npm run build:css
```

### Watch

```bash
npm run watch:css
```

Pages load the built CSS:

<link rel="stylesheet" href="/dist/styles.min.css?v=1" />

## 🚀 Deploy (StackCP)

1. Run `npm run build:css`.
2. Upload `dist/styles.min.css` and any changed HTML/assets.
3. `.htaccess` handles:

- `www` → `https://pet-art.net/`
- HTTP → HTTPS (CDN-safe)
- `/index.html` → `/`
- Legacy `.htm` routes
- Asset caching

## 🔍 SEO & Robots

- Canonical: `https://pet-art.net/`
- `hreflang` for `/` and `/se/`
- `robots.txt` → `https://pet-art.net/sitemap.xml`

## 📄 Notes

- This repo **commits** a single built file: `dist/styles.min.css` (so the site previews correctly on GitHub and anywhere the repo is browsed).
- All other build artifacts in `dist/` are ignored.
- On deploy, you can either:
  - rebuild locally (`npm run build:css`) and upload the new `dist/styles.min.css`, **or**
  - keep the committed `dist/styles.min.css` in sync with your changes and publish it via StackCP.

## 🙋‍♀️ Author

**Katja Turnšek**  
Front-End Developer & Designer  
[Portfolio Website](https://katjaturnsek.github.io/portfolio/)  
[GitHub](https://github.com/KatjaTurnsek)
