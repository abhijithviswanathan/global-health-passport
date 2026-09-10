FROM node:24-bookworm-slim AS build
WORKDIR /web
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
FROM nginxinc/nginx-unprivileged:stable-alpine
COPY --from=build /web/dist/client/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
