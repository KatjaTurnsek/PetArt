# Pet Art with Heart — redesign

Complete static redesign of the existing English and Swedish website. All original page paths, canonical/hreflang tags, `robots.txt`, `.htaccess`, sitemap and original image bytes are retained. Nothing has been deployed.

## Open locally

Use Node 20 or later (Node 22 is suitable):

```sh
npm install
npm run build
npm run dev
```

Open `http://localhost:3000`. VS Code Live Server is also suitable. Use a server rather than opening individual HTML files directly, because the site retains its original root-relative links.

`npm run build` updates the static gallery/lightbox data and prices, then builds `dist/styles.min.css` using the existing PostCSS setup. No framework or CMS was introduced. HTML remains indexable without JavaScript; a no-script mobile navigation fallback is included.

## Add a painting

1. Add the image under `assets/images/pet-portraits/`.
2. Add one object to `src/data/portraits.json`, following an existing entry. Use a unique `id`, the image's root-relative URL, name, EN/SV descriptions/captions and dimensions. Do not add the year.
3. Run `npm run build`.

This creates both English and Swedish gallery cards and the lightbox data. Artwork proportions are preserved. Optional future fields are hidden when empty:

```json
{
  "story": {
    "en": "The story behind this portrait.",
    "sv": "Berättelsen bakom porträttet."
  },
  "progressImages": [
    {"src": "/assets/images/example-progress.webp", "alt": {"en": "Painting in progress", "sv": "Målningen under arbete"}}
  ],
  "framedImages": [
    {"src": "/assets/images/example-framed.webp", "alt": {"en": "The framed portrait", "sv": "Det inramade porträttet"}}
  ],
  "testimonial": {
    "en": {"quote": "An exact client quote", "author": "Client name"},
    "sv": {"quote": "Ett exakt kundcitat", "author": "Kundens namn"}
  }
}
```

Only add images that actually exist. The lightbox supports Escape, previous/next arrow keys, native modal focus handling and an artwork-specific enquiry link. Without JS, artwork links open the original image.

## Prices — provisional

The EUR values are **design placeholders, not researched prices or exchange-rate conversions**:

| Canvas | Placeholder |
| --- | ---: |
| 30 × 25 cm | €1,100 |
| 40 × 30 cm | €1,450 |
| 45 × 35 cm | €1,800 |
| 50 × 40 cm | €2,150 |
| 60 × 45 cm | €2,600 |

Wildlife placeholders: Wonderment €4,200; Curious Encounter €3,200.

Edit `src/data/prices.json`, then run `npm run build`. Set `"provisional": false` only once all pet and wildlife amounts are confirmed; this removes the preview price notes from both languages. Payment wording throughout uses a 50% deposit, with the remaining 50% after completion and client approval, before dispatch. No online checkout was added.

## Design and content

- Warm white, espresso, olive, burnt orange and warm beige; Libre Caslon Text with Inter.
- Desktop layouts follow the supplied frames; mobile layouts are responsive.
- Existing photographs are used in place of the temporary generated studio picture.
- All original image files remain unchanged. The previously traced signature SVG is added beneath the artist introduction.
- All 36 portraits and all 53 testimonial entries in each language are retained.
- No Painterly/Detailed product split, painted years or gallery filters.
- About, Photo Tips, Testimonials, Wildlife Art, Contact, policies, sitemap, thank-you and error pages use the same design system.
- Titles, descriptions and sharing metadata are rewritten in EN/SV. Routing metadata, verification tokens and noindex directives are retained.
- Structured data describes the actual page and service, without stale SEK offers, fabricated ratings or mismatched FAQ content.
- Terms are retained with the agreed payment/currency changes and a more accurate service-provider privacy sentence. The remaining cancellation and returns wording is the supplied policy, not newly drafted legal advice.

## Contact form and analytics

The existing Web3Forms action, public access key and original thank-you redirect URLs are retained. Fields include name, email, pet, size, ideas and a photo link; original files can be sent by email. Do not expect an image-upload widget.

With JavaScript the form shows sending/error feedback, preserves input on failure and redirects only after the service confirms success. Without JS the original POST submission still works. No live enquiry was submitted during development.

The existing `src/js/analytics.js` implementation is retained. Added events are `portrait_view`, `enquiry_click`, `contact_click`, and `generate_lead`. A lead is recorded only after Web3Forms confirms success. Click events are not counted as confirmed enquiries. Consent configuration has not been redesigned.

## Move into your Git branch

1. Keep your current repository and `.git` directory.
2. Extract the ZIP elsewhere, then copy the **contents** of `PetArt-redesign/` into your repository on `redesign/pet-art`.
3. Review `git diff`, run the local preview and confirm the provisional prices.
4. Commit when ready. Deployment to your existing hosting is a separate step.

The existing deployment script is included unchanged. Do not run it just to preview; it writes to the configured hosting document root.

## Verification

See `REDESIGN-NOTES.md` for checks and the remaining launch checks.
