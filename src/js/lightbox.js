/* Portrait browsing, enlargement and zoom controls. No shared script dependency. */
(() => {
  "use strict";

  // Language and analytics
  const language = document.body.dataset.language || "en";
  const sv = language === "sv";
  const translate = (en, se) => (sv ? se : en);

  const track = (name, parameters = {}) => {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, parameters);
    }
  };

  // Scroll reveals
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const motionAnimations = new Set();

  reducedMotion.addEventListener("change", (event) => {
    if (event.matches) {
      motionAnimations.forEach((animation) => animation.cancel());
    }
  });

  // Portrait lightbox
  const lightbox = document.getElementById("art-lightbox");

  const initialisePortraitLightbox = async () => {
    if (!lightbox || typeof lightbox.showModal !== "function") return;

    let portraits;

    try {
      const response = await fetch("/assets/data/portraits.json");

      if (!response.ok) {
        throw new Error("Portrait data could not be loaded");
      }

      portraits = await response.json();

      if (!Array.isArray(portraits) || !portraits.length) return;
    } catch {
      // Keep the original image links working if data cannot be loaded.
      return;
    }

    const triggers = [...document.querySelectorAll("a[data-portrait]")];

    // Next/previous follow the order of portraits on the page.
    const ordered = triggers
      .map((a) => portraits.find((p) => p.id === a.dataset.portrait))
      .filter(Boolean);

    let selected = 0;
    let previousFocus;

    const byId = (id) => document.getElementById(id);

    const safeImage = (src, alt) => {
      if (typeof src !== "string" || !src.startsWith("/assets/images/")) {
        return null;
      }

      const img = document.createElement("img");
      img.src = src;
      img.alt = alt || "";
      img.loading = "lazy";

      return img;
    };

    const addParagraph = (parent, text) => {
      if (!text) return;

      const p = document.createElement("p");
      p.textContent = text;
      parent.append(p);
    };

    // Enlarged image dialog
    const zoomDialog = document.createElement("dialog");
    zoomDialog.className = "art-zoom";
    zoomDialog.setAttribute("aria-label", translate("Enlarged portrait", "Förstorat porträtt"));

    const zoomBar = document.createElement("div");
    zoomBar.className = "art-zoom-bar";

    const zoomHint = document.createElement("span");
    zoomHint.textContent = translate("Tap the image to zoom", "Tryck på bilden för att zooma");

    const zoomClose = document.createElement("button");
    zoomClose.type = "button";
    zoomClose.className = "icon-button";
    zoomClose.textContent = "×";
    zoomClose.setAttribute("aria-label", translate("Close enlarged image", "Stäng förstorad bild"));

    zoomBar.append(zoomHint, zoomClose);

    const zoomViewport = document.createElement("div");
    zoomViewport.className = "art-zoom-viewport";

    const zoomImage = document.createElement("img");
    zoomImage.alt = "";
    zoomViewport.append(zoomImage);

    const zoomStage = document.createElement("div");
    zoomStage.className = "art-zoom-stage";

    const guidance = document.createElement("div");
    guidance.className = "art-zoom-guidance";
    guidance.hidden = true;
    guidance.setAttribute("aria-hidden", "true");

    const makeIcon = (pathData) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

      path.setAttribute("d", pathData);
      svg.append(path);

      return svg;
    };

    const directionArrows = {};

    for (const direction of ["up", "down", "left", "right"]) {
      const arrow = document.createElement("span");

      arrow.className = "art-zoom-arrow art-zoom-arrow--" + direction;
      arrow.append(makeIcon("M12 19V5M5 12l7-7 7 7"));

      directionArrows[direction] = arrow;
      guidance.append(arrow);
    }

    const guidanceText = document.createElement("span");
    guidanceText.className = "art-zoom-guidance-text";
    guidanceText.textContent = translate(
      "Swipe to explore · Tap to zoom out",
      "Svep för att se mer · Tryck för att zooma ut"
    );

    guidance.append(guidanceText);
    zoomStage.append(zoomViewport, guidance);
    zoomDialog.append(zoomBar, zoomStage);

    let guidanceDismissed = false;

    const zoomInstructions = () => {
      const zoomed = zoomImage.dataset.zoomed === "true";

      zoomHint.textContent = zoomed
        ? translate(
            "Swipe to explore · Tap to zoom out",
            "Svep för att se mer · Tryck för att zooma ut"
          )
        : translate("Tap the image to zoom", "Tryck på bilden för att zooma");

      guidance.hidden = !zoomed || guidanceDismissed;

      const room = {
        left: zoomViewport.scrollLeft > 2,
        right: zoomViewport.scrollLeft + zoomViewport.clientWidth < zoomViewport.scrollWidth - 2,
        up: zoomViewport.scrollTop > 2,
        down: zoomViewport.scrollTop + zoomViewport.clientHeight < zoomViewport.scrollHeight - 2,
      };

      for (const direction of Object.keys(room)) {
        directionArrows[direction].hidden = !room[direction];
      }
    };

    zoomImage.addEventListener("load", zoomInstructions);

    zoomViewport.addEventListener(
      "scroll",
      () => {
        if (zoomImage.dataset.zoomed === "true") {
          guidanceDismissed = true;
        }

        zoomInstructions();
      },
      { passive: true }
    );

    window.addEventListener("resize", zoomInstructions);
    document.body.append(zoomDialog);

    // Enlarge link beside the close button
    const enlargeLink = document.createElement("button");
    enlargeLink.type = "button";
    enlargeLink.className = "lightbox-enlarge";
    enlargeLink.textContent = translate("Enlarge image ↗", "Förstora bilden ↗");

    lightbox
      .querySelector(".lightbox-top")
      .insertBefore(enlargeLink, lightbox.querySelector("[data-close-art]"));

    // Magnifying glass on the painting
    const imageEnlarge = document.createElement("button");
    imageEnlarge.type = "button";
    imageEnlarge.className = "lightbox-image-enlarge";
    imageEnlarge.setAttribute("aria-label", translate("Enlarge image", "Förstora bilden"));
    imageEnlarge.title = translate("Enlarge image", "Förstora bilden");

    imageEnlarge.append(
      makeIcon("M21 21l-5-5M10.5 7v7M7 10.5h7M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0")
    );

    imageEnlarge.addEventListener("click", () => enlargeLink.click());
    lightbox.querySelector(".lightbox-art").append(imageEnlarge);

    enlargeLink.addEventListener("click", () => {
      zoomImage.src = byId("art-image").src;
      zoomImage.alt = byId("art-image").alt;
      zoomImage.style.width = "100%";
      zoomImage.dataset.zoomed = "false";
      guidanceDismissed = false;

      zoomInstructions();
      zoomDialog.showModal();
      zoomViewport.scrollTo(0, 0);
      zoomClose.focus();
    });

    zoomImage.addEventListener("click", () => {
      const zoomed = zoomImage.dataset.zoomed !== "true";

      guidanceDismissed = false;
      zoomImage.dataset.zoomed = String(zoomed);

      zoomImage.style.width = zoomed
        ? Math.max(zoomImage.naturalWidth, zoomViewport.clientWidth * 2) + "px"
        : "100%";

      requestAnimationFrame(zoomInstructions);
    });

    zoomClose.addEventListener("click", () => zoomDialog.close());
    zoomDialog.addEventListener("close", () => enlargeLink.focus());

    // Preload portraits before replacing the current image.
    let renderRequest = 0;
    const activeFades = new Set();

    const preload = (src) =>
      new Promise((resolve) => {
        const image = new Image();
        let settled = false;

        const finish = (ok) => {
          if (settled) return;

          settled = true;
          clearTimeout(timeout);
          image.onload = image.onerror = null;
          resolve(ok ? image : false);
        };

        const timeout = setTimeout(() => finish(false), 15000);

        image.onload = async () => {
          try {
            await image.decode?.();
          } catch {
            // A loaded image remains usable if decoding rejects.
          }

          finish(true);
        };

        image.onerror = () => finish(false);
        image.src = src;
      });

    const render = async (index) => {
      if (!ordered.length) return;

      selected = (index + ordered.length) % ordered.length;

      const art = ordered[selected];
      const request = ++renderRequest;
      const ready = await preload(art.image);

      // Ignore requests superseded by a newer selection.
      if (request !== renderRequest) return null;

      if (!ready) {
        byId("art-count").textContent = translate(
          "Image could not load. Try another portrait.",
          "Bilden kunde inte laddas. Prova ett annat porträtt."
        );

        return false;
      }

      byId("art-image").width = ready.naturalWidth;
      byId("art-image").height = ready.naturalHeight;
      byId("art-image").src = art.image;
      byId("art-image").alt = art.description?.[language] || art.name;
      byId("art-title").textContent = art.name;
      byId("art-description").textContent = art.description?.[language] || "";
      byId("art-size").textContent = art.dimensions || "";
      byId("art-count").textContent = `${selected + 1} / ${ordered.length}`;

      const extras = byId("art-extras");
      extras.replaceChildren();

      const story = art.story?.[language];

      if (story) {
        const section = document.createElement("div");
        section.className = "lightbox-extra";

        addParagraph(section, story);
        extras.append(section);
      }

      for (const [field, heading] of [
        ["progressImages", translate("In the studio", "I ateljén")],
        ["framedImages", translate("In its home", "I sitt hem")],
      ]) {
        if (!Array.isArray(art[field]) || !art[field].length) continue;

        const section = document.createElement("section");
        section.className = "lightbox-extra";

        const h = document.createElement("h3");
        h.textContent = heading;
        section.append(h);

        art[field].forEach((item) => {
          const im = safeImage(
            typeof item === "string" ? item : item.src,
            item.alt?.[language] || art.name
          );

          if (im) section.append(im);
        });

        extras.append(section);
      }

      const testimonial = art.testimonial?.[language];

      if (testimonial?.quote) {
        const quote = document.createElement("blockquote");
        quote.className = "lightbox-extra";

        addParagraph(quote, testimonial.quote);

        if (testimonial.author) {
          const cite = document.createElement("cite");
          cite.textContent = testimonial.author;
          quote.append(cite);
        }

        extras.append(quote);
      }

      byId("art-enquire").href =
        (sv
          ? "/se/kontakta-djurportratt-konstnar.html"
          : "/html/contact-pet-portrait-artist.html") +
        "?artwork=" +
        encodeURIComponent(art.name);

      activeFades.forEach((animation) => animation.cancel());
      activeFades.clear();

      // Lightbox fades stay short, separate from the 1500 ms scroll reveals.
      for (const element of lightbox.querySelectorAll(".lightbox-art, .lightbox-copy")) {
        if (reducedMotion.matches || typeof element.animate !== "function") {
          continue;
        }

        const animation = element.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 200,
          easing: "ease-out",
        });

        activeFades.add(animation);
        motionAnimations.add(animation);

        const tidy = () => {
          activeFades.delete(animation);
          motionAnimations.delete(animation);
        };

        animation.addEventListener("finish", tidy, { once: true });
        animation.addEventListener("cancel", tidy, { once: true });
      }

      return true;
    };

    triggers.forEach((trigger) => {
      trigger.addEventListener("click", async (event) => {
        const index = ordered.findIndex((art) => art.id === trigger.dataset.portrait);

        if (index < 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }

        event.preventDefault();
        previousFocus = trigger;

        trigger.setAttribute("aria-busy", "true");
        const ready = await render(index);
        trigger.removeAttribute("aria-busy");

        if (!ready) {
          if (ready === false) {
            window.location.assign(trigger.href);
          }

          return;
        }

        if (!lightbox.open) lightbox.showModal();

        lightbox.querySelector("[data-close-art]").focus();

        track("portrait_view", {
          artwork_id: ordered[index]?.id,
          page_language: language,
        });
      });
    });

    lightbox.querySelector("[data-close-art]").addEventListener("click", () => lightbox.close());

    lightbox.querySelector("[data-art-prev]").addEventListener("click", () => render(selected - 1));

    lightbox.querySelector("[data-art-next]").addEventListener("click", () => render(selected + 1));

    lightbox.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        render(selected + 1);
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        render(selected - 1);
      }
    });

    lightbox.addEventListener("click", (event) => {
      if (event.target !== lightbox) return;

      const r = lightbox.getBoundingClientRect();

      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      ) {
        lightbox.close();
      }
    });

    lightbox.addEventListener("close", () => {
      ++renderRequest;
      activeFades.forEach((animation) => animation.cancel());
      previousFocus?.focus();
    });
  };

  initialisePortraitLightbox();
})();
