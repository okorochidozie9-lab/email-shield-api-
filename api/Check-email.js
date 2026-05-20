// /api/check-email.js
// Disposable Email Shield API

const DISPOSABLE_DOMAINS = new Set([
  // Start with 2000+ domains. You can pull this from a public list on GitHub
  "10minutemail.com", "tempmail.org", "guerrillamail.com", "mailinator.com", 
  "sharklasers.com", "trashmail.com", "temp-mail.org", "yopmail.com",
  "maildrop.cc", "dispostable.com", "getnada.com", "throwawaymail.com",
  "fakemail.net", "mailnesia.com", "spamgourmet.com"
]);

const ALLOWED_TLDS = new Set(['com', 'net', 'org', 'io', 'co', 'app', 'dev']);

function isValidEmail(email) {
  // Basic regex check. Don’t go overboard here
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function extractDomain(email) {
  try {
    return email.split('@')[1].toLowerCase().trim();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // CORS for browser requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Missing "email" in request body' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ 
        email, 
        valid: false, 
        disposable: false, 
        reason: 'Invalid email format' 
      });
    }

    const domain = extractDomain(email);
    const isDisposable = DISPOSABLE_DOMAINS.has(domain);
    const tld = domain.split('.').pop();
    const isSuspiciousTLD = !ALLOWED_TLDS.has(tld) && tld.length > 4;

    return res.status(200).json({
      email,
      domain,
      valid: true,
      disposable: isDisposable,
      suspicious_tld: isSuspiciousTLD,
      status: isDisposable ? 'block' : 'allow',
      reason: isDisposable ? 'Disposable email domain' : 'OK'
    });

  } catch (err) {
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}
