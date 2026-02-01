# Anime M3U8 Proxy

A small HTTP proxy server for HLS (M3U8) video streams. It fetches playlists and segments from upstream servers with the correct referer and CORS headers so you can play streams in the browser without CORS or referer blocks.

---

## Description

Many video streams (e.g. anime) are served as HLS: a main `.m3u8` playlist plus `.ts` segment files. Browsers often block these because of CORS or strict referer checks. This proxy runs on your own server, requests the URLs with the right headers, rewrites playlist URLs to go through the proxy, and returns the data with permissive CORS so your frontend can use it.

**Use case:** Your web app needs to play an M3U8 stream. You send the stream URL (and optional referer) to this proxy; the proxy fetches it and sends it back with CORS enabled. No database, no heavy dependencies—just Node.js.

---

## What It Does

- Accepts `GET` requests with `url` (encoded stream or segment URL) and optional `referer`
- Fetches that URL with a browser-like User-Agent and the given Referer/Origin
- Forwards `Range` headers for video seeking
- For M3U8 playlists: rewrites segment URIs so they also go through the proxy
- Adds CORS headers so any origin can use the response

---

## Usage

**Endpoint:** `GET /?url=<encoded-url>&referer=<encoded-referer>`

| Parameter | Required | Description |
|-----------|----------|-------------|
| `url` | Yes | Full URL of the M3U8 or segment (e.g. `.ts`). Must be URL-encoded. |
| `referer` | No | Referer sent to the upstream server. Default: `https://rapid-cloud.co/` |

**Example (browser or frontend):**

```
https://your-proxy.fly.dev/?url=https%3A%2F%2Fexample.com%2Fstream.m3u8&referer=https%3A%2F%2Fexample.com%2F
```

Use that URL as the `src` for your video element or HLS player.

---

## Run Locally

**Requirements:** Node.js 18 or higher.

```bash
git clone https://github.com/YOUR_USERNAME/anime_proxy.git
cd anime_proxy
npm install
npm start
```

Server runs at `http://localhost:3000`. Override the port with the `PORT` environment variable.

**Quick test:**

```bash
curl "http://localhost:3000/?url=ENCODED_M3U8_URL&referer=ENCODED_REFERER"
```

---

## Deploy

### Fly.io

1. Install [flyctl](https://fly.io/docs/hands-on/install-flyctl/) and log in:
   ```bash
   fly auth login
   ```

2. From the project folder:
   ```bash
   fly launch
   ```
   Pick an app name and region; skip Postgres and Redis.

3. Deploy:
   ```bash
   fly deploy
   ```

4. Your proxy base URL: `https://YOUR-APP-NAME.fly.dev/`

### Docker

```bash
docker build -t anime-m3u8-proxy .
docker run -p 8080:8080 -e PORT=8080 anime-m3u8-proxy
```

### Other platforms (Railway, Render, Oracle Cloud)

Set the start command to `node server.js` and the `PORT` env var to the value provided by the platform. No database or extra build steps needed.

---

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port the server listens on. Use the platform’s port (e.g. `8080`) when deploying. |

---

## Project Layout

```
anime_proxy/
├── server.js      # Proxy server (Node.js)
├── package.json   # Dependencies and scripts
├── Dockerfile     # Docker image (Node 20 Alpine)
├── fly.toml       # Fly.io config (optional)
└── README.md
```

---

## Disclaimer

This proxy is for personal or educational use. You are responsible for complying with the terms of the streaming sites and applicable laws. The authors do not host or endorse any specific content.
