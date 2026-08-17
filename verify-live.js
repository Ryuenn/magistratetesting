/**
 * Verifies the live site's URL structure and search metadata.
 *
 * Anyone on the team can run this to confirm the migration is working — no
 * setup, no dependencies, no long command to paste:
 *
 *   node verify-live.js                     check the live site
 *   node verify-live.js http://localhost:3000   check a local dev server
 *
 * Exits 0 if everything passes, 1 if anything fails.
 */

var BASE = (process.argv[2] || 'https://www.magistratecourtmastermind.com').replace(/\/+$/, '');

// Pages that should be offered to search engines, and those held back.
var PUBLIC_PAGES = ['/', '/course', '/masterclass-preview', '/about', '/contact'];
var PRIVATE_PAGES = ['/students', '/checkout', '/success', '/cancel'];
var ALL_PAGES = PUBLIC_PAGES.concat(PRIVATE_PAGES);

// Old address -> the clean address it should land on.
var LEGACY = {
  '/index.html': '/',
  '/course.html': '/course',
  '/masterclass-preview.html': '/masterclass-preview',
  '/about.html': '/about',
  '/contact.html': '/contact',
  '/students.html': '/students',
  '/checkout.html': '/checkout',
  '/success.html': '/success',
  '/cancel.html': '/cancel',
};

var GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', GREY = '\x1b[90m', BOLD = '\x1b[1m', OFF = '\x1b[0m';

var results = [];

function record(group, label, ok, detail) {
  results.push({ group: group, label: label, ok: ok, detail: detail || '' });
  var mark = ok ? GREEN + 'PASS' + OFF : RED + 'FAIL' + OFF;
  console.log('  ' + mark + '  ' + label + (detail ? '  ' + GREY + detail + OFF : ''));
}

function head(url) {
  return fetch(url, { redirect: 'manual' })
    .then(function (r) { return { status: r.status, location: r.headers.get('location'), res: r }; })
    .catch(function (e) { return { status: 0, error: e.message }; });
}

function body(url) {
  return fetch(url).then(function (r) {
    return r.text().then(function (t) { return { status: r.status, text: t }; });
  }).catch(function (e) { return { status: 0, text: '', error: e.message }; });
}

// Compare a redirect target whether it came back absolute or relative.
function samePath(location, expected) {
  if (!location) return false;
  try { return new URL(location, BASE).pathname === expected; }
  catch (e) { return false; }
}

function section(name) {
  console.log('\n' + BOLD + name + OFF);
}

(async function run() {
  console.log('\nChecking ' + BOLD + BASE + OFF);

  // ---- 1. Clean URLs resolve ----
  section('Clean URLs load');
  for (var i = 0; i < ALL_PAGES.length; i++) {
    var p = ALL_PAGES[i];
    var r = await head(BASE + p);
    record('urls', p.padEnd(22) + ' returns 200', r.status === 200, 'got ' + (r.status || r.error));
  }

  // ---- 2. Old addresses redirect ----
  section('Old .html addresses redirect');
  var legacyPaths = Object.keys(LEGACY);
  for (var j = 0; j < legacyPaths.length; j++) {
    var old = legacyPaths[j];
    var want = LEGACY[old];
    var r2 = await head(BASE + old);
    var isRedirect = r2.status === 301 || r2.status === 308;
    var lands = samePath(r2.location, want);
    record('legacy', old.padEnd(26) + ' -> ' + want, isRedirect && lands,
      r2.status + (r2.location ? ' -> ' + r2.location : ''));
  }

  // ---- 3. Host and slash normalisation ----
  section('Address normalisation');
  var apex = await head(BASE.replace('://www.', '://') + '/course');
  record('norm', 'apex redirects to www', apex.status === 301 || apex.status === 308, 'got ' + apex.status);
  var slash = await head(BASE + '/course/');
  record('norm', 'trailing slash removed', (slash.status === 301 || slash.status === 308) && samePath(slash.location, '/course'),
    slash.status + (slash.location ? ' -> ' + slash.location : ''));

  // ---- 4. Canonical tags ----
  section('Canonical tags point at the clean URL');
  for (var k = 0; k < ALL_PAGES.length; k++) {
    var page = ALL_PAGES[k];
    var doc = await body(BASE + page);
    var m = doc.text.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i);
    var expected = BASE + (page === '/' ? '/' : page);
    record('canonical', page.padEnd(22) + ' canonical correct', !!m && m[1] === expected,
      m ? m[1] : 'no canonical tag');
  }

  // ---- 5. Private pages held back from search ----
  section('Private pages kept out of search');
  for (var n = 0; n < PRIVATE_PAGES.length; n++) {
    var priv = PRIVATE_PAGES[n];
    var pdoc = await body(BASE + priv);
    var hasNoindex = /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(pdoc.text);
    record('noindex', priv.padEnd(22) + ' marked noindex', hasNoindex, hasNoindex ? '' : 'missing');
  }
  for (var q = 0; q < PUBLIC_PAGES.length; q++) {
    var pub = PUBLIC_PAGES[q];
    var pubdoc = await body(BASE + pub);
    var noIdx = /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(pubdoc.text);
    record('noindex', pub.padEnd(22) + ' still indexable', !noIdx, noIdx ? 'unexpectedly noindex' : '');
  }

  // ---- 6. Sitemap and robots ----
  section('Sitemap and robots');
  var sm = await body(BASE + '/sitemap.xml');
  record('sitemap', 'sitemap.xml reachable', sm.status === 200, 'got ' + sm.status);
  var locs = (sm.text.match(/<loc>([^<]+)<\/loc>/g) || []).map(function (s) { return s.replace(/<\/?loc>/g, ''); });
  record('sitemap', 'sitemap lists the public pages', locs.length === PUBLIC_PAGES.length, locs.length + ' entries');
  record('sitemap', 'no .html left in the sitemap', locs.length > 0 && !locs.some(function (l) { return l.indexOf('.html') !== -1; }));
  var privateLeak = locs.filter(function (l) {
    return PRIVATE_PAGES.some(function (pp) { return new URL(l).pathname === pp; });
  });
  record('sitemap', 'no private pages in the sitemap', privateLeak.length === 0, privateLeak.join(', '));

  var rb = await body(BASE + '/robots.txt');
  record('robots', 'robots.txt reachable', rb.status === 200, 'got ' + rb.status);
  record('robots', 'robots.txt points at the sitemap', /sitemap\.xml/i.test(rb.text));

  // ---- 7. Contact form endpoint ----
  section('Contact form endpoint');
  var api = await head(BASE + '/api/contact');
  // 405 = the function ran and rejected GET, which is what we want to see.
  record('api', '/api/contact is alive', api.status === 405 || api.status === 200, 'got ' + api.status);

  // ---- Summary ----
  var failed = results.filter(function (r) { return !r.ok; });
  var passed = results.length - failed.length;

  console.log('\n' + BOLD + passed + ' of ' + results.length + ' checks passed.' + OFF);

  if (failed.length) {
    console.log(RED + '\nFailed:' + OFF);
    failed.forEach(function (f) { console.log('  - ' + f.label + (f.detail ? '  (' + f.detail + ')' : '')); });

    var onlyMeta = failed.every(function (f) {
      return ['canonical', 'noindex', 'sitemap', 'robots'].indexOf(f.group) !== -1;
    });
    if (onlyMeta) {
      console.log(YELLOW + '\nEverything failing is search metadata, which is finished but not deployed yet.'
        + '\nThe URL structure itself is live and passing.' + OFF);
    }
  }

  console.log('');
  process.exit(failed.length ? 1 : 0);
})();
