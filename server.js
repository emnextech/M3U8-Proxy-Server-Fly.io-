/**
 * M3U8 / video segment proxy server
 * Use ?url=<encoded-url>&referer=<encoded-referer>
 * No CPU limit - suitable for Railway, Render, Fly.io, Oracle Cloud free tier
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
};

const MAX_REDIRECTS = 5;

function proxyRequest(targetUrl, referer, rangeHeader, res, proxyBase, redirectCount = 0) {
  if (redirectCount > MAX_REDIRECTS) {
    res.writeHead(502, { "Content-Type": "application/json", ...CORS });
    res.end(JSON.stringify({ error: "Too many redirects" }));
    return;
  }
  const u = new URL(targetUrl);
  const isHttps = u.protocol === "https:";
  const lib = isHttps ? https : require("http");
  const port = u.port || (isHttps ? "443" : "80");
  const path = u.pathname + u.search;
  // Use target origin as Referer so upstream CDN accepts the request (many return 404 otherwise)
  const requestReferer = u.origin + "/";
  const requestOptions = {
    hostname: u.hostname,
    port,
    path: path || "/",
    method: "GET",
    rejectUnauthorized: false,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Referer: requestReferer,
      Origin: u.origin,
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
    },
  };
  if (rangeHeader) requestOptions.headers.Range = rangeHeader;

  const req = lib.request(
    requestOptions,
    (upstream) => {
      const outHeaders = { ...CORS };
      const cl = upstream.headers["content-length"];
      if (cl) outHeaders["Content-Length"] = cl;
      const cr = upstream.headers["content-range"];
      if (cr) outHeaders["Content-Range"] = cr;
      outHeaders["Accept-Ranges"] = upstream.headers["accept-ranges"] || "bytes";

      const isRedirect = [301, 302, 307, 308].includes(upstream.statusCode);
      const location = upstream.headers.location;
      if (isRedirect && location) {
        upstream.resume();
        const nextUrl = location.startsWith("http") ? location : new URL(location, targetUrl).href;
        return proxyRequest(nextUrl, referer, rangeHeader, res, proxyBase, redirectCount + 1);
      }
      if (upstream.statusCode !== 200 && upstream.statusCode !== 206) {
        res.writeHead(upstream.statusCode, outHeaders);
        upstream.pipe(res);
        return;
      }

      const contentType = (upstream.headers["content-type"] || "").toLowerCase();
      const isM3u8 = contentType.includes("mpegurl") || targetUrl.includes(".m3u8");

      if (isM3u8) {
        const chunks = [];
        upstream.on("data", (c) => chunks.push(c));
        upstream.on("end", () => {
          let body = Buffer.concat(chunks).toString("utf8");
          if (body.startsWith("#EXTM3U")) {
            const basePath = targetUrl.replace(/\/[^/]*$/, "") + "/";
            const lines = body.split("\n").map((line) => {
              const t = line.trim();
              if (!t || t.startsWith("#")) {
                if (line.includes('URI="')) {
                  return line.replace(/URI="([^"]+)"/g, (_, uri) => {
                    const abs = uri.startsWith("http") ? uri : new URL(uri, targetUrl).href;
                    return `URI="${proxyBase}?url=${encodeURIComponent(abs)}&referer=${encodeURIComponent(referer)}"`;
                  });
                }
                return line;
              }
              const abs = t.startsWith("http") ? t : basePath + t;
              return `${proxyBase}?url=${encodeURIComponent(abs)}&referer=${encodeURIComponent(referer)}`;
            });
            body = lines.join("\n");
          }
          outHeaders["Content-Type"] = "application/vnd.apple.mpegurl";
          res.writeHead(upstream.statusCode, outHeaders);
          res.end(body);
        });
        return;
      }

      outHeaders["Content-Type"] = upstream.headers["content-type"] || "video/mp2t";
      res.writeHead(upstream.statusCode, outHeaders);
      upstream.pipe(res);
    }
  );
  req.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "application/json", ...CORS });
    res.end(JSON.stringify({ error: err.message }));
  });
  req.end();
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, CORS);
    res.end();
    return;
  }

  const u = new URL(req.url || "", `http://localhost:${PORT}`);
  const url = u.searchParams.get("url");
  // Use target URL's origin as referer so upstream CDN accepts the request (avoids 404 from host check)
  let referer = u.searchParams.get("referer");
  if (!referer && url) {
    try {
      referer = new URL(url).origin + "/";
    } catch (_) {}
  }
  referer = referer || "https://rapid-cloud.co/";
  const rangeHeader = req.headers.range;

  if (!url) {
    res.writeHead(400, { "Content-Type": "text/plain", ...CORS });
    res.end("URL parameter is required. Use ?url=<encoded-url>&referer=<encoded-referer>");
    return;
  }

  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:" + PORT;
  const proxyBase = `${proto}://${host}/`;
  proxyRequest(url, referer, rangeHeader, res, proxyBase);
});

server.listen(PORT, () => {
  console.log("M3U8 proxy listening on port", PORT);
});
