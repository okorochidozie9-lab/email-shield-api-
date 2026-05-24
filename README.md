Markdown# Disposable Email Shield API (V2)

A high-performance, serverless endpoint designed to block temporary emails, bot registrations, and fake signups at the gateway. Engineered specifically for seamless Vercel deployment with ultra-low execution latency.

Powered by the engineering team at **GetChurnShield**.

---

## Performance Metrics

* **P95 Latency:** < 120ms
* **Cold Start Time:** < 4s
* **Database Coverage:** 50,000+ active domains (auto-refreshing)

---

## Technical Features

### Dual-Layer Domain Protection
Queries a live, 50k+ open-source tracking repository. Refreshes memory caches dynamically every 6 hours and utilizes a high-speed hardcoded fallback buffer if upstream networks drop.

### Fail-Safe MX Check Routing
Validates active mail exchange configurations with a rigid 2-second strict race condition execution timeout. Standard domain errors (`ENOTFOUND`, `ENODATA`) are intercepted to catch dead domains while unexpected network timeouts fail-safe open to prevent blocking real users.

### Bounded Context Memory Protection
Caches rate limit structures and MX responses using a strict Least Recently Used (LRU) style first-in, first-out eviction pattern capped at 5,000 entries to prevent memory exhaustion inside stateless container layers.

### Granular Payload Parsing
Universally normalizes standard Vercel JSON objects and stringified raw formats automatically without crashing route handling engines.

---

## API Reference

### 1. Validate Single Account

`POST /api/check-email`

#### Required Headers

```http
Content-Type: application/json
x-api-key: YOUR_CHURN_SHIELD_SECRET_KEY
Request Body LayoutJSON{
  "email": "user@tempmail.org"
}
Response Payload Example (200 OK)JSON{
  "email": "user@tempmail.org",
  "domain": "tempmail.org",
  "valid": false,
  "disposable": true,
  "has_mx": true,
  "suspicious_tld": false,
  "status": "block",
  "reason": "Disposable transactional delivery pattern intercepted.",
  "latency_ms": 14,
  "timestamp": "2026-05-23T22:27:34.000Z"
}
2. Fetch Live Node Instance AnalyticsGET /api/check-email?stats=trueRetrieves localized server operational counters since the active instance thread container initial spin up cycle.Response Example (200 OK)JSON{
  "total_requests": 1420,
  "blocked": 310,
  "allowed": 1110,
  "avg_latency_ms": 18,
  "started_at": "2026-05-23T20:00:00.000Z",
  "block_rate_percent": 21.83,
  "blocklist_size": 51240,
  "blocklist_updated_at": "2026-05-23T21:45:12.000Z",
  "mx_cache_size": 842
}
Status and Error Handling MatrixStatus CodeDescription200 OKProcessing verification successfully evaluated (returns status: "allow" or status: "block").400 Bad RequestMissing explicit email parameter or incoming string fields format mismatch.401 UnauthorizedMissing or non-matching authentication signature parameter inside the x-api-key header slot.405 Method Not AllowedTriggering non-supported routes. Requires POST for account sweeps or GET for metric parameters.429 Too Many RequestsActive system user traffic exceeded instance ceiling threshold restrictions (100 requests / min).500 Internal FaultRuntime execution engine panic event loop handler crash protection fallback window.Rapid Deployment Strategy1. Configure Environment VariablesEnsure you add your target secrets parameter inside your Vercel platform environment dashboard configuration console panel setup:Code snippetAPI_KEYS=your_first_secret_key,your_second_secret_key
2. Deploy to VercelExecute initialization deployment steps locally inside your workspace root:Bashvercel login
vercel
LicenseMIT License. Created and maintained by the GetChurnShield team.
