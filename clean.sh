#!/usr/bin/env bash
set -euo pipefail

SNOW_ARGS="${SNOW_ARGS:---connection demo}"

echo "=========================================="
echo " Product Wheel Schedule Optimization"
echo " CLEAN"
echo "=========================================="

echo ""
echo "[1/4] Dropping notebook..."
snow sql $SNOW_ARGS -q "DROP NOTEBOOK IF EXISTS PRODUCT_WHEEL_OPT.RAW.PRODUCT_WHEEL_OPTIMIZER;" || true

echo ""
echo "[2/4] Stopping and dropping compute pool..."
snow sql $SNOW_ARGS -q "ALTER COMPUTE POOL IF EXISTS PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_POOL STOP ALL;" || true
snow sql $SNOW_ARGS -q "DROP COMPUTE POOL IF EXISTS PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_POOL;" || true

echo ""
echo "[3/4] Dropping external access and network rule..."
snow sql $SNOW_ARGS -q "USE ROLE ACCOUNTADMIN; DROP INTEGRATION IF EXISTS PWO_EXTERNAL_ACCESS;" || true
snow sql $SNOW_ARGS -q "USE ROLE SYSADMIN; DROP NETWORK RULE IF EXISTS PRODUCT_WHEEL_OPT.RAW.PYPI_EGRESS_RULE;" || true

echo ""
echo "[4/4] Dropping database and warehouse..."
snow sql $SNOW_ARGS -q "USE ROLE SYSADMIN; DROP DATABASE IF EXISTS PRODUCT_WHEEL_OPT;"
snow sql $SNOW_ARGS -q "USE ROLE SYSADMIN; DROP WAREHOUSE IF EXISTS PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_WH;"

echo ""
echo "=========================================="
echo " CLEAN COMPLETE"
echo "=========================================="
