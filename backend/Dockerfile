# syntax=docker/dockerfile:1
# Backend image. Stages:
#   build   - full dependencies, generates the Prisma client, compiles TypeScript. Also used (as the
#             `migrate` and `seed` services in docker-compose.yml) because it has the Prisma CLI / tsx.
#   runtime - production dependencies + compiled output only, runs as the unprivileged `node` user.

FROM node:22-bookworm-slim AS build
WORKDIR /app
# The schema and Prisma config must exist before `npm ci` (its postinstall runs `prisma generate`).
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: the postinstall (`prisma generate`) needs the Prisma CLI, a dev dependency; the
# generated client is already compiled into dist/ by the build stage.
# --omit=optional: npm treats `prisma` as an optional peer of @prisma/client and would install the CLI
# (+ typescript, react-dom...) even with --omit=dev: 344 MB instead of 91 MB (measured).
RUN npm ci --omit=dev --omit=optional --ignore-scripts && npm rebuild argon2 && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
