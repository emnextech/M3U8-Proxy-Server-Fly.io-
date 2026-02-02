/**
 * M3U8 Proxy Server - Based on itzzzme/m3u8proxy patterns
 * Endpoints:
 *   /m3u8-proxy?url=<m3u8_url>&headers=<json_headers>
 *   /ts-proxy?url=<segment_url>&headers=<json_headers>
 * 
 * Default referer: https://megacloud.club/
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const DEFAULT_REFERER = "https://megacloud.club/";

// CORS headers for all responses
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "*",
};

/**
 * Fetch a URL with proper headers
 */
async function fetchUrl(targetUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl);
    const isHttps = u.protocol === "https:";
    const lib = isHttps ? https : http;
    
    const options = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: "GET",
      rejectUnauthorized: false,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": headers.Referer || headers.referer || DEFAULT_REFERER,
        "Origin": headers.Origin || headers.origin || new URL(headers.Referer || headers.referer || DEFAULT_REFERER).origin,
        ...headers,
      },
    };

    const req = lib.request(options, (res) => {
      // Handle redirects
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        const nextUrl = res.headers.location.startsWith("http")
          ? res.headers.location
          : new URL(res.headers.location, targetUrl).href;
        res.resume();
        return fetchUrl(nextUrl, headers).then(resolve).catch(reject);
      }
      
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
      res.on("error", reject);
    });

    req.on("error", reject);
    req.end();
  });
}

/**
 * Proxy M3U8 playlist - rewrites all URLs to go through proxy
 */
async function proxyM3U8(targetUrl, headers, res, proxyBaseUrl) {
  try {
    const result = await fetchUrl(targetUrl, headers);
    
    if (result.status !== 200) {
      res.writeHead(result.status, CORS_HEADERS);
      res.end(result.body);
      return;
    }

    let m3u8Content = result.body.toString("utf8");
    
    // Check if this is actually M3U8 content
    if (!m3u8Content.includes("#EXTM3U") && !m3u8Content.includes("#EXTINF")) {
      res.writeHead(200, { ...CORS_HEADERS, "Content-Type": "application/vnd.apple.mpegurl" });
      res.end(m3u8Content);
      return;
    }

    const lines = m3u8Content.split("\n");
    const newLines = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (!trimmed) {
        newLines.push(line);
        continue;
      }

      if (trimmed.startsWith("#")) {
        // Handle #EXT-X-KEY: and other directives with URI=""
        if (trimmed.includes('URI="')) {
          const newLine = line.replace(/URI="([^"]+)"/g, (_, uri) => {
            const absoluteUrl = uri.startsWith("http") ? uri : new URL(uri, targetUrl).href;
            return `URI="${proxyBaseUrl}/ts-proxy?url=${encodeURIComponent(absoluteUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}"`;
          });
          newLines.push(newLine);
        } else {
          newLines.push(line);
        }
        continue;
      }

      // Non-comment line = URL (segment or sub-playlist)
      const absoluteUrl = trimmed.startsWith("http") ? trimmed : new URL(trimmed, targetUrl).href;
      
      // Use m3u8-proxy for .m3u8 files, ts-proxy for segments
      const endpoint = absoluteUrl.includes(".m3u8") ? "m3u8-proxy" : "ts-proxy";
      newLines.push(`${proxyBaseUrl}/${endpoint}?url=${encodeURIComponent(absoluteUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`);
    }

    res.writeHead(200, {
      ...CORS_HEADERS,
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    });
    res.end(newLines.join("\n"));
  } catch (error) {
    console.error("M3U8 proxy error:", error.message);
    res.writeHead(500, CORS_HEADERS);
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Proxy TS segment or other media files - streams directly
 */
async function proxyTs(targetUrl, headers, req, res) {
  try {
    const u = new URL(targetUrl);
    const isHttps = u.protocol === "https:";
    const lib = isHttps ? https : http;

    const options = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: req.method,
      rejectUnauthorized: false,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": headers.Referer || headers.referer || DEFAULT_REFERER,
        "Origin": headers.Origin || headers.origin || new URL(headers.Referer || headers.referer || DEFAULT_REFERER).origin,
        ...headers,
      },
    };

    // Pass through Range header if present
    if (req.headers.range) {
      options.headers.Range = req.headers.range;
    }

    const proxyReq = lib.request(options, (proxyRes) => {
      // Handle redirects
      if ([301, 302, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
        proxyRes.resume();
        const nextUrl = proxyRes.headers.location.startsWith("http")
          ? proxyRes.headers.location
          : new URL(proxyRes.headers.location, targetUrl).href;
        return proxyTs(nextUrl, headers, req, res);
      }

      const responseHeaders = {
        ...CORS_HEADERS,
        "Content-Type": proxyRes.headers["content-type"] || "video/mp2t",
      };
      
      if (proxyRes.headers["content-length"]) {
        responseHeaders["Content-Length"] = proxyRes.headers["content-length"];
      }
      if (proxyRes.headers["content-range"]) {
        responseHeaders["Content-Range"] = proxyRes.headers["content-range"];
      }
      if (proxyRes.headers["accept-ranges"]) {
        responseHeaders["Accept-Ranges"] = proxyRes.headers["accept-ranges"];
      }

      res.writeHead(proxyRes.statusCode, responseHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error("TS proxy error:", err.message);
      if (!res.headersSent) {
        res.writeHead(502, CORS_HEADERS);
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    proxyReq.end();
  } catch (error) {
    console.error("TS proxy error:", error.message);
    res.writeHead(500, CORS_HEADERS);
    res.end(JSON.stringify({ error: error.message }));
  }
}

/**
 * Legacy endpoint - simple proxy with ?url=<url>&referer=<referer>
 * For backward compatibility
 */
async function legacyProxy(targetUrl, referer, req, res, proxyBaseUrl) {
  const headers = { Referer: referer || DEFAULT_REFERER };
  
  // Check if this looks like an M3U8 URL
  if (targetUrl.includes(".m3u8") || targetUrl.includes("master")) {
    return proxyM3U8(targetUrl, headers, res, proxyBaseUrl);
  }
  
  // Otherwise treat as segment
  return proxyTs(targetUrl, headers, req, res);
}

// Create HTTP server
const server = http.createServer((req, res) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = reqUrl.pathname;

  // Determine proxy base URL
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
  const proxyBaseUrl = PUBLIC_URL !== `http://localhost:${PORT}` ? PUBLIC_URL : `${proto}://${host}`;

  // Route: /m3u8-proxy
  if (pathname === "/m3u8-proxy") {
    const targetUrl = reqUrl.searchParams.get("url");
    let headers = {};
    try {
      headers = JSON.parse(reqUrl.searchParams.get("headers") || "{}");
    } catch (e) {
      // Use default headers
    }
    
    if (!targetUrl) {
      res.writeHead(400, CORS_HEADERS);
      res.end("URL parameter is required");
      return;
    }

    // Ensure referer is set
    if (!headers.Referer && !headers.referer) {
      headers.Referer = DEFAULT_REFERER;
    }

    return proxyM3U8(targetUrl, headers, res, proxyBaseUrl);
  }

  // Route: /ts-proxy
  if (pathname === "/ts-proxy") {
    const targetUrl = reqUrl.searchParams.get("url");
    let headers = {};
    try {
      headers = JSON.parse(reqUrl.searchParams.get("headers") || "{}");
    } catch (e) {
      // Use default headers
    }

    if (!targetUrl) {
      res.writeHead(400, CORS_HEADERS);
      res.end("URL parameter is required");
      return;
    }

    // Ensure referer is set
    if (!headers.Referer && !headers.referer) {
      headers.Referer = DEFAULT_REFERER;
    }

    return proxyTs(targetUrl, headers, req, res);
  }

  // Route: Legacy /?url=<url>&referer=<referer>
  if (pathname === "/" && reqUrl.searchParams.has("url")) {
    const targetUrl = reqUrl.searchParams.get("url");
    const referer = reqUrl.searchParams.get("referer") || DEFAULT_REFERER;

    if (!targetUrl) {
      res.writeHead(400, CORS_HEADERS);
      res.end("URL parameter is required");
      return;
    }

    return legacyProxy(targetUrl, referer, req, res, proxyBaseUrl);
  }

  // Default: show usage
  res.writeHead(200, { "Content-Type": "text/html", ...CORS_HEADERS });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head><title>M3U8 Proxy</title></head>
    <body>
      <h1>M3U8 Proxy Server</h1>
      <p>Endpoints:</p>
      <ul>
        <li><code>/m3u8-proxy?url=&lt;m3u8_url&gt;&headers=&lt;json_headers&gt;</code> - Proxy M3U8 playlists</li>
        <li><code>/ts-proxy?url=&lt;segment_url&gt;&headers=&lt;json_headers&gt;</code> - Proxy segments</li>
        <li><code>/?url=&lt;url&gt;&referer=&lt;referer&gt;</code> - Legacy endpoint (auto-detects type)</li>
      </ul>
      <p>Default referer: ${DEFAULT_REFERER}</p>
    </body>
    </html>
  `);
});

server.listen(PORT, HOST, () => {
  console.log(`M3U8 Proxy listening on ${HOST}:${PORT}`);
  console.log(`Public URL: ${PUBLIC_URL}`);
});
