Disposable Email Shield API (V2)
A high-performance, serverless endpoint designed to block temporary emails, bot registrations, and fake signups at the gateway. Engineered specifically for seamless Vercel deployment with ultra-low execution latency.

Performance Metrics
P95 Latency: < 120ms
Cold Start Time: < 4s
Database Coverage: 50,000+ active domains (auto-refreshing)
Technical Features
Dual-Layer Domain Protection: Queries a live, 50k+ open-source tracking repository. Refreshes memory caches dynamically every 6 hours and utilizes a high-speed hardcoded fallback buffer if upstream networks drop.
Fail-Safe MX Check Routing: Validates active mail exchange configurations with a rigid 2-second strict race condition execution timeout. Standard domain errors (ENOTFOUND, ENODATA) are intercepted to catch dead domains while unexpected network timeouts fail-safe open to prevent blocking real users.
Bounded Context Memory Protection: Caches rate limit structures and MX responses using a strict Least Recently Used (LRU) style first-in, first-out eviction pattern capped at 5,000 entries to prevent memory exhaustion inside stateless container layers.
Granular Payload Parsing: Universally normalizes standard Vercel JSON objects and stringified raw formats automatically without crashing route handling engines.
API Reference
Validate Single Account
POST /api/check-email

Required Headers: Content-Type: application/json x-api-key: YOUR_CHURN_SHIELD_SECRET_KEY

Request Body Layout: { "email": "user@tempmail.org" }

Response Payload Example (200 OK): { "email": "user@tempmail.org", "domain": "tempmail.org", "valid": false, "disposable": true, "has_mx": true, "suspicious_tld": false, "status": "block", "reason": "Disposable transactional delivery pattern intercepted.", "latency_ms": 14, "timestamp": "2026-05-23T22:27:34.000Z" }

Fetch Live Node Instance Analytics
GET /api/check-email?stats=true

Retrieves localized server operational counters since the active instance thread container initial spin up cycle.

Response Example (200 OK): { "total_requests": 1420, "blocked": 310, "allowed": 1110, "avg_latency_ms": 18, "started_at": "2026-05-23T20:00:00.000Z", "block_rate_percent": 21.83, "blocklist_size": 51240, "blocklist_updated_at": "2026-05-23T21:45:12.000Z", "mx_cache_size": 842 }

Status and Error Handling Matrix
200 OK: Processing verification successfully evaluated (returns status: "allow" or status: "block").
400 Bad Request: Missing explicit email parameter or incoming string fields format mismatch.
401 Unauthorized: Missing or non-matching authentication signature parameter inside the x-api-key header slot.
425 Method Not Allowed: Triggering non-supported routes. Requires POST for account sweeps or GET for metric parameters.
429 Too Many Requests: Active system user traffic exceeded instance ceiling threshold restrictions (100 requests / min).
500 Internal Fault: Runtime execution engine panic event loop handler crash protection fallback window.
Rapid Deployment Strategy
Ensure you add your target secrets parameter inside your Vercel platform environment dashboard configuration console panel setup: API_KEYS=your_first_secret_key,your_second_secret_key

Execute initialization deployment steps locally inside your workspace root: vercel login vercel
