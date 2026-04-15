FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

ARG NEXT_PUBLIC_NESTJS_URL=http://localhost:4000
ARG NEXT_PUBLIC_AI_SERVICE_URL=http://localhost:8000

ENV NEXT_PUBLIC_NESTJS_URL=$NEXT_PUBLIC_NESTJS_URL
ENV NEXT_PUBLIC_AI_SERVICE_URL=$NEXT_PUBLIC_AI_SERVICE_URL

RUN npm run build

# ── Runtime ─────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public 2>/dev/null || true

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "server.js"]
