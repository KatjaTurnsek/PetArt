/* Scroll reveals (1500 ms) and FAQ animation. No shared script dependency. */
(() => {
  "use strict";

  // Scroll reveals
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const motionAnimations = new Set();

  const gentlyAnimate = (element, frames, duration) => {
    if (!element || reducedMotion.matches || typeof element.animate !== "function") {
      return;
    }

    const animation = element.animate(frames, {
      duration,
      easing: "cubic-bezier(0.2, 0.65, 0.3, 1)",
    });

    motionAnimations.add(animation);

    const tidy = () => motionAnimations.delete(animation);

    animation.addEventListener("finish", tidy, { once: true });
    animation.addEventListener("cancel", tidy, { once: true });
  };

  reducedMotion.addEventListener("change", (event) => {
    if (event.matches) {
      motionAnimations.forEach((animation) => animation.cancel());
    }
  });

  if ("IntersectionObserver" in window && !reducedMotion.matches) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(({ target, isIntersecting }) => {
          if (!isIntersecting) return;

          observer.unobserve(target);

          const portraitLink = target.matches("a[data-portrait]")
            ? target
            : target.querySelector("a[data-portrait]");

          const animatedElement = portraitLink ? portraitLink.querySelector("img") : target;

          gentlyAnimate(
            animatedElement,
            [
              { opacity: 0, transform: "translateY(12px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            1500
          );
        });
      },
      {
        threshold: 0,
        rootMargin: "0px 0px -32px 0px",
      }
    );

    const revealTargets = [
      ...document.querySelectorAll(
        [
          "[data-reveal]",
          '[data-page="home"] .section-approach .split',
          '[data-page="home"] .section-artist .split',
          '[data-page="home"] .section-testimonial .split',
          '[data-page="home"] .featured-grid > *',
          "main a[data-portrait]",
          '[data-page="about"] main .split',
          '[data-page="about"] main .studio-grid > *',
        ].join(",")
      ),
    ];

    // Avoid animating both a card and its nested portrait link.
    const targetSet = new Set(revealTargets);

    revealTargets.forEach((element) => {
      let parent = element.parentElement;

      while (parent) {
        if (targetSet.has(parent)) return;
        parent = parent.parentElement;
      }

      observer.observe(element);
    });
  }

  // Smooth FAQ opening and closing
  document.querySelectorAll(".faq-list details").forEach((details) => {
    const summary = details.querySelector("summary");
    if (!summary || typeof details.animate !== "function") return;

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

    let animation = null;
    let intendedOpen = details.open;

    const finish = () => {
      details.open = intendedOpen;
      details.style.removeProperty("height");
      details.style.removeProperty("overflow");
      animation = null;
    };

    summary.addEventListener("click", (event) => {
      // Let the browser handle reduced motion normally.
      if (motionPreference.matches) return;

      event.preventDefault();

      const startHeight = details.getBoundingClientRect().height;
      intendedOpen = animation ? !intendedOpen : !details.open;

      if (animation) {
        animation.onfinish = null;
        animation.cancel();
      }

      // Measure the natural height of the requested state.
      details.style.removeProperty("height");
      details.style.removeProperty("overflow");
      details.open = intendedOpen;

      const endHeight = details.getBoundingClientRect().height;

      // Keep the answer rendered while the closing animation runs.
      details.open = true;
      details.style.height = `${startHeight}px`;
      details.style.overflow = "hidden";

      animation = details.animate([{ height: `${startHeight}px` }, { height: `${endHeight}px` }], {
        duration: 280,
        easing: "ease-in-out",
      });

      animation.onfinish = finish;
    });

    motionPreference.addEventListener("change", (event) => {
      if (!event.matches || !animation) return;

      animation.onfinish = null;
      animation.cancel();
      finish();
    });
  });
})();
