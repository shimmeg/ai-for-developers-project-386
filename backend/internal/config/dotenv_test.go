package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/config"
)

func TestLoadDotEnv_MissingFileIsNotAnError(t *testing.T) {
	t.Parallel()
	assert.NoError(t, config.LoadDotEnv(filepath.Join(t.TempDir(), "does-not-exist")))
}

func TestLoadDotEnv_SetsUnsetKeys(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".env")
	contents := "# comment line\n" +
		"FOO=bar\n" +
		"BAZ=\"quoted value\"\n" +
		"SINGLE='single quoted'\n" +
		"\n" +
		"EMPTY=\n"
	require.NoError(t, os.WriteFile(path, []byte(contents), 0o600))

	for _, k := range []string{"FOO", "BAZ", "SINGLE", "EMPTY"} {
		require.NoError(t, os.Unsetenv(k))
	}
	t.Cleanup(func() {
		for _, k := range []string{"FOO", "BAZ", "SINGLE", "EMPTY"} {
			_ = os.Unsetenv(k)
		}
	})

	require.NoError(t, config.LoadDotEnv(path))
	assert.Equal(t, "bar", os.Getenv("FOO"))
	assert.Equal(t, "quoted value", os.Getenv("BAZ"))
	assert.Equal(t, "single quoted", os.Getenv("SINGLE"))
	v, ok := os.LookupEnv("EMPTY")
	assert.True(t, ok)
	assert.Equal(t, "", v)
}

func TestLoadDotEnv_DoesNotOverrideProcessEnv(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".env")
	require.NoError(t, os.WriteFile(path, []byte("ADMIN_TOKEN=from-file\n"), 0o600))

	require.NoError(t, os.Setenv("ADMIN_TOKEN", "from-process"))
	t.Cleanup(func() { _ = os.Unsetenv("ADMIN_TOKEN") })

	require.NoError(t, config.LoadDotEnv(path))
	assert.Equal(t, "from-process", os.Getenv("ADMIN_TOKEN"))
}

func TestLoadDotEnv_RejectsMalformedLines(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".env")
	require.NoError(t, os.WriteFile(path, []byte("missing-equals\n"), 0o600))
	assert.Error(t, config.LoadDotEnv(path))
}
