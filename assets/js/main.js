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

  // Mobile nav: hamburger toggle + body scroll lock
  var header = document.querySelector('.header');
  var toggle = document.querySelector('.header__toggle');
  var mobileMenu = document.querySelector('.header__mobile-menu');
  var primaryNav = document.getElementById('primary-navigation');

  var closeMobileNav = function() {
    if (!header || !toggle) return;
    header.classList.remove('header--nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('is-nav-open');
    if (mobileMenu) {
      mobileMenu.setAttribute('aria-hidden', 'true');
    }
  };

  if (toggle && header) {
    if (mobileMenu) {
      mobileMenu.setAttribute('aria-hidden', 'true');
    }

    toggle.addEventListener('click', function() {
      var isOpen = header.classList.toggle('header--nav-open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      document.body.classList.toggle('is-nav-open', isOpen);
      if (mobileMenu) {
        mobileMenu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      }
    });

    // Close on Escape
    document.addEventListener('keydown', function(evt) {
      if (evt.key === 'Escape' && header.classList.contains('header--nav-open')) {
        closeMobileNav();
      }
    });

    // Close when clicking a nav link (mobile menu)
    if (mobileMenu) {
      mobileMenu.addEventListener('click', function(e) {
        var link = e.target.closest('a');
        if (!link) return;
        if (window.innerWidth <= 900) {
          closeMobileNav();
        }
      });
    }
  }

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
    var currentTopic = ''; // normalized text of selected topic (lowercase)

    // Topic filter setup
    var topicItems = document.querySelectorAll('.home-curriculum__topics li');

    var normalize = function(str) {
      return (str || '').toLowerCase().trim();
    };

    topicItems.forEach(function(item) {
      item.addEventListener('click', function() {
        var label = normalize(item.textContent || '');
        // Toggle off if clicking the same active topic
        if (currentTopic === label) {
          currentTopic = '';
        } else {
          currentTopic = label;
        }

        // Visual active state
        topicItems.forEach(function(el) {
          el.classList.toggle('is-active', normalize(el.textContent || '') === currentTopic && currentTopic !== '');
        });

        // When changing topic, always reset to first page
        updateCurriculumView(1);
      });
    });

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
        var topics = (lesson.getAttribute('data-topics') || '').split(',');
        var matchesTopic = !currentTopic || topics.some(function(t) {
          return normalize(t) === currentTopic;
        });

        var shouldShow = pageForLesson === page && matchesTopic;
        lesson.style.display = shouldShow ? 'flex' : 'none';
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
        if (pageForThumb === page) {
          thumb.style.removeProperty('display');
        } else {
          thumb.style.display = 'none';
        }
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

    // Normalize supported video URLs (Vimeo + YouTube) to an embeddable URL
    var toEmbedUrl = function(url) {
      if (!url || typeof url !== 'string') return '';

      // Vimeo: vimeo.com/ID or player.vimeo.com/video/ID
      var vimeo = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/);
      if (vimeo) {
        return 'https://player.vimeo.com/video/' + vimeo[1] + '?autoplay=1&title=0&byline=0&portrait=0';
      }

      // YouTube: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, youtube.com/shorts/ID
      var yt = url.match(
        /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
      );
      if (yt) {
        return 'https://www.youtube.com/embed/' + yt[1] + '?autoplay=1&rel=0&modestbranding=1';
      }

      // Fallback: allow already-embedded URLs or other providers
      return url;
    };

    videoButtons.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var url = btn.getAttribute('data-video');
        if (!url || !previewIframe) return;
        previewIframe.src = toEmbedUrl(url);
        previewModal.classList.add('is-open');
      });
    });

    // Curriculum arrows: open preview video for the lesson (without navigating)
    var curriculumArrows = document.querySelectorAll('.js-curriculum-arrow-preview');
    curriculumArrows.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var lesson = btn.closest('.home-curriculum__lesson');
        if (!lesson) return;
        var url = lesson.getAttribute('data-video');
        if (!url || !previewIframe) return;
        previewIframe.src = toEmbedUrl(url);
        previewModal.classList.add('is-open');
      });
    });

    // Entire curriculum row: also open the preview video instead of navigating
    var curriculumLessonLinks = document.querySelectorAll('.home-curriculum__lesson');
    curriculumLessonLinks.forEach(function(link) {
      link.addEventListener('click', function(e) {
        // Arrow handler already stopped propagation, so this is for row clicks
        e.preventDefault();
        var url = link.getAttribute('data-video');
        if (!url || !previewIframe) return;
        previewIframe.src = toEmbedUrl(url);
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

  // Contact form -> /api/contact (same-origin serverless function).
  // The endpoint verifies the Cloudflare Turnstile token before sending, and the
  // token is single-use, so the widget is reset after every attempt.
  var contactForm = document.querySelector('form.contact-form[action="/api/contact"]');
  if (contactForm) {
    var submitBtn = contactForm.querySelector('button[type="submit"]');
    var statusEl = contactForm.querySelector('.contact-form__status');
    var widget = contactForm.querySelector('.cf-turnstile');
    var successPanel = contactForm.parentNode.querySelector('.contact-success');
    var sendAnotherBtn = successPanel ? successPanel.querySelector('.contact-success__again') : null;

    function showStatus(ok, text) {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.style.color = ok ? '#15803d' : '#b91c1c';
      statusEl.hidden = false;
    }

    function resetTurnstile() {
      if (!window.turnstile || typeof window.turnstile.reset !== 'function') return;
      try {
        if (widget) window.turnstile.reset(widget);
        else window.turnstile.reset();
      } catch (err) {
        // A widget that never rendered has nothing to reset.
      }
    }

    contactForm.addEventListener('submit', function(e) {
      e.preventDefault();
      if (contactForm.getAttribute('data-sending') === 'true') return;

      if (typeof contactForm.checkValidity === 'function' && !contactForm.checkValidity()) {
        if (typeof contactForm.reportValidity === 'function') contactForm.reportValidity();
        return;
      }

      var tokenField = contactForm.querySelector('[name="cf-turnstile-response"]');
      var token = tokenField ? tokenField.value.trim() : '';
      if (!token) {
        showStatus(false, 'Please complete the verification check, then submit again.');
        return;
      }

      function value(name) {
        var field = contactForm.querySelector('[name="' + name + '"]');
        return field ? field.value.trim() : '';
      }

      var payload = {
        fullname: value('fullname'),
        email: value('email'),
        topic: value('topic'),
        message: value('message'),
        website: value('website'),
        turnstileToken: token,
        pageUrl: window.location.href
      };

      var originalLabel = submitBtn ? submitBtn.innerHTML : '';
      contactForm.setAttribute('data-sending', 'true');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'SENDING…';
      }
      if (statusEl) statusEl.hidden = true;

      function restore() {
        contactForm.removeAttribute('data-sending');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalLabel;
        }
      }

      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function(response) {
          return response.json().catch(function() {
            return null;
          }).then(function(json) {
            if (response.ok && json && json.ok === true) return json;
            var err = new Error((json && json.error) || 'Form submission failed');
            err.fromServer = !!(json && json.error);
            throw err;
          });
        })
        .then(function() {
          restore();
          contactForm.reset();
          resetTurnstile();
          if (statusEl) statusEl.hidden = true;
          if (successPanel) {
            // Swap the form for the confirmation; the CSS animation runs on the class.
            contactForm.classList.add('is-sent');
            successPanel.classList.add('is-visible');
          } else {
            showStatus(true, 'Thanks! Your message has been sent — we\'ll get back to you shortly.');
          }
        })
        .catch(function(error) {
          console.error('Contact form error:', error);
          restore();
          resetTurnstile();
          showStatus(
            false,
            error && error.fromServer && error.message
              ? error.message
              : 'We couldn\'t send your message just now. Please try again, or email info@magistratecourtmastermind.com.'
          );
        });
    });

    if (sendAnotherBtn) {
      sendAnotherBtn.addEventListener('click', function() {
        successPanel.classList.remove('is-visible');
        contactForm.classList.remove('is-sent');
        resetTurnstile();
        var firstField = contactForm.querySelector('[name="fullname"]');
        if (firstField) firstField.focus();
      });
    }
  }
})();
