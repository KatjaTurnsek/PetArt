/* Contact form prefilling and submission. No shared script dependency. */
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

  // Enquiry form
  const form = document.querySelector("[data-enquiry-form]");

  if (form) {
    const params = new URLSearchParams(location.search);
    const message = form.querySelector('[name="message"]');

    if (params.has("artwork")) {
      message.value =
        translate(
          "I am interested in a portrait like ",
          "Jag är intresserad av ett porträtt som "
        ) +
        params.get("artwork").slice(0, 200) +
        ".\n\n";
    }

    if (params.has("gift")) {
      message.value = translate(
        "I would like to ask about a gift voucher.",
        "Jag vill gärna fråga om ett presentkort."
      );
    }

    form.addEventListener("submit", async (event) => {
      if (!window.fetch || !form.reportValidity()) return;

      event.preventDefault();

      const submit = form.querySelector('[type="submit"]');
      const status = form.querySelector(".form-status");

      submit.disabled = true;
      status.textContent = translate("Sending your enquiry…", "Skickar din förfrågan…");

      const payload = new FormData(form);
      const redirect = payload.get("redirect");

      payload.delete("redirect");

      try {
        const response = await fetch(form.action, {
          method: "POST",
          body: payload,
          headers: { Accept: "application/json" },
        });

        const result = await response.json();

        if (!response.ok || result.success !== true) {
          throw new Error("Submission not confirmed");
        }

        track("generate_lead", {
          method: "enquiry_form",
          page_language: language,
        });

        status.textContent = translate(
          "Thank you. Your enquiry has been sent.",
          "Tack. Din förfrågan har skickats."
        );

        form.reset();

        if (redirect) {
          const next = new URL(redirect);

          if (next.hostname === "pet-art.net") {
            location.assign(location.hostname === "pet-art.net" ? next.href : next.pathname);
          }
        }
      } catch {
        status.textContent = translate(
          "Your enquiry could not be confirmed. Please try again or email katja@pet-art.net. Your message is still here.",
          "Din förfrågan kunde inte bekräftas. Försök igen eller mejla katja@pet-art.net. Ditt meddelande finns kvar."
        );
      } finally {
        submit.disabled = false;
      }
    });
  }
})();
