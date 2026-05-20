// /api/check-email.js
// Production-Grade Disposable Email Shield API

const STATIC_BLOCKLIST = new Set([
  "10minutemail.com", "tempmail.org", "guerrillamail.com", "mailinator.com",
  "sharklasers.com", "trashmail.com", "temp-mail.org", "yopmail.com",
  "maildrop.cc", "dispostable.com", "getnada.com", "throwawaymail.com",
  "fakemail.net", "mailnesia.com", "spamgourmet.com"
]);

const TRUSTED_TLDS = new Set(['com', 'net', 'org', 'io', 'co', 'app', 'dev', 'edu', 'gov', 'biz', 'info']);

// In-memory rate limit store. Resets on cold start. Upgrade to Redis for real prod.
const rateLimitStore = new Map();
const RATE_LIMIT = 100; // requests per minute per IP

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function checkDomainMatch(domain, blocklist) {
  if (blocklist.has(domain)) return true;

  const parts = domain.split('.');
  if (parts.length > 2) {
    const rootDomain = parts.slice(-2).join('.');
    if (blocklist.has(rootDomain)) return true;
  }
  return false;
}

function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - 60000; // 1 minute window

  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, []);
  }

  let timestamps = rateLimitStore.get(ip);
  timestamps = timestamps.filter(ts => ts > windowStart);

  if (timestamps.length >= RATE_LIMIT) {
    return false;
  }

  timestamps.push(now);
  rateLimitStore.set(ip, timestamps);
  return true;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method!== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Auth check
  const VALID_KEYS = new Set(process.env.API_KEYS?.split(',').filter(Boolean) || []);
  const apiKey = req.headers['x-api-key'];

  if (!apiKey ||!VALID_KEYS.has(apiKey)) {
    return res.status(401).json({ error: 'Invalid or missing API key. Set x-api-key header.' });
  }

  // Rate limit check
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: `Rate limit exceeded. Max ${RATE_LIMIT} req/min.` });
  }

  try {
    const { email } = req.body;

    if (!email || typeof email!== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "email" field in request body.' });
    }

    const cleanEmail = email.trim();

    if (!isValidEmail(cleanEmail)) {
      return res.status(400).json({
        email: cleanEmail,
        valid: false,
        disposable: false,
        reason: 'Invalid email format structural check failed.'
      });
    }

    const domain = cleanEmail.split('@')[1].toLowerCase();
    const isDisposable = checkDomainMatch(domain, STATIC_BLOCKLIST);

    const domainParts = domain.split('.');
    const primaryTld = domainParts[domainParts.length - 1];
    const isSuspiciousTLD =!TRUSTED_TLDS.has(primaryTld) && primaryTld.length > 4;

    const actionStatus = isDisposable? 'block' : 'allow';
    const decisionReason = isDisposable? 'Disposable email domain detected.' : 'OK';

    return res.status(200).json({
      email: cleanEmail,
      domain,
      valid: true,
      disposable: isDisposable,
      suspicious_tld: isSuspiciousTLD,
      status: actionStatus,
      reason: decisionReason,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}
