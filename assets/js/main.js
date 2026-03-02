/**
 * Magistrate Court Mastermind - Minimal JS
 * Handles dropdown, mobile nav (if needed), and no framework dependencies
 */

(function() {
  'use strict';

  // Mobile nav toggle (optional - can expand for hamburger menu)
  // Current layout hides nav on mobile; add hamburger if desired
  
  // Ensure dropdown works on touch devices
  var dropdowns = document.querySelectorAll('.nav-dropdown');
  dropdowns.forEach(function(dd) {
    dd.addEventListener('click', function(e) {
      if (window.innerWidth <= 900) {
        e.preventDefault();
        var menu = dd.querySelector('.dropdown-menu');
        if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
      }
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.nav-dropdown')) {
      document.querySelectorAll('.dropdown-menu').forEach(function(m) {
        m.style.display = '';
      });
    }
  });

  // Home Course Preview carousel arrows
  var previewCarousel = document.querySelector('.home-preview__carousel');
  if (previewCarousel) {
    var previewItems = previewCarousel.querySelectorAll('.home-preview__item');
    var prevBtn = document.querySelector('.home-preview__arrow-btn--prev');
    var nextBtn = document.querySelector('.home-preview__arrow-btn--next');

    var scrollByOne = function(direction) {
      if (!previewItems.length) return;
      var first = previewItems[0];
      var itemWidth = first.getBoundingClientRect().width;
      var gap = 0;
      var style = window.getComputedStyle(previewCarousel);
      if (style.columnGap && style.columnGap !== 'normal') {
        gap = parseFloat(style.columnGap) || 0;
      } else if (style.gap && style.gap !== 'normal') {
        gap = parseFloat(style.gap) || 0;
      }
      var offset = itemWidth + gap;
      previewCarousel.scrollBy({
        left: direction * offset,
        behavior: 'smooth'
      });
    };

    var attachArrow = function(btn, direction) {
      if (!btn) return;
      btn.addEventListener('click', function() {
        btn.classList.add('is-clicked');
        setTimeout(function() {
          btn.classList.remove('is-clicked');
        }, 160);
        scrollByOne(direction);
      });
    };

    attachArrow(prevBtn, -1);
    attachArrow(nextBtn, 1);
  }

  // Home Course Curriculum pagination
  var curriculumLessons = document.querySelectorAll('.home-curriculum__lesson');
  var curriculumPages = document.querySelectorAll('.home-curriculum__page');
  var curriculumNext = document.querySelector('.home-curriculum__next');

  if (curriculumLessons.length && curriculumPages.length && curriculumNext) {
    var LESSONS_PER_PAGE = 6;
    var currentPage = 1;
    var maxPage = 1;

    curriculumLessons.forEach(function(lesson) {
      var num = parseInt(lesson.dataset.lesson, 10);
      if (!isNaN(num)) {
        var page = Math.ceil(num / LESSONS_PER_PAGE);
        lesson.dataset.page = String(page);
        if (page > maxPage) maxPage = page;
      }
    });

    curriculumPages.forEach(function(pageEl) {
      var p = parseInt(pageEl.dataset.page, 10);
      if (!p || p > maxPage) {
        pageEl.classList.add('is-hidden');
      }
    });

    var updateCurriculumView = function(page) {
      currentPage = page;

      curriculumLessons.forEach(function(lesson) {
        var pageForLesson = parseInt(lesson.dataset.page || '1', 10);
        if (pageForLesson === page) {
          lesson.style.display = 'flex';
        } else {
          lesson.style.display = 'none';
        }

        var lessonNum = parseInt(lesson.dataset.lesson || '0', 10);
        var firstOnPage = (page - 1) * LESSONS_PER_PAGE + 1;
        lesson.classList.toggle('home-curriculum__lesson--active', lessonNum === firstOnPage);
      });

      curriculumPages.forEach(function(pageEl) {
        var p = parseInt(pageEl.dataset.page || '0', 10);
        pageEl.classList.toggle('home-curriculum__page--active', p === page);
        pageEl.classList.remove('is-disabled');
      });

      var isLast = page >= maxPage;
      curriculumNext.classList.toggle('is-disabled', isLast);
      if (isLast) {
        curriculumNext.setAttribute('aria-disabled', 'true');
      } else {
        curriculumNext.removeAttribute('aria-disabled');
      }
    };

    curriculumPages.forEach(function(pageEl) {
      var p = parseInt(pageEl.dataset.page || '0', 10);
      if (!p) return;
      pageEl.addEventListener('click', function() {
        if (p > maxPage || pageEl.classList.contains('is-disabled')) return;
        updateCurriculumView(p);
      });
    });

    curriculumNext.addEventListener('click', function() {
      if (currentPage >= maxPage || curriculumNext.classList.contains('is-disabled')) return;
      updateCurriculumView(currentPage + 1);
    });

    updateCurriculumView(1);
  }
})();
