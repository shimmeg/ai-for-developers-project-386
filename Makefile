.PHONY: help install generate build test lint fmt clean \
        dev dev-mock dev-backend dev-frontend \
        contract-build contract-watch \
        backend-build backend-test backend-lint \
        frontend-build frontend-test frontend-lint \
        test-e2e test-e2e-ui test-e2e-install

# Default goal: print the target list.
help:
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ---------------------------------------------------------------------------
# One-shot dev orchestration
# ---------------------------------------------------------------------------

dev: ## Run contract watcher + backend on :3000 + Vite on :5173 together.
	@trap 'kill 0' EXIT INT TERM; \
	  ( cd contract && npm run watch ) & \
	  ( cd backend  && $(MAKE) --no-print-directory run ) & \
	  ( cd frontend && npm run dev ) & \
	  wait

dev-mock: ## Run contract watcher + Prism mock on :4010 + Vite on :5173 together.
	@cd frontend && npm run dev:full

dev-backend: ## Run only the Go backend (auto-loads backend/.env).
	@$(MAKE) --no-print-directory -C backend run

dev-frontend: ## Run only the Vite dev server.
	@cd frontend && npm run dev

# ---------------------------------------------------------------------------
# Setup / housekeeping
# ---------------------------------------------------------------------------

install: ## Install all workspace dependencies.
	@cd contract && npm ci
	@cd frontend && npm ci
	@cd backend  && go mod download
	@cd e2e      && npm ci

generate: ## Rebuild the OpenAPI YAML, FE types and Go server stubs.
	@cd contract && npm run build
	@cd frontend && npm run gen:api
	@$(MAKE) --no-print-directory -C backend generate

build: ## Build every workspace's release artefact.
	@cd contract && npm run build
	@cd frontend && npm run build
	@cd backend  && $(MAKE) --no-print-directory build

test: ## Run every workspace's tests.
	@cd contract && npm test
	@cd backend  && $(MAKE) --no-print-directory test
	@cd frontend && npm test

lint: ## Run every workspace's linter + repo-wide Prettier.
	@cd backend  && $(MAKE) --no-print-directory lint
	@cd frontend && npm run lint
	@./frontend/node_modules/.bin/prettier --check .

fmt: ## Format every workspace.
	@cd backend  && $(MAKE) --no-print-directory fmt
	@./frontend/node_modules/.bin/prettier --write .

clean: ## Remove generated and build artefacts.
	@rm -rf contract/tsp-output
	@rm -rf frontend/dist
	@rm -f  backend/internal/api/api.gen.go

# ---------------------------------------------------------------------------
# Targeted aliases for CI scripts that need just one workspace
# ---------------------------------------------------------------------------

contract-build: ; @cd contract && npm run build
contract-watch: ; @cd contract && npm run watch

backend-build:  ; @$(MAKE) --no-print-directory -C backend build
backend-test:   ; @$(MAKE) --no-print-directory -C backend test
backend-lint:   ; @$(MAKE) --no-print-directory -C backend lint

frontend-build: ; @cd frontend && npm run build
frontend-test:  ; @cd frontend && npm test
frontend-lint:  ; @cd frontend && npm run lint

# ---------------------------------------------------------------------------
# End-to-end tests
# ---------------------------------------------------------------------------

test-e2e: ## Run Playwright e2e tests headlessly (spawns backend + frontend).
	@cd e2e && npm test

test-e2e-ui: ## Run Playwright in interactive UI mode.
	@cd e2e && npm run test:ui

test-e2e-install: ## One-time: install Playwright + Chromium browser.
	@cd e2e && npm ci && npx playwright install --with-deps chromium
