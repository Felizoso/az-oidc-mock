ARG ALPINE_VERSION=3.23

FROM node:22-alpine${ALPINE_VERSION} AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM alpine:${ALPINE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    CONFIG_PATH=/app/config.json
RUN apk add --no-cache dumb-init libatomic libstdc++ openssl \
    && addgroup -S -g 1000 node \
    && adduser -S -D -u 1000 -G node -h /home/node -s /bin/sh node \
    && mkdir -p /home/node \
    && chown -R node:node /app /home/node
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=build /usr/local/bin/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --chown=node:node config.example.json ./config.json
USER node
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["dumb-init", "node", "dist/index.js"]
