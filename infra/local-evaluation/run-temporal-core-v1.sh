#!/bin/sh
set -eu

lab_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$lab_dir/../.." && pwd)
compose() { docker compose -f "$lab_dir/compose.yaml" "$@"; }

if [ -n "$(compose ps --all --quiet)" ]; then
  printf '%s\n' 'An orcheval-phase1 lab already exists. Inspect it before running another session.' >&2
  exit 1
fi

docker version --format '{{.Server.Version}}' >/dev/null
compose build evaluation
sdk_image_id=$(docker image inspect orcheval-phase1-sdk:1 --format '{{.Id}}')
run_name="orcheval-core-v1-temporal-$$"
output_dir="$repo_dir/results/core-v1/temporal-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$output_dir"

cleanup() {
  status=$?
  trap - EXIT INT TERM
  compose logs --no-color >"$output_dir/services.log" 2>&1 || true
  docker logs "$run_name" >"$output_dir/evaluation.log" 2>&1 || true
  docker cp "$run_name:/results/." "$output_dir/" >/dev/null 2>&1 || true
  docker rm --force "$run_name" >/dev/null 2>&1 || true
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

compose up -d temporal temporal-worker
compose run --name "$run_name" --no-deps \
  -e "ORCHEVAL_SDK_IMAGE_ID=$sdk_image_id" \
  -e 'ORCHEVAL_CORE_V1=1' \
  -e 'ORCHEVAL_TEMPORAL_RUNNER=node' \
  -e 'ORCHEVAL_TEMPORAL_RUNNER_ARGS=["/opt/orcheval-lab/src/temporal-runner.mjs"]' \
  evaluation sh -c 'cd /workspace && node --experimental-strip-types packages/cli/index.ts run examples/temporal-core-v1.yaml --output /results'
docker cp "$run_name:/results/." "$output_dir/"
docker inspect "$run_name" --format '{{json .Mounts}}' >"$output_dir/mounts.json"
docker version --format '{{json .}}' >"$output_dir/docker-version.json"
printf 'Evidence: %s\n' "$output_dir"
