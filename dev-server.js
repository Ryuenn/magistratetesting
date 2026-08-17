/**
 * Local dev server for the Magistrate Court Mastermind site.
 *
 * The site uses extensionless URLs (/course, not /course.html). VS Code's Live
 * Server serves files literally, so it 404s on every page now. This mirrors what
 * Vercel does in production, per vercel.json:
 *
 *   "cleanUrls": true      /course serves course.html, /course.html 308s to /course
 *   "trailingSlash": false /course/ 308s to /course
 *
 * It also mounts the functions in api/ the way Vercel does, so the contact form
 * behaves locally instead of 404ing.
 *
 * No dependencies - plain Node.
 *
 *   node dev-server.js            start on http://localhost:3000
 *   node dev-server.js 4000       start on a specific port
 *   node dev-server.js --check    crawl every link, report broken URLs, exit
 */

var http = require('http');
var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;

var ROOT = __dirname;

var TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
};

// Keep a resolved path from escaping the site root via ../ segments.
function safeResolve(rel) {
  var abs = path.resolve(ROOT, rel);
  if (abs !== ROOT && abs.indexOf(ROOT + path.sep) !== 0) return null;
  return abs;
}

function isFile(abs) {
  return !!abs && fs.existsSync(abs) && fs.statSync(abs).isFile();
}

function listPages() {
  return fs.readdirSync(ROOT)
    .filter(function (f) { return f.endsWith('.html'); })
    .map(function (f) { return f === 'index.html' ? '/' : '/' + f.slice(0, -5); })
    .sort();
}

// Vercel gives Node functions req.body plus Express-style res helpers. The raw
// http module gives neither, so add just enough for api/ handlers to run.
function runApiFunction(handlerPath, req, res, done) {
  var chunks = [];
  req.on('data', function (c) { chunks.push(c); });
  req.on('end', function () {
    var raw = Buffer.concat(chunks).toString('utf8');
    req.body = raw;

    res.status = function (code) { res.statusCode = code; return res; };
    res.json = function (obj) {
      if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(obj));
      done(res.statusCode);
      return res;
    };
    res.send = function (body) { res.end(body); done(res.statusCode); return res; };

    var handler;
    try {
      delete require.cache[require.resolve(handlerPath)]; // pick up edits without a restart
      handler = require(handlerPath);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: 'Failed to load function: ' + err.message }));
      return done(500);
    }

    Promise.resolve()
      .then(function () { return handler(req, res); })
      .catch(function (err) {
        if (!res.writableEnded) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ ok: false, error: String(err && err.message || err) }));
        }
        done(500);
      });
  });
}

function notFound(res, pathname, done) {
  var body = '<!doctype html><meta charset="utf-8"><title>404</title>'
    + '<style>body{font:16px/1.6 system-ui,sans-serif;max-width:38rem;margin:12vh auto;padding:0 1.5rem;'
    + 'background:#111;color:#eee}a{color:#7ab7ff}code{background:#222;padding:.15em .4em;border-radius:3px}</style>'
    + '<h1>404 &mdash; not found</h1><p>Nothing is served at <code>' + pathname.replace(/</g, '&lt;') + '</code>.</p>'
    + '<p>Pages on this site:</p><ul>'
    + listPages().map(function (p) { return '<li><a href="' + p + '">' + p + '</a></li>'; }).join('')
    + '</ul>';
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(body);
  done(404);
}

function createServer(options) {
  var quiet = options && options.quiet;

  return http.createServer(function (req, res) {
    var started = Date.now();
    var pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch (err) {
      res.statusCode = 400;
      res.end('Bad request');
      return;
    }

    function done(status) {
      if (quiet) return;
      var color = status >= 400 ? '\x1b[31m' : status >= 300 ? '\x1b[33m' : '\x1b[32m';
      console.log(color + status + '\x1b[0m ' + req.method + ' ' + pathname
        + ' \x1b[90m(' + (Date.now() - started) + 'ms)\x1b[0m');
    }

    function redirect(location) {
      res.statusCode = 308;
      res.setHeader('Location', location);
      res.end();
      done(308);
    }

    // Serverless functions in api/, matched the way Vercel routes them.
    if (pathname.indexOf('/api/') === 0) {
      var fnRel = 'api' + path.sep + pathname.slice(5).replace(/\//g, path.sep);
      var fnAbs = safeResolve(fnRel + '.js') || safeResolve(fnRel);
      if (isFile(fnAbs)) return runApiFunction(fnAbs, req, res, done);
      return notFound(res, pathname, done);
    }

    // cleanUrls: strip .html, and collapse /index -> /
    if (/\.html$/i.test(pathname)) {
      var base = pathname.slice(0, -5);
      return redirect(/\/index$/i.test(base) ? (base.slice(0, -5) || '/') : base);
    }
    if (/\/index$/i.test(pathname)) {
      return redirect(pathname.slice(0, -5) || '/');
    }

    // trailingSlash: false
    if (pathname.length > 1 && pathname.endsWith('/')) {
      return redirect(pathname.replace(/\/+$/, ''));
    }

    var rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    var candidates = [rel, rel + '.html', rel + '/index.html'];

    for (var i = 0; i < candidates.length; i++) {
      var abs = safeResolve(candidates[i]);
      if (!isFile(abs)) continue;
      var type = TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream';
      res.statusCode = 200;
      res.setHeader('Content-Type', type);
      res.setHeader('Cache-Control', 'no-store'); // always see the latest edit
      fs.createReadStream(abs).pipe(res);
      return done(200);
    }

    notFound(res, pathname, done);
  });
}

// Try `port`, stepping upward if something else already has it.
function listen(server, port, attemptsLeft, cb) {
  server.once('error', function (err) {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.log('\x1b[33mPort ' + port + ' is busy, trying ' + (port + 1) + '...\x1b[0m');
      return listen(server, port + 1, attemptsLeft - 1, cb);
    }
    throw err;
  });
  server.listen(port, function () { cb(port); });
}

function openBrowser(target) {
  var cmd = process.platform === 'win32' ? 'start "" "' + target + '"'
    : process.platform === 'darwin' ? 'open "' + target + '"'
      : 'xdg-open "' + target + '"';
  exec(cmd, function () { /* opening the browser is best-effort */ });
}

/**
 * --check: crawl every internal link from /, confirm each old .html URL
 * redirects, and report anything broken. Exits non-zero on failure so this can
 * gate a deploy.
 */
function runCheck(base, server) {
  var seen = new Map();
  var origin = new Map();
  var queue = ['/'];
  origin.set('/', '(start)');

  function enqueue(p, from) {
    if (seen.has(p) || queue.indexOf(p) !== -1) return;
    queue.push(p);
    origin.set(p, from);
  }

  function visit() {
    if (!queue.length) return Promise.resolve();
    var current = queue.shift();
    if (seen.has(current)) return visit();

    return fetch(base + current, { redirect: 'manual' }).then(function (res) {
      seen.set(current, res.status);
      if (res.status >= 300 && res.status < 400) {
        var loc = new URL(res.headers.get('location'), base).pathname;
        enqueue(loc, current + ' (redirect)');
        return visit();
      }
      var type = res.headers.get('content-type') || '';
      if (type.indexOf('text/html') === -1) return visit();
      return res.text().then(function (html) {
        var re = /(?:href|src)="([^"#]+)"/g;
        var m;
        while ((m = re.exec(html))) {
          var link = m[1];
          if (/^(https?:|mailto:|tel:|data:|javascript:|\/\/|#)/i.test(link)) continue;
          enqueue(new URL(link, base + current).pathname, current);
        }
        return visit();
      });
    });
  }

  console.log('Crawling ' + base + ' ...\n');

  return visit().then(function () {
    var pages = listPages();
    // Every old URL should still land somewhere real, for existing inbound links.
    var legacy = pages.map(function (p) { return p === '/' ? '/index.html' : p + '.html'; });

    return Promise.all(legacy.map(function (old) {
      return fetch(base + old, { redirect: 'manual' }).then(function (res) {
        var loc = res.headers.get('location');
        var target = loc ? new URL(loc, base).pathname : null;
        return { old: old, status: res.status, target: target };
      });
    })).then(function (redirects) {
      var broken = [];
      seen.forEach(function (status, link) {
        if (status >= 400) broken.push(status + ' ' + link + '   (linked from ' + origin.get(link) + ')');
      });

      var badRedirects = redirects.filter(function (r) {
        return !(r.status >= 300 && r.status < 400 && r.target && r.target.indexOf('.html') === -1);
      });

      console.log('Pages served:');
      pages.forEach(function (p) { console.log('  ' + p); });

      console.log('\nOld .html URLs -> clean URLs:');
      redirects.forEach(function (r) {
        console.log('  ' + r.status + ' ' + r.old + ' -> ' + (r.target || '(no redirect)'));
      });

      console.log('\nCrawled ' + seen.size + ' URLs from /.');

      if (broken.length) {
        console.log('\n\x1b[31mBROKEN (' + broken.length + '):\x1b[0m');
        broken.forEach(function (b) { console.log('  ' + b); });
      } else {
        console.log('\x1b[32mNo broken links.\x1b[0m');
      }

      if (badRedirects.length) {
        console.log('\n\x1b[31mOld URLs not redirecting properly:\x1b[0m');
        badRedirects.forEach(function (r) { console.log('  ' + r.old + ' -> ' + r.status); });
      } else {
        console.log('\x1b[32mAll old .html URLs redirect to clean URLs.\x1b[0m');
      }

      server.close();
      process.exit(broken.length || badRedirects.length ? 1 : 0);
    });
  });
}

var args = process.argv.slice(2);
var check = args.indexOf('--check') !== -1;
var portArg = args.filter(function (a) { return /^\d+$/.test(a); })[0];
var startPort = Number(portArg || process.env.PORT || 3000);

var server = createServer({ quiet: check });

listen(server, startPort, 20, function (port) {
  var base = 'http://localhost:' + port;

  if (check) return runCheck(base, server);

  console.log('\n  \x1b[1mMagistrate Court Mastermind\x1b[0m - local dev server');
  console.log('  \x1b[36m' + base + '\x1b[0m');
  console.log('  Clean URLs on, matching vercel.json. Ctrl+C to stop.\n');
  listPages().forEach(function (p) { console.log('    ' + base + p); });
  console.log('');

  if (args.indexOf('--no-open') === -1) openBrowser(base);
});
