#!/bin/sh
set -eu

case "${1:-}" in dbos|bullmq|prefect) ORCHEVAL_PROVIDER=$1; export ORCHEVAL_PROVIDER ;; *) printf '%s\n' 'Usage: run-provider-security-probes.sh dbos|bullmq|prefect' >&2; exit 2 ;; esac
lab_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$lab_dir/../.." && pwd)
compose() { docker compose -f "$lab_dir/providers.compose.yaml" --profile "$ORCHEVAL_PROVIDER" --profile tools "$@"; }
[ -z "$(compose ps --all --quiet)" ] || { printf '%s\n' 'A connector lab already exists.' >&2; exit 1; }
compose build evaluation
run_name="orcheval-security-$ORCHEVAL_PROVIDER-$$"
output_dir="$repo_dir/results/security/$ORCHEVAL_PROVIDER-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$output_dir"
cleanup() { status=$?; trap - EXIT INT TERM; compose logs --no-color >"$output_dir/services.log" 2>&1 || true; docker logs "$run_name" >"$output_dir/evaluation.log" 2>&1 || true; docker cp "$run_name:/results/." "$output_dir/" >/dev/null 2>&1 || true; docker rm --force "$run_name" >/dev/null 2>&1 || true; compose down --volumes --remove-orphans >/dev/null 2>&1 || true; exit "$status"; }
trap cleanup EXIT; trap 'exit 130' INT; trap 'exit 143' TERM
case "$ORCHEVAL_PROVIDER" in dbos) compose up -d database dbos-service ;; bullmq) compose up -d redis bullmq-service ;; prefect) compose build prefect-server; compose up -d prefect-server prefect-service ;; esac
compose run --name "$run_name" --no-deps evaluation node src/service-security-probes.mjs
docker cp "$run_name:/results/." "$output_dir/"
printf 'Evidence: %s\n' "$output_dir"
