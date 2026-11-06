# node:20-slim (не alpine): Prisma потребує openssl/glibc
FROM node:20-slim AS build
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
RUN npm ci
COPY apps/api apps/api
COPY apps/admin apps/admin
# API (tsc) + адмінка (nuxt generate → статика в apps/admin/.output/public)
RUN npm run build -w apps/api && npm run build -w apps/admin

FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/api/prisma apps/api/prisma
# prisma CLI потрібен у runtime для migrate deploy
RUN npm ci --omit=dev -w apps/api && npm install --no-save -w apps/api prisma@6 \
    && npx --prefix apps/api prisma generate --schema apps/api/prisma/schema.prisma
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/admin/.output/public apps/admin/.output/public
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
