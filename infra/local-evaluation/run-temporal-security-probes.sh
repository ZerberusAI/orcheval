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
run_name="orcheval-temporal-security-$$"
output_dir="$repo_dir/results/security/temporal-$(date -u +%Y%m%dT%H%M%SZ)-$$"
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
compose run --name "$run_name" --no-deps evaluation node src/temporal-security-probes.mjs
docker cp "$run_name:/results/." "$output_dir/"
printf 'Evidence: %s\n' "$output_dir"
