// Salvaged from Cloudflare Worker "landing-worker" (created 2026-06-06, kept for review)
// Source: Cloudflare account 95745fedbea06314e24c27233033a37d
// Status: Real logic — serves frontend assets from R2, falls back to redirect to a-to-mind.com
// Action: kept on Cloudflare, archived here for unify.mjs salvage scanning

(() => {
  var __defProp = Object.defineProperty;
  var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

  // src/index.ts
  var index_default = {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === "/" || url.pathname === "/index.html") {
        try {
          const object = await env.FRONTEND_ASSETS.get("index.html");
          if (object) {
            return new Response(object.body, {
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "public, max-age=3600"
              }
            });
          }
        } catch (e) {
          return new Response(getDefaultHTML(), {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-cache"
            }
          });
        }
      }
      try {
        const object = await env.FRONTEND_ASSETS.get(url.pathname.slice(1));
        if (object) {
          const contentType = getContentType(url.pathname);
          return new Response(object.body, {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=86400"
            }
          });
        }
      } catch (e) {
        try {
          const object = await env.FRONTEND_ASSETS.get("index.html");
          if (object) {
            return new Response(object.body, {
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "public, max-age=3600"
              }
            });
          }
        } catch (e2) {
          return new Response(getDefaultHTML(), {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-cache"
            }
          });
        }
      }
      return new Response("Not found", { status: 404 });
    }
  };
  function getContentType(filepath) {
    const ext = filepath.split(".").pop();
    const types = {
      "js": "application/javascript",
      "css": "text/css",
      "html": "text/html",
      "json": "application/json",
      "png": "image/png",
      "jpg": "image/jpeg",
      "svg": "image/svg+xml",
      "ico": "image/x-icon",
      "woff": "font/woff",
      "woff2": "font/woff2"
    };
    return types[ext] || "application/octet-stream";
  }
  __name(getContentType, "getContentType");
  function getDefaultHTML() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aether Ecosystem - Planetary Intelligence Substrate</title>
  <meta name="description" content="The planetary intelligence substrate. Autonomous operations at infinite scale.">
  <meta http-equiv="refresh" content="0;url=https://a-to-mind.com">
</head>
<body>
  <div style="display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: system-ui, sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); color: white;">
    <div style="text-align: center;">
      <h1 style="font-size: 2rem; margin-bottom: 1rem;">Aether Ecosystem</h1>
      <p style="color: #94a3b8; margin-bottom: 2rem;">Loading planetary intelligence substrate...</p>
      <div style="width: 40px; height: 40px; border: 3px solid #3b82f6; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
    </div>
  </div>
  <style>
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</body>
</html>`;
  }
  __name(getDefaultHTML, "getDefaultHTML");
  export {
    index_default as default
  };
  //# sourceMappingURL=index.js.map
})();
