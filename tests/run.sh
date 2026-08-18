#!/usr/bin/env bash
# Runs the whole suite against a throwaway XDG root, so nothing here can touch
# your real gtk.css, icons, or settings.
set -u

cd "$(dirname "$0")"

SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/mac-test-sandbox.XXXXXX")"
trap 'rm -rf "$SANDBOX"' EXIT

export XDG_CONFIG_HOME="$SANDBOX/config"
export XDG_DATA_HOME="$SANDBOX/data"
export XDG_CACHE_HOME="$SANDBOX/cache"
TEST_SYSTEM_DATA_DIRS="${XDG_DATA_DIRS:-/usr/local/share:/usr/share}"
export XDG_DATA_DIRS="$SANDBOX/system-data:$TEST_SYSTEM_DATA_DIRS"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" \
    "$SANDBOX/system-data"

if ! command -v gjs >/dev/null 2>&1; then
    echo "gjs not found; install gjs to run the tests" >&2
    exit 1
fi

failed=0
for test in test-colors.js test-cssgen.js test-gtkexport.js test-folders.js; do
    echo "── $test"
    if ! gjs -m "$test"; then
        failed=$((failed + 1))
    fi
    echo
done

if [ "$failed" -ne 0 ]; then
    echo "$failed suite(s) failed"
    exit 1
fi

echo "all suites passed"
