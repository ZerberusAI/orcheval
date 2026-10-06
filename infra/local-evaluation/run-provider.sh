#!/bin/sh
set -eu

case "${1:-}" in
  hatchet|windmill|restate|dbos|bullmq|kestra) ORCHEVAL_PROVIDER=$1; export ORCHEVAL_PROVIDER ;;
  *) printf '%s\n' 'Usage: run-provider.sh hatchet|windmill|restate|dbos|bullmq|kestra' >&2; exit 2 ;;
esac
lab_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$lab_dir/../.." && pwd)
compose() { docker compose -f "$lab_dir/providers.compose.yaml" --profile "$ORCHEVAL_PROVIDER" --profile tools "$@"; }

docker version --format '{{.Server.Version}}' >/dev/null
if [ -n "$(compose ps --all --quiet)" ] || docker volume inspect orcheval-connectors_connector-state >/dev/null 2>&1; then
  printf '%s\n' 'An orcheval-connectors lab already exists. Inspect it before starting another session.' >&2
  exit 1
fi
compose build evaluation
sdk_image_id=$(docker image inspect orcheval-connectors-sdk:1 --format '{{.Id}}')
run_name="orcheval-connectors-evaluation-$$"
output_dir="$repo_dir/results/local-docker/$ORCHEVAL_PROVIDER-$(date -u +%Y%m%dT%H%M%SZ)-$$"
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

if [ "$ORCHEVAL_PROVIDER" = hatchet ]; then
  compose up -d database hatchet hatchet-worker
elif [ "$ORCHEVAL_PROVIDER" = restate ]; then
  compose up -d restate restate-service
elif [ "$ORCHEVAL_PROVIDER" = dbos ]; then
  compose up -d database dbos-service
elif [ "$ORCHEVAL_PROVIDER" = bullmq ]; then
  compose up -d redis bullmq-service
elif [ "$ORCHEVAL_PROVIDER" = kestra ]; then
  compose up -d kestra
else
  compose up -d database windmill
fi
compose run --name "$run_name" --no-deps -e "ORCHEVAL_SDK_IMAGE_ID=$sdk_image_id" evaluation
docker cp "$run_name:/results/." "$output_dir/"
docker inspect "$run_name" --format '{{json .Mounts}}' >"$output_dir/mounts.json"
docker version --format '{{json .}}' >"$output_dir/docker-version.json"
printf 'Evidence: %s\n' "$output_dir"
