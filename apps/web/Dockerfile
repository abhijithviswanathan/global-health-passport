FROM node:24-bookworm-slim AS build
WORKDIR /workspace/apps/web
COPY apps/web/package.json apps/web/package-lock.json apps/web/.npmrc ./
RUN npm ci --no-audit --no-fund
COPY apps/web/ ./
COPY apps/shared/ ../shared/
RUN npm run build
FROM nginxinc/nginx-unprivileged:stable-alpine
COPY --from=build /workspace/apps/web/dist/client/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
