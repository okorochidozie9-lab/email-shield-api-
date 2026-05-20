# Disposable Email Shield API

A fast, serverless API to block disposable emails and fake signups. 
Uses a 50k+ auto-updating blocklist + MX validation + rate limiting.

Built for Vercel. Cold start <4s. P95 latency <120ms.

## Features

- **50k+ Disposable Domain Blocklist**: Auto-syncs from a trusted GitHub repo every 6h. Falls back to static list if offline.
- **MX Record Validation**: Blocks domains with no valid mail servers.
- **Suspicious TLD Detection**: Flags long, uncommon TLDs.
- **Rate Limiting**: 100 req/min per IP. Returns standard `x-ratelimit` headers.
- **API Key Auth**: Secure endpoints with `x-api-key`.
- **Built-in Stats**: Hit `?stats=true` to see usage, block rate, latency.
- **Fault Tolerant**: Cached blocklist + MX results. Never blocks your API if GitHub is down.
- **Zero Dependencies**: Uses only Node built-ins. Deploy anywhere.

## Quick Start

### 1. Deploy to Vercel

```bash
git clone <your-repo>
cd email-shield-api
vercel
