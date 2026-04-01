#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE_NAME="product-wheel-react"
CONTAINER_NAME="product-wheel-react-app"

echo "=== Building Docker image ==="
docker build -t "$IMAGE_NAME" "$SCRIPT_DIR"

echo "=== Stopping existing container (if any) ==="
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

echo "=== Starting container ==="
docker run -d \
  --name "$CONTAINER_NAME" \
  -p 5172:5172 \
  -v "$HOME/.snowflake:/root/.snowflake:ro" \
  -v "$HOME/.ssh:/root/.ssh:ro" \
  -e SNOWFLAKE_CONNECTION_NAME="${SNOWFLAKE_CONNECTION_NAME:-demo}" \
  "$IMAGE_NAME"

echo ""
echo "App running at http://localhost:5172"
echo "Logs: docker logs -f $CONTAINER_NAME"
