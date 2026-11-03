/* Shared navigation, copyright, contact links and tracking. */
(() => {
  "use strict";

  // Copyright year
  const currentYear = String(new Date().getFullYear());

  document.querySelectorAll(".copyright").forEach((element) => {
    element.textContent = element.textContent.replace(
      /(©\s*)\d{4}/,
      (_, prefix) => prefix + currentYear
    );
  });

  // Language and analytics
  const language = document.body.dataset.language || "en";
  const sv = language === "sv";
  const translate = (en, se) => (sv ? se : en);

  const track = (name, parameters = {}) => {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, parameters);
    }
  };

  // Mobile navigation
  const menu = document.getElementById("mobile-menu");
  const menuToggle = document.querySelector(".menu-toggle");

  if (menu && menuToggle && typeof menu.showModal === "function") {
    const close = () => {
      menu.close();
      menuToggle.setAttribute("aria-expanded", "false");
    };

    menuToggle.addEventListener("click", () => {
      menu.showModal();
      menuToggle.setAttribute("aria-expanded", "true");
      menu.querySelector(".close-menu").focus();
    });

    menu.querySelector(".close-menu").addEventListener("click", close);

    menu.addEventListener("close", () => {
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.focus();
    });

    menu.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", close);
    });

    window.matchMedia("(min-width: 801px)").addEventListener("change", (event) => {
      if (event.matches && menu.open) close();
    });
  }

  // SMS link
  const sms = document.getElementById("smsLink");

  if (sms) {
    const body = translate(
      "Hi Katja, I would like to discuss a pet portrait.",
      "Hej Katja, jag vill gärna diskutera ett djurporträtt."
    );

    const separator = /iPad|iPhone|iPod/.test(navigator.userAgent) ? "&" : "?";

    sms.href = "sms:+46730785744" + separator + "body=" + encodeURIComponent(body);
  }

  // Contact tracking
  document
    .querySelectorAll('a[href^="mailto:"], a[href^="sms:"], a[href^="https://wa.me/"]')
    .forEach((a) => {
      a.addEventListener("click", () => {
        const channel = a.href.startsWith("mailto:")
          ? "email"
          : a.href.startsWith("sms:")
            ? "sms"
            : "whatsapp";

        track("contact_click", {
          contact_channel: channel,
          page_language: language,
        });
      });
    });

  document
    .querySelectorAll(
      'a[href*="contact-pet-portrait-artist"], a[href*="kontakta-djurportratt-konstnar"]'
    )
    .forEach((a) => {
      a.addEventListener("click", () => {
        track("enquiry_click", { page_language: language });
      });
    });
})();
