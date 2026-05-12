.PHONY: generate build run test test-race lint fmt tidy clean

# Regenerate internal/api/api.gen.go from the TypeSpec contract.
generate:
	@cd ../contract && npm run build
	go run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen \
	  -config oapi-codegen.yaml \
	  ../contract/tsp-output/@typespec/openapi3/openapi.yaml

build:
	go build ./...

run:
	go run ./cmd/calendar-service

test:
	go test ./... -count=1

test-race:
	go test ./... -count=1 -race

lint:
	golangci-lint run

fmt:
	gofmt -w .

tidy:
	go mod tidy

clean:
	rm -f internal/api/api.gen.go
