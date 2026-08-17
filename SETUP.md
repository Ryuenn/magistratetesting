# Magistrate Court Mastermind - Setup Guide

## Quick Start

### 1. Install Stripe PHP SDK

**Option A - Composer (recommended):**
```bash
cd /path/to/your/site
composer require stripe/stripe-php
```

**Option B - Manual:**
1. Download [Stripe PHP](https://github.com/stripe/stripe-php/releases)
2. Extract into `server/stripe/` so that `server/stripe/init.php` exists

### 2. Configure Stripe

Edit `server/config.php`:
- Paste your **Secret Key** (sk_test_... or sk_live_...)
- Set **DOMAIN** to your site URL (e.g. `https://yoursite.com`)
- Adjust **COURSE_PRICE** if needed (19900 = $199.00 in cents)

### 3. Add Images (optional)

- `assets/images/hero-bg.jpg` - Dark law library bookshelf background
- `assets/images/instructor-cutout.png` - Instructor photo with transparent background

### 4. Upload to GoDaddy

Upload all files to `public_html`:
- index.html, course.html, success.html, cancel.html (root)
- assets/ (css, js, images)
- server/ (config.php, create-checkout-session.php)
- vendor/ (if using Composer)
- .htaccess (root)

### 5. Test

1. Use Stripe **test keys** (sk_test_..., pk_test_...) first
2. Visit `/course`, click "Pay with Card"
3. Use test card `4242 4242 4242 4242`

---

## Folder Structure

```
/
├── index.html
├── course.html
├── success.html
├── cancel.html
├── .htaccess
├── assets/
│   ├── css/style.css
│   ├── js/main.js
│   └── images/
├── server/
│   ├── config.php          (paste keys here)
│   ├── create-checkout-session.php
│   └── .htaccess
└── vendor/                 (Composer - stripe-php)
```

## Making the Price Editable

Edit the `PRICE` variable in `course.html` (around line 35), or fetch from your backend.

## URLs

Pages are served without the `.html` extension (`/course`, `/about`, `/contact`, …),
and `/` serves the home page. On Vercel this comes from `"cleanUrls": true` in
`vercel.json`; on Apache/GoDaddy the rewrite rules in the root `.htaccess` do the
same. Both 301-redirect the old `/page.html` URLs to the new ones, so existing
links and search results keep working. The files on disk keep their `.html`
names — only the public URLs change. Link between pages with root-relative paths
(`href="/course"`), not `href="course.html"`.
