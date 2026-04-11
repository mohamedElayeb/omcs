# ---- Build Stage ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Cache-bust: forces rebuild when source changes
ARG CACHEBUST=1
COPY . .
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy package files and install only production deps
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --legacy-peer-deps

# Copy built output from builder
COPY --from=builder /app/dist ./dist

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 4000
CMD ["node", "dist/main"]
