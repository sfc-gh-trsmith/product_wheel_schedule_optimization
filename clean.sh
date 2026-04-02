#!/usr/bin/env bash
set -euo pipefail

SNOW_ARGS="${SNOW_ARGS:---connection demo}"

echo "=========================================="
echo " Product Wheel Schedule Optimization"
echo " CLEAN"
echo "=========================================="

echo ""
echo "[1/7] Dropping Cortex Agent..."
snow sql $SNOW_ARGS -q "DROP CORTEX AGENT IF EXISTS PRODUCT_WHEEL_OPT.DATA_MART.PRODUCT_WHEEL_AGENT;" || true

echo ""
echo "[2/7] Dropping Cortex Search Service..."
snow sql $SNOW_ARGS -q "DROP CORTEX SEARCH SERVICE IF EXISTS PRODUCT_WHEEL_OPT.RAW.CONTRACT_MFG_SEARCH_SERVICE;" || true

echo ""
echo "[3/7] Dropping Semantic Views..."
snow sql $SNOW_ARGS -q "DROP SEMANTIC VIEW IF EXISTS PRODUCT_WHEEL_OPT.DATA_MART.SCHEDULE_ANALYST_VIEW;" || true
snow sql $SNOW_ARGS -q "DROP SEMANTIC VIEW IF EXISTS PRODUCT_WHEEL_OPT.DATA_MART.DEMAND_ANALYST_VIEW;" || true
snow sql $SNOW_ARGS -q "DROP SEMANTIC VIEW IF EXISTS PRODUCT_WHEEL_OPT.DATA_MART.INVENTORY_ANALYST_VIEW;" || true
snow sql $SNOW_ARGS -q "DROP SEMANTIC VIEW IF EXISTS PRODUCT_WHEEL_OPT.DATA_MART.CONTRACT_ANALYST_VIEW;" || true
snow sql $SNOW_ARGS -q "DROP SEMANTIC VIEW IF EXISTS PRODUCT_WHEEL_OPT.DATA_MART.CHANGEOVER_ANALYST_VIEW;" || true

echo ""
echo "[4/7] Dropping solver stored procedure..."
snow sql $SNOW_ARGS -q "DROP PROCEDURE IF EXISTS PRODUCT_WHEEL_OPT.DATA_MART.SOLVE_LINE_SP(VARCHAR, INTEGER, VARCHAR, INTEGER, INTEGER, INTEGER, FLOAT, FLOAT, FLOAT, FLOAT, FLOAT, VARCHAR, FLOAT, FLOAT, INTEGER);" || true

echo ""
echo "[5/7] Dropping notebook..."
snow sql $SNOW_ARGS -q "DROP NOTEBOOK IF EXISTS PRODUCT_WHEEL_OPT.RAW.PRODUCT_WHEEL_OPTIMIZER;" || true

echo ""
echo "[6/7] Stopping and dropping compute pool..."
snow sql $SNOW_ARGS -q "ALTER COMPUTE POOL IF EXISTS PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_POOL STOP ALL;" || true
snow sql $SNOW_ARGS -q "DROP COMPUTE POOL IF EXISTS PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_POOL;" || true

echo ""
echo "[6.5/7] Dropping external access and network rule..."
snow sql $SNOW_ARGS -q "USE ROLE ACCOUNTADMIN; DROP INTEGRATION IF EXISTS PWO_EXTERNAL_ACCESS;" || true
snow sql $SNOW_ARGS -q "USE ROLE SYSADMIN; DROP NETWORK RULE IF EXISTS PRODUCT_WHEEL_OPT.RAW.PYPI_EGRESS_RULE;" || true

echo ""
echo "[7/7] Dropping database and warehouse..."
snow sql $SNOW_ARGS -q "USE ROLE SYSADMIN; DROP DATABASE IF EXISTS PRODUCT_WHEEL_OPT;"
snow sql $SNOW_ARGS -q "USE ROLE SYSADMIN; DROP WAREHOUSE IF EXISTS PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_WH;"

echo ""
echo "=========================================="
echo " CLEAN COMPLETE"
echo "=========================================="
