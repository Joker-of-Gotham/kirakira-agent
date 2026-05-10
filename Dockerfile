ARG KIRAKIRA_SOURCE_HASH=dev
ARG NPM_CONFIG_REGISTRY=https://registry.npmmirror.com

FROM node:22-bookworm AS node-build

ARG NPM_CONFIG_REGISTRY
ENV NPM_CONFIG_REGISTRY=$NPM_CONFIG_REGISTRY
ENV npm_config_registry=$NPM_CONFIG_REGISTRY

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10.33.2 --registry="$NPM_CONFIG_REGISTRY"

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json vitest.config.ts pytest.ini ./
RUN pnpm fetch --frozen-lockfile

COPY packages ./packages
COPY scripts ./scripts
COPY policies ./policies

RUN pnpm install --frozen-lockfile --offline
RUN pnpm build

FROM golang:1.23-bookworm AS kirakirad-build

WORKDIR /src/packages/kirakirad
COPY packages/kirakirad/go.mod packages/kirakirad/go.sum ./
RUN go mod download
COPY packages/kirakirad ./
RUN CGO_ENABLED=0 go build -o /out/kirakirad ./cmd/kirakirad

FROM node:22-bookworm AS runtime

ARG KIRAKIRA_SOURCE_HASH
ARG NPM_CONFIG_REGISTRY
ENV NPM_CONFIG_REGISTRY=$NPM_CONFIG_REGISTRY
ENV npm_config_registry=$NPM_CONFIG_REGISTRY
LABEL org.kirakira.source-hash=$KIRAKIRA_SOURCE_HASH

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ripgrep ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10.33.2 --registry="$NPM_CONFIG_REGISTRY"

WORKDIR /app

COPY --from=node-build /app ./
COPY --from=kirakirad-build /out/kirakirad /usr/local/bin/kirakirad

ENV NODE_ENV=production
ENV KIRAKIRA_POLICY_BUNDLE=/workspace/policies
ENV KIRAKIRA_PDP_ENDPOINT=tcp://kirakirad:17777
ENV FORCE_COLOR=3
ENV COLORTERM=truecolor
ENV TERM=xterm-256color

ENTRYPOINT ["node", "/app/scripts/kirakira-container.mjs"]
CMD ["chat"]
