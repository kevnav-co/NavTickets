# ─── Backend API Dockerfile (Reference) ──────────────────────────
# Cloud Functions are designed to run on Firebase's infrastructure.
# Use `firebase deploy --only functions` for production deployment.
# This Dockerfile is a reference for running the Express API standalone.
#
# For Dokploy, we recommend:
#   1. Deploy frontend via this Dockerfile + docker-compose.yml
#   2. Deploy Cloud Functions via Firebase CLI
#   3. Or deploy this API as a separate Dokploy service

FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 5001

# This runs the Express API standalone (without Firebase Functions triggers).
# For a full setup, you'd need Firebase Admin credentials.
CMD ["node", "index.js"]