# Multi-stage build producing a single ~30 MB image that hosts the calendar
# booking service: a Go HTTP API plus the built Vite frontend served from the
# same port. The four stages are intentionally narrow so layer caches stay
# small and rebuilds are fast.
#
# Stage 1 (contract):  TypeSpec -> openapi.yaml
# Stage 2 (frontend):  npm + Vite build -> frontend/dist
# Stage 3 (backend):   oapi-codegen + go build -> static binary
# Stage 4 (runtime):   alpine + binary + frontend/dist
#
# The Dockerfile sticks to features supported by Docker's legacy builder
# (no `# syntax=` directive, no `--mount=type=cache`) so the same file
# builds under the Hexlet CI runner, Render, and local Docker/BuildKit.

# ---------- 1) contract ----------
FROM node:22-alpine AS contract
WORKDIR /work/contract
COPY contract/package.json contract/package-lock.json ./
RUN npm ci
COPY contract/ ./
RUN npm run build

# ---------- 2) frontend ----------
FROM node:22-alpine AS frontend
WORKDIR /work/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
COPY --from=contract /work/contract/tsp-output ../contract/tsp-output
# Reuse the openapi.yaml from stage 1 — no need to rebuild the contract here.
RUN npx openapi-typescript ../contract/tsp-output/@typespec/openapi3/openapi.yaml -o src/api/types.ts
# Empty VITE_API_BASE_URL means "call the API on the same origin"; env.ts
# accepts an empty string and openapi-fetch will resolve paths like
# /event-types against window.location.origin.
ENV VITE_API_BASE_URL=""
RUN npm run build

# ---------- 3) backend ----------
FROM golang:1.25-alpine AS backend
RUN apk add --no-cache git
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
COPY --from=contract /work/contract/tsp-output ../contract/tsp-output
RUN go run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen \
      -config oapi-codegen.yaml \
      ../contract/tsp-output/@typespec/openapi3/openapi.yaml
ENV CGO_ENABLED=0
RUN go build -ldflags="-s -w" -o /out/calendar-service ./cmd/calendar-service

# ---------- 4) runtime ----------
FROM alpine:3.20
# tzdata is required: the backend calls time.LoadLocation for the seed
# Europe/Moscow settings; alpine ships without timezone data by default.
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=backend  /out/calendar-service ./calendar-service
COPY --from=frontend /work/frontend/dist   ./static
ENV STATIC_DIR=/app/static
ENV PORT=10000
EXPOSE 10000
ENTRYPOINT ["./calendar-service"]
