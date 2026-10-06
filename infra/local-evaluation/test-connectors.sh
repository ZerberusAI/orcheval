#!/bin/sh
set -eu
lab_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
docker build -f "$lab_dir/Dockerfile.connectors" -t orcheval-connectors-sdk:1 "$lab_dir"
docker run --rm --network none \
  --mount "type=bind,source=$lab_dir,target=/opt/orcheval-lab/src,readonly" \
  orcheval-connectors-sdk:1 node --test src/connectors.test.mjs
