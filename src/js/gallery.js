// src/js/gallery.js
let slideIndex = 1;
let lastActive = null;

// Find the top-level BODY child that contains the modal (if modal isn't directly under <body>)
function bodyContainerFor(el) {
  let node = el;
  while (node && node.parentElement && node.parentElement !== document.body) {
    node = node.parentElement;
  }
  return node && node.parentElement === document.body ? node : document.body;
}

// Toggle inert on everything except the modal's container
function setOutsideInert(modal, on) {
  const container = bodyContainerFor(modal);
  Array.from(document.body.children).forEach((kid) => {
    if (kid === container) return;
    if (on) kid.setAttribute("inert", "");
    else kid.removeAttribute("inert");
  });
}

function getTabbables(container) {
  return Array.from(
    container.querySelectorAll(
      'a[href],button:not([disabled]),textarea,input,select,details,[tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");
}

function trapTabKey(e, container) {
  if (e.key !== "Tab") return;
  const tabbables = getTabbables(container);
  if (!tabbables.length) return;
  const first = tabbables[0];
  const last = tabbables[tabbables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function openModal() {
  const modal = document.getElementById("lightboxModal");
  if (!modal) return;

  lastActive = document.activeElement;

  // Show modal (no aria-hidden; use hidden attr)
  modal.hidden = false;
  modal.style.display = "block";

  // Prevent background interaction
  setOutsideInert(modal, true);
  document.body.style.overflow = "hidden";

  // Render current slide and focus close button (or first focusable)
  showSlides(slideIndex);
  const closeBtn = document.getElementById("closeLightboxButton");
  (closeBtn || getTabbables(modal)[0] || modal).focus();

  document.addEventListener("keydown", handleModalKeys);
  modal._trapHandler = (e) => trapTabKey(e, modal);
  document.addEventListener("keydown", modal._trapHandler);
}

function closeModal() {
  const modal = document.getElementById("lightboxModal");
  if (!modal) return;

  // Move focus out BEFORE hiding (prevents any AT warning)
  if (lastActive && typeof lastActive.focus === "function") {
    lastActive.focus();
  } else {
    document.body.focus();
  }

  // Hide modal
  modal.style.display = "none";
  modal.hidden = true;

  // Unlock background
  setOutsideInert(modal, false);
  document.body.style.overflow = "";

  // Remove listeners
  document.removeEventListener("keydown", handleModalKeys);
  if (modal._trapHandler) {
    document.removeEventListener("keydown", modal._trapHandler);
    delete modal._trapHandler;
  }
}

function handleModalKeys(e) {
  switch (e.key) {
    case "Escape":
      closeModal();
      break;
    case "ArrowRight":
      plusSlides(1);
      break;
    case "ArrowLeft":
      plusSlides(-1);
      break;
  }
}

function setCurrentSlide(n) {
  slideIndex = n;
  showSlides(slideIndex);
}

function plusSlides(n) {
  showSlides(slideIndex + n);
}

function showSlides(n) {
  const slides = document.querySelectorAll(".mySlides");
  const total = slides.length;
  if (!total) return;

  // Wrap 1..total
  slideIndex = ((n - 1 + total) % total) + 1;

  slides.forEach((slide, i) => {
    slide.style.display = i === slideIndex - 1 ? "block" : "none";
    const num = slide.querySelector(".numbertext");
    if (num) num.textContent = `${i + 1} / ${total}`;
  });
}

function bindControls() {
  const prevBtn = document.querySelector("#lightboxModal .prev");
  const nextBtn = document.querySelector("#lightboxModal .next");
  const closeBtn = document.getElementById("closeLightboxButton");
  const modalEl = document.getElementById("lightboxModal");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => plusSlides(-1));
    prevBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") plusSlides(-1);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => plusSlides(1));
    nextBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") plusSlides(1);
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", closeModal);
    closeBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") closeModal();
    });
  }

  if (modalEl) {
    // Click backdrop to close (ignore clicks inside .modal-content)
    modalEl.addEventListener("click", (e) => {
      if (e.target === modalEl) closeModal();
    });
  }
}

// Expose for your inline onclick on thumbnails
window.openModal = openModal;
window.closeModal = closeModal;
window.plusSlides = plusSlides;
window.setCurrentSlide = setCurrentSlide;

// Bind after DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindControls);
} else {
  bindControls();
}
