// /api/check-email.js
// Enterprise-Grade Disposable Email Shield API

import { promises as dns } from 'dns';

let DYNAMIC_BLOCKLIST = new Set();
let BLOCKLIST_LAST_UPDATED = 0;
const BLOCKLIST_URL = 'https://raw.githubusercontent.com/disposable/disposable-email-domains/master/disposable_email_blocklist.conf';
const BLOCKLIST_TTL = 6 * 60 * 60 * 1000; // 6 hours

const STATIC_FALLBACK = new Set([
  "10minutemail.com", "tempmail.org", "guerrillamail.com", "mailinator.com",
  "sharklasers.com", "trashmail.com", "temp-mail.org", "yopmail.com"
]);

const TRUSTED_TLDS = new Set(['com', 'net', 'org', 'io', 'co', 'app', 'dev', 'edu', 'gov', 'biz', 'info']);

// Bounded in-memory stores to prevent memory exhaustion leaks
const rateLimitStore = new Map();
const mxCache = new Map(); 
const mxCacheTTL = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 5000; // Cap cache entries to protect memory boundaries

const stats = {
  total_requests: 0,
  blocked: 0,
  allowed: 0,
  avg_latency_ms: 0,
  last_checks: [],
  started_at: new Date().toISOString()
};
const RATE_LIMIT = 100;

async function loadBlocklist() {
  const now = Date.now();
  if (DYNAMIC_BLOCKLIST.size > 0 && now - BLOCKLIST_LAST_UPDATED < BLOCKLIST_TTL) {
    return DYNAMIC_BLOCKLIST;
  }

  try {
    const res = await fetch(BLOCKLIST_URL);
    if (!res.ok) throw new Error('Failed to fetch remote blocklist');
    const text = await res.text();
    const domains = text.split('\n')
      .map(d => d.trim().toLowerCase())
      .filter(d => d && !d.startsWith('#'));

    DYNAMIC_BLOCKLIST = new Set(domains);
    BLOCKLIST_LAST_UPDATED = now;
    return DYNAMIC_BLOCKLIST;
  } catch (err) {
    console.error('Blocklist sync failed. Using static protection layer:', err.message);
    return DYNAMIC_BLOCKLIST.size > 0 ? DYNAMIC_BLOCKLIST : STATIC_FALLBACK;
  }
}

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

async function checkMXRecord(domain) {
  const now = Date.now();
  const cached = mxCache.get(domain);
  if (cached && cached.expiresAt > now) {
    return cached.hasMX;
  }

  // Evict items if memory optimization bounds are reached
  if (mxCache.size >= MAX_CACHE_SIZE) {
    const firstKey = mxCache.keys().next().value;
    if (firstKey) mxCache.delete(firstKey);
  }

  try {
    const mxRecords = await Promise.race([
      dns.resolveMx(domain),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2500))
    ]);
    const hasMX = Array.isArray(mxRecords) && mxRecords.length > 0;
    mxCache.set(domain, { hasMX, expiresAt: now + mxCacheTTL });
    return hasMX;
  } catch {
    mxCache.set(domain, { hasMX: false, expiresAt: now + mxCacheTTL });
    return false;
  }
}

function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - 60000;
  
  if (rateLimitStore.size >= MAX_CACHE_SIZE) {
    const firstKey = rateLimitStore.keys().next().value;
    if (firstKey) rateLimitStore.delete(firstKey);
  }

  if (!rateLimitStore.has(ip)) rateLimitStore.set(ip, []);

  let timestamps = rateLimitStore.get(ip).filter(ts => ts > windowStart);
  const remaining = RATE_LIMIT - timestamps.length;

  if (timestamps.length >= RATE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  timestamps.push(now);
  rateLimitStore.set(ip, timestamps);
  return { allowed: true, remaining: Math.max(0, remaining - 1) };
}

function logCheck(email, domain, status, reason, latencyMs) {
  stats.total_requests++;
  if (status === 'block') stats.blocked++;
  else stats.allowed++;

  stats.avg_latency_ms = Math.round(
    (stats.avg_latency_ms * (stats.total_requests - 1) + latencyMs) / stats.total_requests
  );

  stats.last_checks.unshift({
    email: email.replace(/(.{2}).*(@.*)/, '$1***$2'),
    domain,
    status,
    reason,
    latency_ms: latencyMs,
    time: new Date().toISOString()
  });
  if (stats.last_checks.length > 50) stats.last_checks.pop();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  res.setHeader('Cache-Control', 'no-store, max-age=0'); // Disabled shared cache proxying for processing safety

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && searchParams.get('stats') === 'true') {
    const blockRate = stats.total_requests > 0 ? ((stats.blocked / stats.total_requests) * 100).toFixed(2) : 0;
    return res.status(200).json({
      ...stats,
      block_rate_percent: parseFloat(blockRate),
      blocklist_size: DYNAMIC_BLOCKLIST.size,
      blocklist_updated_at: new Date(BLOCKLIST_LAST_UPDATED).toISOString(),
      mx_cache_size: mxCache.size
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST for checks.' });
  }

  const VALID_KEYS = new Set(process.env.API_KEYS?.split(',').filter(Boolean) || []);
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || !VALID_KEYS.has(apiKey)) {
    return res.status(401).json({ error: 'Invalid or missing API key.' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const rateCheck = checkRateLimit(ip);

  res.setHeader('x-ratelimit-limit', RATE_LIMIT);
  res.setHeader('x-ratelimit-remaining', rateCheck.remaining);

  if (!rateCheck.allowed) {
    return res.status(429).json({ error: `Rate limit exceeded. Max ${RATE_LIMIT} req/min.` });
  }

  const start = Date.now();

  try {
    // Robust payload verification to prevent internal engine crashes
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid request body parsing payload format.' });
    }

    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "email" field.' });
    }

    const cleanEmail = email.trim();
    if (!isValidEmail(cleanEmail)) {
      const latency = Date.now() - start;
      logCheck(cleanEmail, '', 'block', 'Invalid email format.', latency);
      return res.status(400).json({
        email: cleanEmail,
        valid: false,
        disposable: false,
        reason: 'Invalid email format.'
      });
    }

    const domain = cleanEmail.split('@')[1].toLowerCase();
    const blocklist = await loadBlocklist();
    const isDisposable = checkDomainMatch(domain, blocklist);

    const domainParts = domain.split('.');
    const primaryTld = domainParts[domainParts.length - 1];
    const isSuspiciousTLD = !TRUSTED_TLDS.has(primaryTld) && primaryTld.length > 4;

    const hasMX = await checkMXRecord(domain);
    const noMX = !hasMX;

    let status = 'allow';
    let reason = 'OK';
    let disposable = isDisposable;

    if (isDisposable) {
      status = 'block';
      reason = 'Disposable email domain detected.';
    } else if (noMX) {
      status = 'block';
      reason = 'Domain has no valid MX records.';
    }

    const latency = Date.now() - start;
    logCheck(cleanEmail, domain, status, reason, latency);

    const isValid = status === 'allow';

    return res.status(200).json({
      email: cleanEmail,
      domain,
      valid: isValid,
      disposable,
      has_mx: hasMX,
      suspicious_tld: isSuspiciousTLD,
      status,
      reason,
      latency_ms: latency,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    const latency = Date.now() - start;
    return res.status(500).json({ error: 'Internal server error', detail: err.message, latency_ms: latency });
  }
}
