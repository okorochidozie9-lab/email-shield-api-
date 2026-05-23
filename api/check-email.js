// /api/check-email.js
// Optimized Enterprise-Grade Disposable Email Shield API V2

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

// In-memory bounded layer for ephemeral execution caches
const rateLimitStore = new Map();
const mxCache = new Map(); 
const mxCacheTTL = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 5000;

// Internal process analytics trackers
const stats = {
  total_requests: 0,
  blocked: 0,
  allowed: 0,
  avg_latency_ms: 0,
  started_at: new Date().toISOString()
};
const RATE_LIMIT = 100;

async function loadBlocklist() {
  const now = Date.now();
  if (DYNAMIC_BLOCKLIST.size > 0 && (now - BLOCKLIST_LAST_UPDATED < BLOCKLIST_TTL)) {
    return DYNAMIC_BLOCKLIST;
  }

  try {
    const res = await fetch(BLOCKLIST_URL);
    if (!res.ok) throw new Error('Failed remote fetch sync');
    const text = await res.text();
    const domains = text.split('\n')
      .map(d => d.trim().toLowerCase())
      .filter(d => d && !d.startsWith('#'));

    DYNAMIC_BLOCKLIST = new Set(domains);
    BLOCKLIST_LAST_UPDATED = now;
    return DYNAMIC_BLOCKLIST;
  } catch (err) {
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

  if (mxCache.size >= MAX_CACHE_SIZE) {
    const firstKey = mxCache.keys().next().value;
    if (firstKey) mxCache.delete(firstKey);
  }

  try {
    const mxRecords = await Promise.race([
      dns.resolveMx(domain),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
    ]);
    const hasMX = Array.isArray(mxRecords) && mxRecords.length > 0;
    mxCache.set(domain, { hasMX, expiresAt: now + mxCacheTTL });
    return hasMX;
  } catch (err) {
    // If it's a structural failure code, assume no MX server exists. 
    // If it's a server/timeout error, fail-safe open (return true) so we don't block legitimate users.
    const isNoSuchDomain = ['ENOTFOUND', 'ENODATA'].includes(err.code);
    const hasMX = !isNoSuchDomain; 
    mxCache.set(domain, { hasMX, expiresAt: now + mxCacheTTL });
    return hasMX;
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

  const timestamps = rateLimitStore.get(ip).filter(ts => ts > windowStart);
  if (timestamps.length >= RATE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  timestamps.push(now);
  rateLimitStore.set(ip, timestamps);
  return { allowed: true, remaining: RATE_LIMIT - timestamps.length };
}

export default async function handler(req, res) {
  // Setup standard CORS middleware parameters
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Clean implementation query string evaluation for Vercel Serverless
  const { query } = req;
  if (req.method === 'GET' && query.stats === 'true') {
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
    return res.status(405).json({ error: 'Method not allowed. Use POST for validation checks.' });
  }

  // API Key Authentication layer check
  const VALID_KEYS = new Set(process.env.API_KEYS?.split(',').filter(Boolean) || []);
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || !VALID_KEYS.has(apiKey)) {
    return res.status(401).json({ error: 'Invalid or missing API key verification credentials.' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const rateCheck = checkRateLimit(ip);

  res.setHeader('x-ratelimit-limit', RATE_LIMIT);
  res.setHeader('x-ratelimit-remaining', rateCheck.remaining);

  if (!rateCheck.allowed) {
    return res.status(429).json({ error: `Too many requests. Limit ${RATE_LIMIT} req/min.` });
  }

  const start = Date.now();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid payload structure execution formatting.' });
    }

    const { email } = body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Missing standard string address parameter: "email"' });
    }

    const cleanEmail = email.trim();
    if (!isValidEmail(cleanEmail)) {
      const latency = Date.now() - start;
      stats.total_requests++;
      stats.blocked++;
      return res.status(200).json({
        email: cleanEmail,
        valid: false,
        disposable: false,
        status: 'block',
        reason: 'Malformed syntax format structure evaluation fail.'
      });
    }

    const domain = cleanEmail.split('@')[1].toLowerCase();
    const blocklist = await loadBlocklist();
    
    const isDisposable = checkDomainMatch(domain, blocklist);
    const domainParts = domain.split('.');
    const primaryTld = domainParts[domainParts.length - 1];
    const isSuspiciousTLD = !TRUSTED_TLDS.has(primaryTld) && primaryTld.length > 4;

    let hasMX = true;
    if (!isDisposable) {
      hasMX = await checkMXRecord(domain);
    }

    let status = 'allow';
    let reason = 'OK';

    if (isDisposable) {
      status = 'block';
      reason = 'Disposable transactional delivery pattern intercepted.';
    } else if (!hasMX) {
      status = 'block';
      reason = 'Target routing location lacks configured active mailbox endpoints.';
    }

    const latency = Date.now() - start;
    
    // Global metrics tracking calculation blocks
    stats.total_requests++;
    if (status === 'block') stats.blocked++;
    else stats.allowed++;
    stats.avg_latency_ms = Math.round(((stats.avg_latency_ms * (stats.total_requests - 1)) + latency) / stats.total_requests);

    return res.status(200).json({
      email: cleanEmail,
      domain,
      valid: status === 'allow',
      disposable: isDisposable,
      has_mx: hasMX,
      suspicious_tld: isSuspiciousTLD,
      status,
      reason,
      latency_ms: latency,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    const latency = Date.now() - start;
    return res.status(500).json({ error: 'Internal system fault', processing_latency: latency });
  }
}
