#!/bin/bash

cd "$(cd -P -- "$(dirname -- "$0")" && pwd -P)" || exit 2

# We dont care about return code here
# shellcheck disable=SC2155
export PATH="$(pwd)/bin:$(pwd)/pgsql/bin:$(pwd)/node_modules/.bin:$(pwd)/public_src/node_modules/.bin:$PATH"
# We dont care about return code here
# shellcheck disable=SC2155
export LD_LIBRARY_PATH="$(pwd)/pgsql/lib:$LD_LIBRARY_PATH"