(function initGA4() {
  // prevent double init
  if (window.__ga4Initialized) return;
  window.__ga4Initialized = true;

  // Do Not Track respect
  const dnt =
    navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.msDoNotTrack === "1";

  // dataLayer + gtag shim
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    dataLayer.push(arguments);
  }
  window.gtag = window.gtag || gtag;

  // GA4 loader
  const GA_ID = "G-4BP4G6562F";
  (function loadTag() {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    document.head.appendChild(s);
  })();

  // Consent Mode v2 defaults
  gtag(
    "consent",
    "default",
    dnt
      ? {
          ad_storage: "denied",
          ad_user_data: "denied",
          ad_personalization: "denied",
          analytics_storage: "denied",
          wait_for_update: 500,
        }
      : {
          ad_storage: "denied",
          ad_user_data: "denied",
          ad_personalization: "denied",
          analytics_storage: "granted",
          wait_for_update: 500,
        }
  );

  // basic GA4 init
  gtag("js", new Date());
  gtag("config", GA_ID, {
    anonymize_ip: true,
    send_page_view: true,
  });
})();
