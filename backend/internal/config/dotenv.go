package config

import (
	"bufio"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"strings"
)

// LoadDotEnv reads simple KEY=VALUE lines from path and sets each key in the
// process environment iff it is not already set. Lines may be blank or
// start with '#' (comments). Values may be surrounded by matching single or
// double quotes, which are stripped.
//
// A missing file is NOT an error: dev workflows call this to populate env
// from backend/.env on first boot, but production deployments set env vars
// directly and the file is absent.
//
// This is deliberately a tiny, dep-free loader. It does NOT support escape
// sequences, variable expansion, or multi-line values — anything fancy
// should be set via real environment variables.
func LoadDotEnv(path string) error {
	f, err := os.Open(path) // #nosec G304 -- caller supplies the path.
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		return err
	}
	defer func() { _ = f.Close() }()

	scanner := bufio.NewScanner(f)
	lineNo := 0
	for scanner.Scan() {
		lineNo++
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		eq := strings.IndexByte(line, '=')
		if eq < 0 {
			return fmt.Errorf("%s:%d: missing '=' in env line", path, lineNo)
		}
		key := strings.TrimSpace(line[:eq])
		if key == "" {
			return fmt.Errorf("%s:%d: empty key", path, lineNo)
		}
		val := strings.TrimSpace(line[eq+1:])
		if len(val) >= 2 {
			first, last := val[0], val[len(val)-1]
			if (first == '"' && last == '"') || (first == '\'' && last == '\'') {
				val = val[1 : len(val)-1]
			}
		}
		if _, isSet := os.LookupEnv(key); !isSet {
			if err := os.Setenv(key, val); err != nil {
				return fmt.Errorf("%s:%d: %w", path, lineNo, err)
			}
		}
	}
	return scanner.Err()
}
