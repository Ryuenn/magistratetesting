/**
 * Magistrate Court Mastermind - Minimal JS
 * Handles dropdown, mobile nav (if needed), and no framework dependencies
 */

(function() {
  'use strict';

  // Global page loader: simple logo + spinner on first load only
  var pageLoader = document.querySelector('.page-loader');
  if (pageLoader) {
    // Hide loader when everything (including images) is loaded
    window.addEventListener('load', function() {
      setTimeout(function() {
        pageLoader.classList.add('is-hidden');
      }, 200);
    });

    // Also hide once DOM is ready, in case load never fires (local dev quirks)
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(function() {
        pageLoader.classList.add('is-hidden');
      }, 400);
    });

    // Final safety: ensure it's gone after a few seconds no matter what
    setTimeout(function() {
      pageLoader.classList.add('is-hidden');
    }, 5000);
  }

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

  // Masterclass preview thumbnails pagination (6 per page)
  var previewThumbs = document.querySelectorAll('.preview-lessons__thumb');
  var previewPages = document.querySelectorAll('.preview-lessons__page');
  var previewNextPage = document.querySelector('.preview-lessons__page--next');

  if (previewThumbs.length && previewPages.length && previewNextPage) {
    var THUMBS_PER_PAGE = 6;
    var previewCurrentPage = 1;
    var previewMaxPage = Math.ceil(previewThumbs.length / THUMBS_PER_PAGE);

    // Assign a page number to each thumb
    previewThumbs.forEach(function(thumb, index) {
      var page = Math.floor(index / THUMBS_PER_PAGE) + 1;
      thumb.dataset.page = String(page);
    });

    // Hide page numbers that exceed maxPage
    previewPages.forEach(function(pageEl) {
      var p = parseInt(pageEl.dataset.page || pageEl.textContent || '0', 10);
      if (!p || p > previewMaxPage) {
        pageEl.classList.add('is-hidden');
      }
    });

    var updatePreviewPage = function(page) {
      previewCurrentPage = page;

      previewThumbs.forEach(function(thumb) {
        var pageForThumb = parseInt(thumb.dataset.page || '1', 10);
        thumb.style.display = pageForThumb === page ? 'block' : 'none';
      });

      previewPages.forEach(function(pageEl) {
        var p = parseInt(pageEl.dataset.page || pageEl.textContent || '0', 10);
        pageEl.classList.toggle('preview-lessons__page--active', p === page);
        pageEl.classList.remove('is-disabled');
      });

      var isLast = page >= previewMaxPage;
      previewNextPage.classList.toggle('is-disabled', isLast);
      if (isLast) {
        previewNextPage.setAttribute('aria-disabled', 'true');
      } else {
        previewNextPage.removeAttribute('aria-disabled');
      }
    };

    // Click handlers for numbered pages
    previewPages.forEach(function(pageEl) {
      if (pageEl.classList.contains('preview-lessons__page--next')) return;
      var p = parseInt(pageEl.dataset.page || pageEl.textContent || '0', 10);
      if (!p) return;
      pageEl.addEventListener('click', function() {
        if (p > previewMaxPage || pageEl.classList.contains('is-disabled')) return;
        updatePreviewPage(p);
      });
    });

    // Next button
    previewNextPage.addEventListener('click', function() {
      if (previewCurrentPage >= previewMaxPage || previewNextPage.classList.contains('is-disabled')) return;
      updatePreviewPage(previewCurrentPage + 1);
    });

    updatePreviewPage(1);
  }

  // Masterclass preview: Vimeo modal player
  var previewModal = document.querySelector('.preview-modal');
  if (previewModal) {
    var previewIframe = previewModal.querySelector('.preview-modal__iframe');
    var previewBackdrop = previewModal.querySelector('.preview-modal__backdrop');
    var previewClose = previewModal.querySelector('.preview-modal__close');
    var videoButtons = document.querySelectorAll('.js-preview-video');

    var closePreviewModal = function() {
      previewModal.classList.remove('is-open');
      if (previewIframe) {
        previewIframe.src = '';
      }
    };

    // Normalize Vimeo URL: vimeo.com/ID or player.vimeo.com/video/ID
    var toVimeoEmbedUrl = function(url) {
      if (!url || typeof url !== 'string') return '';
      var m = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/);
      if (!m) return url;
      return 'https://player.vimeo.com/video/' + m[1] + '?autoplay=1&title=0&byline=0&portrait=0';
    };

    videoButtons.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var url = btn.getAttribute('data-video');
        if (!url || !previewIframe) return;
        previewIframe.src = toVimeoEmbedUrl(url);
        previewModal.classList.add('is-open');
      });
    });

    if (previewBackdrop) {
      previewBackdrop.addEventListener('click', closePreviewModal);
    }
    if (previewClose) {
      previewClose.addEventListener('click', closePreviewModal);
    }
    document.addEventListener('keydown', function(evt) {
      if (evt.key === 'Escape') {
        closePreviewModal();
      }
    });
  }
})();
