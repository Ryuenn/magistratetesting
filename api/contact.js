// Contact form endpoint for the Magistrate Court Mastermind site (POST /api/contact).
//
// Everything runs over fetch — no npm packages, and no SMTP: outbound socket
// connections hang in the serverless runtime, so mail goes out over SMTP2GO's
// HTTP API instead.
//
// Required environment variables (set in Vercel — never hardcode):
//   SMTP2GO_API_KEY      API key for api.smtp2go.com
//   TURNSTILE_SECRET_KEY server-side secret for the Cloudflare Turnstile widget
//   CONTACT_TO_EMAIL     primary recipient(s); comma-separated for more than one
//   CONTACT_CC_EMAIL     optional CC list; comma-separated
//   CONTACT_FROM_EMAIL   verified sender address on the SMTP2GO account

var TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
var SMTP2GO_SEND_URL = "https://api.smtp2go.com/v3/email/send";

var MESSAGE_MAX = 5000;
var NAME_MAX = 200;
var EMAIL_MAX = 254;
var PHONE_MAX = 50;
var URL_MAX = 500;

var RATE_LIMIT_MAX = 5;
var RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

// Best-effort rate limiting: the map lives in the warm instance's memory, so it
// resets on cold start and is not shared across concurrent instances. It blunts
// simple flooding; Turnstile is what actually stops bots.
var rateLimitHits = new Map();

function clientIp(req) {
  var forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded)) forwarded = forwarded[0];
  if (typeof forwarded === "string" && forwarded.trim() !== "") {
    return forwarded.split(",")[0].trim();
  }
  var real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.trim() !== "") return real.trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

// Returns 0 when the caller is under the limit, otherwise seconds until the
// oldest recorded hit falls out of the window.
function rateLimit(ip) {
  var now = Date.now();
  var windowStart = now - RATE_LIMIT_WINDOW_MS;

  // Drop stale entries so the map cannot grow without bound on a warm instance.
  rateLimitHits.forEach(function (times, key) {
    var kept = times.filter(function (t) {
      return t > windowStart;
    });
    if (kept.length) rateLimitHits.set(key, kept);
    else rateLimitHits.delete(key);
  });

  var hits = rateLimitHits.get(ip) || [];
  if (hits.length >= RATE_LIMIT_MAX) {
    return Math.max(1, Math.ceil((hits[0] + RATE_LIMIT_WINDOW_MS - now) / 1000));
  }

  hits.push(now);
  rateLimitHits.set(ip, hits);
  return 0;
}

function parseBody(req) {
  var body = req.body;
  if (!body) return {};
  if (typeof body === "string") {
    var text = body.trim();
    if (text === "") return {};
    if (text.charAt(0) === "{") {
      try {
        return JSON.parse(text);
      } catch (err) {
        return null;
      }
    }
    // Fall back to a urlencoded body (a plain form POST without JS).
    var params = new URLSearchParams(text);
    var out = {};
    params.forEach(function (value, key) {
      out[key] = value;
    });
    return out;
  }
  if (Buffer.isBuffer(body)) return parseBody({ body: body.toString("utf8"), headers: req.headers });
  if (typeof body === "object") return body;
  return {};
}

function str(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= EMAIL_MAX;
}

// Values that land in a header (subject, Reply-To) must not carry line breaks.
function singleLine(value) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

// Dashboard-pasted secrets pick up stray whitespace and newlines easily, and the
// value can't be read back once stored as Sensitive — so trim on the way in.
function env(name) {
  return String(process.env[name] || "").trim();
}

// Comma-separated address list from an env var, e.g. "a@x.com, b@y.com".
function addressList(name) {
  return env(name)
    .split(",")
    .map(function (address) {
      return address.trim();
    })
    .filter(Boolean);
}

async function postJson(url, headers, payload, timeoutMs) {
  var options = {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json", Accept: "application/json" }, headers),
    body: JSON.stringify(payload)
  };
  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
    options.signal = AbortSignal.timeout(timeoutMs);
  }
  return fetch(url, options);
}

async function verifyTurnstile(token) {
  // remoteip is deliberately not sent: Cloudflare treats it as a constraint when
  // present, and a proxy hop can make the address we see differ from the one that
  // solved the challenge — which fails verification for a legitimate visitor.
  var form = new URLSearchParams();
  form.append("secret", env("TURNSTILE_SECRET_KEY"));
  form.append("response", token);

  var options = {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  };
  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
    options.signal = AbortSignal.timeout(10000);
  }

  var response = await fetch(TURNSTILE_VERIFY_URL, options);
  var json = await response.json().catch(function () {
    return null;
  });

  if (!json || json.success !== true) {
    // Cloudflare's error-codes say exactly what went wrong — invalid-input-secret,
    // timeout-or-duplicate, invalid-input-response, etc. Without this, every cause
    // looks identical from the outside.
    var secret = env("TURNSTILE_SECRET_KEY");
    console.error(
      "contact: Turnstile rejected the token",
      JSON.stringify({
        status: response.status,
        errorCodes: (json && json["error-codes"]) || null,
        hostname: (json && json.hostname) || null,
        // Fingerprint only — enough to spot a truncated or wrong-field paste
        // without putting the secret itself in the log.
        secretLength: secret.length,
        secretTail: secret.slice(-4),
        tokenLength: token.length
      })
    );
    return false;
  }
  return true;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  var body = parseBody(req);
  if (body === null) {
    return res.status(400).json({ ok: false, error: "Malformed request body." });
  }

  // Honeypot: real visitors never see this field, so anything in it is a bot.
  // Answer as if it worked and send nothing.
  if (str(body.website) !== "") {
    return res.status(200).json({ ok: true });
  }

  var fullname = str(body.fullname || body.name);
  var phone = str(body.phone);
  var email = str(body.email);
  var message = str(body.message);
  var topic = str(body.topic).slice(0, NAME_MAX); // optional; only the contact page sends it
  var pageUrl = str(body.pageUrl).slice(0, URL_MAX);
  var turnstileToken = str(body.turnstileToken || body["cf-turnstile-response"]);

  if (!fullname || !email || !message) {
    return res.status(400).json({ ok: false, error: "Please fill in your name, email, and message." });
  }
  if (fullname.length > NAME_MAX || phone.length > PHONE_MAX) {
    return res.status(400).json({ ok: false, error: "Your name or phone number is too long." });
  }
  if (message.length > MESSAGE_MAX) {
    return res
      .status(400)
      .json({ ok: false, error: "Your message is too long — please keep it under " + MESSAGE_MAX + " characters." });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: "Please enter a valid email address." });
  }

  var ip = clientIp(req);
  var retryAfter = rateLimit(ip);
  if (retryAfter) {
    res.setHeader("Retry-After", String(retryAfter));
    return res
      .status(429)
      .json({ ok: false, error: "Too many messages from this connection. Please try again in a few minutes." });
  }

  if (!env("TURNSTILE_SECRET_KEY")) {
    console.error("contact: TURNSTILE_SECRET_KEY is not set");
    return res.status(500).json({ ok: false, error: "The contact form is misconfigured. Please email us directly." });
  }
  if (!turnstileToken) {
    return res.status(403).json({ ok: false, error: "Please complete the verification challenge and try again." });
  }

  var humanVerified = false;
  try {
    humanVerified = await verifyTurnstile(turnstileToken);
  } catch (err) {
    console.error("contact: Turnstile verification request failed", err);
    return res.status(502).json({ ok: false, error: "We couldn't complete the verification check. Please try again." });
  }
  if (!humanVerified) {
    return res.status(403).json({ ok: false, error: "Verification failed. Please try the challenge again." });
  }

  var to = addressList("CONTACT_TO_EMAIL");
  var cc = addressList("CONTACT_CC_EMAIL");
  var sender = env("CONTACT_FROM_EMAIL");
  if (!env("SMTP2GO_API_KEY") || !to.length || !sender) {
    console.error("contact: SMTP2GO_API_KEY, CONTACT_TO_EMAIL, or CONTACT_FROM_EMAIL is not set");
    return res.status(500).json({ ok: false, error: "The contact form is misconfigured. Please email us directly." });
  }

  var textBody =
    "New message from the Magistrate Court Mastermind website\n\n" +
    "Name: " + fullname + "\n" +
    "Email: " + email + "\n" +
    (phone ? "Phone: " + phone + "\n" : "") +
    (topic ? "Topic: " + topic + "\n" : "") +
    (pageUrl ? "Page: " + pageUrl + "\n" : "") +
    "\n" + message + "\n";

  var payload = {
    sender: sender,
    to: to,
    subject: singleLine("Magistrate Court Mastermind — " + fullname).slice(0, 200),
    text_body: textBody,
    custom_headers: [{ header: "Reply-To", value: singleLine(email) }]
  };
  if (cc.length) payload.cc = cc;

  var response;
  var result;
  try {
    response = await postJson(SMTP2GO_SEND_URL, { "X-Smtp2go-Api-Key": env("SMTP2GO_API_KEY") }, payload, 15000);
    result = await response.json().catch(function () {
      return null;
    });
  } catch (err) {
    console.error("contact: SMTP2GO request failed", err);
    return res.status(502).json({ ok: false, error: "We couldn't send your message just now. Please try again." });
  }

  // SMTP2GO answers 200 even when a recipient is rejected — only data.succeeded
  // confirms the mail actually went out.
  if (!response.ok || !result || !result.data || result.data.succeeded !== 1) {
    console.error(
      "contact: SMTP2GO did not accept the message",
      response.status,
      result && (result.data ? JSON.stringify(result.data.failures || result.data) : JSON.stringify(result))
    );
    return res.status(502).json({ ok: false, error: "We couldn't send your message just now. Please try again." });
  }

  return res.status(200).json({ ok: true });
};
