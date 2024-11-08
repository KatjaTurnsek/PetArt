let slideIndex = 1; 

function openModal() {
  const modal = document.getElementById('myModal');
  modal.style.display = 'block';
  modal.setAttribute('aria-hidden', 'false');
  showSlides(slideIndex);
}

function closeModal() {
  const modal = document.getElementById('myModal');
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
}

function setCurrentSlide(n) {
  slideIndex = n;
  showSlides(slideIndex);
}

function plusSlides(n) {
  showSlides(slideIndex += n);
}

function showSlides(n) {
  const slides = document.querySelectorAll('.mySlides');
  if (n > slides.length) { slideIndex = 1 }
  if (n < 1) { slideIndex = slides.length }
  
  slides.forEach(slide => slide.style.display = 'none');
  slides[slideIndex - 1].style.display = 'block';
}

