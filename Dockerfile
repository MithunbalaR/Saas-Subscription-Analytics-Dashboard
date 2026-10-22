# SubTrack - production image: builds the React app, then runs the Express API which also serves it.

# ---- Stage 1: build the frontend ----
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Stage 2: the server (production dependencies only) ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/ ./
COPY --from=client-build /app/client/dist /app/client/dist

# Run as the unprivileged "node" user; uploads live in a volume.
RUN mkdir -p uploads/avatars uploads/receipts && chown -R node:node uploads
USER node
VOLUME ["/app/server/uploads"]

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://localhost:5000/api/health || exit 1
CMD ["node", "server.js"]
