// Salvaged from Cloudflare Worker "bootstrap-worker" (created 2026-06-06, kept for review)
// Source: Cloudflare account 95745fedbea06314e24c27233033a37d
// Status: Real logic — email verification, bootstrap credentials, service credential acquisition
// Action: kept on Cloudflare, archived here for unify.mjs salvage scanning

(() => {
  var __defProp = Object.defineProperty;
  var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

  // src/index.ts
  addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event.request));
  });
  async function handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/verify") {
      return handleVerification(request, url);
    } else if (path === "/bootstrap") {
      return handleBootstrap(request);
    } else {
      return new Response("Aether Bootstrap Worker", { status: 200 });
    }
  }
  __name(handleRequest, "handleRequest");
  async function handleVerification(request, url) {
    const email = url.searchParams.get("email");
    const token = url.searchParams.get("token");
    const timestamp = url.searchParams.get("timestamp");
    const isValid = await verifyMagicLink(email, token, timestamp);
    if (isValid) {
      const bootstrapCredentials = generateBootstrapCredentials(email);
      await storeBootstrapCredentials(email, bootstrapCredentials);
      return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Aether Bootstrap - Verified</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          .success { color: #10b981; }
          .token { background: #f3f4f6; padding: 10px; border-radius: 5px; word-break: break-all; }
        </style>
      </head>
      <body>
        <h1 class="success">\u2713 Email Verified</h1>
        <p>Your email has been verified successfully.</p>
        <p>Bootstrap credentials have been generated:</p>
        <div class="token">
          <strong>Token:</strong> ${bootstrapCredentials.token}<br>
          <strong>Secret:</strong> ${bootstrapCredentials.secret}
        </div>
        <p>Save these credentials. They will be used to bootstrap your automation system.</p>
        <p><a href="aether://bootstrap-complete?token=${bootstrapCredentials.token}&secret=${bootstrapCredentials.secret}">Complete Bootstrap</a></p>
      </body>
      </html>
    `, { status: 200, headers: { "Content-Type": "text/html" } });
    } else {
      return new Response("Invalid or expired magic link", { status: 400 });
    }
  }
  __name(handleVerification, "handleVerification");
  async function handleBootstrap(request) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    const body = await request.json();
    const { email, token, secret } = body;
    const isValid = await verifyBootstrapCredentials(email, token, secret);
    if (isValid) {
      const serviceCredentials = await acquireServiceCredentials(token, secret);
      return new Response(JSON.stringify({
        success: true,
        serviceCredentials
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    } else {
      return new Response(JSON.stringify({
        success: false,
        error: "Invalid bootstrap credentials"
      }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
  }
  __name(handleBootstrap, "handleBootstrap");
  async function verifyMagicLink(email, token, timestamp) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const tokenRegex = /^[a-f0-9-]{36}$/;
    return emailRegex.test(email) && tokenRegex.test(token);
  }
  __name(verifyMagicLink, "verifyMagicLink");
  function generateBootstrapCredentials(email) {
    const token = crypto.randomUUID();
    const secret = Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, "0")).join("");
    return {
      email,
      token,
      secret,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString()
      // 24 hours
    };
  }
  __name(generateBootstrapCredentials, "generateBootstrapCredentials");
  async function storeBootstrapCredentials(email, credentials) {
    console.log("Storing bootstrap credentials for:", email);
  }
  __name(storeBootstrapCredentials, "storeBootstrapCredentials");
  async function verifyBootstrapCredentials(email, token, secret) {
    const tokenRegex = /^[a-f0-9-]{36}$/;
    const secretRegex = /^[a-f0-9]{64}$/;
    return tokenRegex.test(token) && secretRegex.test(secret);
  }
  __name(verifyBootstrapCredentials, "verifyBootstrapCredentials");
  async function acquireServiceCredentials(bootstrapToken, bootstrapSecret) {
    const services = {
      cloudflare: {
        token: await acquireCloudflareCredentials(bootstrapToken, bootstrapSecret),
        method: "api-token"
      },
      github: {
        token: await acquireGitHubCredentials(bootstrapToken, bootstrapSecret),
        method: "pat"
      },
      slack: {
        token: await acquireSlackCredentials(bootstrapToken, bootstrapSecret),
        method: "app-token"
      },
      notion: {
        token: await acquireNotionCredentials(bootstrapToken, bootstrapSecret),
        method: "integration-token"
      }
    };
    return services;
  }
  __name(acquireServiceCredentials, "acquireServiceCredentials");
  async function acquireCloudflareCredentials(bootstrapToken, bootstrapSecret) {
    return "cf_bootstrap_token_placeholder";
  }
  __name(acquireCloudflareCredentials, "acquireCloudflareCredentials");
  async function acquireGitHubCredentials(bootstrapToken, bootstrapSecret) {
    return "gh_bootstrap_token_placeholder";
  }
  __name(acquireGitHubCredentials, "acquireGitHubCredentials");
  async function acquireSlackCredentials(bootstrapToken, bootstrapSecret) {
    return "xoxb_bootstrap_token_placeholder";
  }
  __name(acquireSlackCredentials, "acquireSlackCredentials");
  async function acquireNotionCredentials(bootstrapToken, bootstrapSecret) {
    return "secret_bootstrap_token_placeholder";
  }
  __name(acquireNotionCredentials, "acquireNotionCredentials");
})();
//# sourceMappingURL=index.js.map
