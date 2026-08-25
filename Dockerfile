# syntax=docker/dockerfile:1

# ---------- stage 1: dependencies ----------
FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY client/package*.json ./client/
RUN npm ci --ignore-scripts=false
RUN npm --prefix client ci

# ---------- stage 2: build ----------
FROM deps AS build
WORKDIR /app
COPY tsconfig*.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src
COPY client ./client
RUN npx prisma generate
RUN npm --prefix client run build
RUN npm run build:server

# ---------- stage 3: runtime ----------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates default-mysql-client \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/client/dist ./client/dist
COPY prisma ./prisma
COPY scripts ./scripts
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && mkdir -p storage

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
