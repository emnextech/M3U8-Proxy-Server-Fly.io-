# M3U8 Proxy Server for Anime Streaming

A lightweight Node.js proxy server designed for HLS/M3U8 video streaming. Proxies video streams with proper headers to bypass CORS and referer restrictions. Perfect for anime streaming applications.

## Features

- **M3U8 Playlist Proxying** - Rewrites URLs in playlists to route through proxy
- **TS Segment Streaming** - Streams video segments with proper headers
- **Custom Headers Support** - Pass custom Referer/Origin headers via JSON
- **Legacy API Support** - Backwards compatible with `?url=&referer=` format
- **CORS Enabled** - Works with browser-based video players
- **Zero Dependencies** - Uses only Node.js built-in modules
- **Docker Ready** - Includes Dockerfile for containerized deployment

## API Endpoints

### New Format (Recommended)

```
GET /m3u8-proxy?url=<m3u8_url>&headers=<json_headers>
GET /ts-proxy?url=<segment_url>&headers=<json_headers>
```

**Example:**
```bash
# Proxy an M3U8 playlist
curl "https://your-proxy.fly.dev/m3u8-proxy?url=https%3A%2F%2Fexample.com%2Fstream.m3u8&headers=%7B%22Referer%22%3A%22https%3A%2F%2Fmegacloud.club%2F%22%7D"
```

### Legacy Format (Backwards Compatible)

```
GET /?url=<encoded_url>&referer=<encoded_referer>
```

**Example:**
```bash
curl "https://your-proxy.fly.dev/?url=https%3A%2F%2Fexample.com%2Fstream.m3u8&referer=https%3A%2F%2Fmegacloud.club%2F"
```

## Deployment to Fly.io

### Prerequisites

1. Install [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/)
2. Create a Fly.io account: `flyctl auth signup`
3. Login: `flyctl auth login`

### Deploy Steps

1. **Clone this repository:**
   ```bash
   git clone https://github.com/emnextech/M3U8-Proxy-Server-Fly.io-.git
   cd M3U8-Proxy-Server-Fly.io-
   ```

2. **Edit `fly.toml`** and replace `your-app-name` with your desired app name:
   ```toml
   app = 'my-m3u8-proxy'  # Choose a unique name
   ```

3. **Create and deploy the app:**
   ```bash
   flyctl launch --copy-config --no-deploy
   flyctl deploy
   ```

4. **Your proxy is now live at:**
   ```
   https://my-m3u8-proxy.fly.dev/
   ```

### Fly.io Regions

Choose a region close to your users for best performance:

| Code | Location |
|------|----------|
| `iad` | Washington, D.C. (US) |
| `lax` | Los Angeles (US) |
| `fra` | Frankfurt (EU) |
| `sin` | Singapore (Asia) |
| `syd` | Sydney (Australia) |
| `jnb` | Johannesburg (Africa) |

## Local Development

```bash
# Run locally
node server.js

# Server runs on http://localhost:3000
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `PUBLIC_URL` | Auto-detected | Public URL for URL rewriting |

## Integration Examples

### With HLS.js

```javascript
const proxyBase = 'https://your-proxy.fly.dev/';
const streamUrl = 'https://example.com/video.m3u8';
const headers = JSON.stringify({ Referer: 'https://megacloud.club/' });

const url = proxyBase + 'm3u8-proxy?url=' + encodeURIComponent(streamUrl) + '&headers=' + encodeURIComponent(headers);

const hls = new Hls();
hls.loadSource(url);
hls.attachMedia(videoElement);
```

### Legacy Format

```javascript
const proxyBase = 'https://your-proxy.fly.dev/?url=';
const streamUrl = 'https://example.com/video.m3u8';
const referer = 'https://megacloud.club/';

const url = proxyBase + encodeURIComponent(streamUrl) + '&referer=' + encodeURIComponent(referer);
```

## Docker Deployment

```bash
# Build
docker build -t m3u8-proxy .

# Run
docker run -p 3000:3000 m3u8-proxy
```

## How It Works

1. **M3U8 Playlists**: When you request an M3U8 file through `/m3u8-proxy`:
   - Fetches the original playlist with your specified headers
   - Rewrites all URLs in the playlist to route through the proxy
   - Returns the modified playlist to your player

2. **Video Segments**: When the player requests `/ts-proxy`:
   - Streams the segment directly from the origin
   - Forwards your custom headers (Referer, Origin, etc.)
   - Passes through range requests for seeking support

## Default Referer

If no referer is provided, the proxy uses `https://megacloud.club/` which works with most anime CDNs.

## License

MIT License - Free for personal and commercial use.

## Related Projects

- [Zenime](https://github.com/emnextech/emnexanimes) - Anime streaming frontend using this proxy
