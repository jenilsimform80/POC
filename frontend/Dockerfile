# syntax=docker/dockerfile:1
# Frontend image: build the SPA, then serve it (and reverse-proxy /api to the backend) with
# unprivileged nginx. The browser only ever talks to this one origin.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Source maps are not published.
RUN find /usr/share/nginx/html -name '*.map' -delete
EXPOSE 8080
