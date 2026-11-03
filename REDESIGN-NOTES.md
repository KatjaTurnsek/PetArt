# Redesign handoff — 29 October 2026

## Implemented

27 existing HTML pages: 12 English, 12 Swedish and 3 error pages. All use the new visual system. The homepage, gallery, prices and mobile navigation follow the supplied wireframes, with spelling and small copy/link corrections. The price-table size is 60 × 45 cm, matching the source price list; the frame's 60 × 44 cm was treated as a typo.

The supporting pages have complete layouts and working internal navigation. The original photographs remain in the project and unchanged. In the artist sections the real existing photograph is used for now. The signature is the SVG previously traced from the supplied signature image.

## Checks completed

- CSS production build and JavaScript syntax checks.
- Existing HTML path inventory retained.
- Canonical and alternate-language tag attributes compared with the original ZIP.
- Original robots.txt, .htaccess, sitemap.xml and image bytes compared with the original ZIP.
- Internal asset/page references and fragment targets checked.
- Structured-data JSON parsed; one H1, unique IDs and form label associations checked.
- 36 gallery paintings and 53 testimonial entries per language retained.
- No painted-year labels or old SEK/deposit/style-selection copy on published HTML.
- Browser review of desktop homepage, gallery/lightbox, contact, mobile menu and mobile prices.
- English 390px and Swedish 320px mobile frames checked for horizontal overflow.
- Menu Escape/focus return, artwork next/previous and artwork enquiry prefill checked.

## Before replacing the live site

- Confirm the provisional EUR values in `src/data/prices.json`; set `provisional` to false and rebuild.
- Review copy and the supplied cancellation/returns policies, particularly the distinction between commissions and wildlife originals. Only the approved payment/currency changes were made to the terms.
- Send one real enquiry on the intended domain and confirm receipt/thank-you redirect. No message was sent during development.
- Check the existing analytics consent setup and mark `generate_lead` as a key event in GA4 if desired. Source changes do not change GA4 account settings.
- Inspect the final deployment on the current Apache hosting; the local preview does not emulate its redirects, mail service or caching rules.

No production deployment, Git push or hosting change was performed.
