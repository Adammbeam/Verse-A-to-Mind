# SCAFFOLD — NOT VERIFIED on Cloudflare. Job #11079. Nothing here contains a secret.
# Owner token + Cloudflare creds are injected at runtime as Cloudflare secrets, never baked in.
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
