#!/usr/bin/env bash
set -euo pipefail

ACCOUNT="${SNOWFLAKE_ACCOUNT:-sfsenorthamerica-trsmith_aws1}"
DB="PRODUCT_WHEEL_OPT"
SCHEMA="RAW"
REPO="IMAGE_REPO"
IMAGE_NAME="product-wheel-react"
SERVICE_NAME="PRODUCT_WHEEL_REACT_SERVICE"
POOL="PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_POOL"
WH="PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_WH"

REGISTRY="${ACCOUNT}.registry.snowflakecomputing.com"
FULL_IMAGE="${REGISTRY}/${DB}/${SCHEMA}/${REPO}/${IMAGE_NAME}:latest"

echo "=== Building Docker image ==="
docker build -t "$IMAGE_NAME" "$(dirname "$0")/.."

echo "=== Tagging for Snowflake registry ==="
docker tag "$IMAGE_NAME" "$FULL_IMAGE"

echo "=== Logging into Snowflake registry ==="
docker login "$REGISTRY" -u "\$SNOWFLAKE_USER"

echo "=== Pushing image ==="
docker push "$FULL_IMAGE"

echo "=== Creating/replacing SPCS service ==="
snow sql -q "
CREATE OR REPLACE SERVICE ${DB}.${SCHEMA}.${SERVICE_NAME}
  IN COMPUTE POOL ${POOL}
  FROM @${DB}.${SCHEMA}.VOLUMES
  SPECIFICATION_FILE = 'service_spec.yaml'
  EXTERNAL_ACCESS_INTEGRATIONS = (PWO_EXTERNAL_ACCESS)
  MIN_INSTANCES = 1
  MAX_INSTANCES = 1;
"

echo "=== Checking service status ==="
snow sql -q "SELECT SYSTEM\$GET_SERVICE_STATUS('${DB}.${SCHEMA}.${SERVICE_NAME}')"

echo ""
echo "Done! Service is deploying."
echo "Check status: CALL SYSTEM\$GET_SERVICE_STATUS('${DB}.${SCHEMA}.${SERVICE_NAME}')"
