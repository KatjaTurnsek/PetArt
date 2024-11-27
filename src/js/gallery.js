let slideIndex = 1;

// Open the modal
function openModal() {
  const modal = document.getElementById('lightboxModal');
  modal.style.display = 'block';
  modal.setAttribute('aria-hidden', 'false');
  modal.focus(); // Set focus to the modal for accessibility
  showSlides(slideIndex);

  // Allow closing the modal with the Escape key
  document.addEventListener('keydown', handleModalKeyboardEvents);
}

// Close the modal
function closeModal() {
  const modal = document.getElementById('lightboxModal');
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');

  // Remove keyboard event listener
  document.removeEventListener('keydown', handleModalKeyboardEvents);
}

// Handle keyboard events inside the modal
function handleModalKeyboardEvents(event) {
  switch (event.key) {
    case 'Escape': // Close the modal with the Escape key
      closeModal();
      break;
    case 'ArrowRight': // Navigate to the next slide with Right Arrow
      plusSlides(1);
      break;
    case 'ArrowLeft': // Navigate to the previous slide with Left Arrow
      plusSlides(-1);
      break;
  }
}

// Set the current slide
function setCurrentSlide(n) {
  slideIndex = n;
  showSlides(slideIndex);
}

// Navigate to the next or previous slide
function plusSlides(n) {
  showSlides(slideIndex += n);
}

// Show the slide at the given index
function showSlides(n) {
  const slides = document.querySelectorAll('.mySlides');
  if (n > slides.length) { slideIndex = 1; }
  if (n < 1) { slideIndex = slides.length; }
  
  slides.forEach(slide => slide.style.display = 'none');
  slides[slideIndex - 1].style.display = 'block';
}

// Event listeners for buttons and keyboard support
document.querySelector('.prev').addEventListener('click', () => plusSlides(-1));
document.querySelector('.next').addEventListener('click', () => plusSlides(1));

// Add keyboard event support to navigation buttons
document.querySelector('.prev').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { // Enter or Space key
    plusSlides(-1);
  }
});
document.querySelector('.next').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { // Enter or Space key
    plusSlides(1);
  }
});

// Attach open and close functionality to triggers
document.getElementById('openLightboxButton').addEventListener('click', openModal);
document.getElementById('closeLightboxButton').addEventListener('click', closeModal);
document.getElementById('closeLightboxButton').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { // Enter or Space key
    closeModal();
  }
});
