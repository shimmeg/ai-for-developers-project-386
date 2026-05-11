//go:build tools

// Package tools pins build-time dependencies (oapi-codegen) so `go mod tidy`
// keeps them in go.sum. This file is not compiled into the binary.
package tools

import _ "github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen"
