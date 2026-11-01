# -----------------------------------------------------------------------------
# Stage 1: Build Static Assets with Vite
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . ./
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Production Nginx Server
# -----------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runner

COPY --from=builder /usr/src/app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
