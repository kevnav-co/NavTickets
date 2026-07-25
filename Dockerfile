# ─── Stage 1: Build ──────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the app (Vite bundles env vars at build time)
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_DATABASE_URL
ARG VITE_VAPID_KEY

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
ENV VITE_FIREBASE_DATABASE_URL=$VITE_FIREBASE_DATABASE_URL
ENV VITE_VAPID_KEY=$VITE_VAPID_KEY

RUN npm run build

# ─── Stage 2: Serve with Nginx ──────────────────────────────────
FROM nginx:alpine

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]