#!/usr/bin/env bash
set -euo pipefail

SNOW_ARGS="${SNOW_ARGS:---connection demo}"
MODE="${1:-validate}"

echo "=========================================="
echo " Product Wheel Schedule Optimization"
echo " RUN (mode: ${MODE})"
echo "=========================================="

if [ "$MODE" = "main" ]; then

    echo ""
    echo "[1/3] Executing notebook (GPU optimization)..."
    snow sql $SNOW_ARGS -q "
    USE ROLE SYSADMIN;
    USE WAREHOUSE PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_WH;
    EXECUTE NOTEBOOK PRODUCT_WHEEL_OPT.RAW.PRODUCT_WHEEL_OPTIMIZER();
    "

    echo ""
    echo "[2/3] Verifying DATA_MART output..."
    snow sql $SNOW_ARGS -q "SELECT COUNT(*) AS SCHEDULE_ROWS FROM PRODUCT_WHEEL_OPT.DATA_MART.FACT_LINE_SCHEDULE_OPTIMIZED;"
    snow sql $SNOW_ARGS -q "SELECT COUNT(*) AS KPI_ROWS FROM PRODUCT_WHEEL_OPT.DATA_MART.FACT_SERVICE_AND_SCHEDULE_KPI;"
    snow sql $SNOW_ARGS -q "SELECT COUNT(*) AS ENRICHED_ROWS FROM PRODUCT_WHEEL_OPT.DATA_MART.FACT_DEMAND_FORECAST_ENRICHED;"

    echo ""
    echo "[3/3] Sample optimized schedule..."
    snow sql $SNOW_ARGS -q "
    SELECT LINE_ID, TIME_SLOT_START, TIME_SLOT_END, PRODUCT_ID, PLANNED_QTY
    FROM PRODUCT_WHEEL_OPT.DATA_MART.FACT_LINE_SCHEDULE_OPTIMIZED
    ORDER BY LINE_ID, TIME_SLOT_START
    LIMIT 10;
    "

elif [ "$MODE" = "validate" ]; then

    echo ""
    echo "Checking table row counts..."
    snow sql $SNOW_ARGS -q "
    SELECT TABLE_SCHEMA, TABLE_NAME, ROW_COUNT
    FROM PRODUCT_WHEEL_OPT.INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_SCHEMA, TABLE_NAME;
    "

    echo ""
    echo "Verifying key dimension data..."
    snow sql $SNOW_ARGS -q "SELECT COUNT(*) AS PLANT_COUNT FROM PRODUCT_WHEEL_OPT.ATOMIC.DIM_PLANT;"
    snow sql $SNOW_ARGS -q "SELECT COUNT(*) AS LINE_COUNT FROM PRODUCT_WHEEL_OPT.ATOMIC.DIM_PRODUCTION_LINE;"
    snow sql $SNOW_ARGS -q "SELECT COUNT(*) AS PRODUCT_COUNT FROM PRODUCT_WHEEL_OPT.ATOMIC.DIM_PRODUCT;"
    snow sql $SNOW_ARGS -q "SELECT COUNT(*) AS CUSTOMER_COUNT FROM PRODUCT_WHEEL_OPT.ATOMIC.DIM_CUSTOMER;"
    snow sql $SNOW_ARGS -q "SELECT COUNT(*) AS FORMULATION_COUNT FROM PRODUCT_WHEEL_OPT.ATOMIC.DIM_FORMULATION;"

    echo ""
    echo "Verifying key fact data..."
    snow sql $SNOW_ARGS -q "SELECT COUNT(*) AS DEMAND_ROWS FROM PRODUCT_WHEEL_OPT.ATOMIC.FACT_DEMAND_FORECAST;"
    snow sql $SNOW_ARGS -q "SELECT COUNT(*) AS CALENDAR_ROWS FROM PRODUCT_WHEEL_OPT.ATOMIC.FACT_LINE_CALENDAR;"
    snow sql $SNOW_ARGS -q "SELECT COUNT(*) AS THROUGHPUT_ROWS FROM PRODUCT_WHEEL_OPT.ATOMIC.FACT_LINE_PRODUCT_THROUGHPUT;"
    snow sql $SNOW_ARGS -q "SELECT COUNT(*) AS CHANGEOVER_ROWS FROM PRODUCT_WHEEL_OPT.ATOMIC.FACT_LINE_PRODUCT_CHANGEOVER;"
    snow sql $SNOW_ARGS -q "SELECT COUNT(*) AS INVENTORY_ROWS FROM PRODUCT_WHEEL_OPT.ATOMIC.FACT_INVENTORY_POSITION;"

    echo ""
    echo "Checking AI-generated descriptions..."
    snow sql $SNOW_ARGS -q "SELECT PRODUCT_ID, PRODUCT_DESCRIPTION FROM PRODUCT_WHEEL_OPT.ATOMIC.DIM_PRODUCT LIMIT 3;"

    echo ""
    echo "Compute pool status:"
    snow sql $SNOW_ARGS -q "DESCRIBE COMPUTE POOL PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_POOL;"

    echo ""
    echo "Notebook status:"
    snow sql $SNOW_ARGS -q "DESCRIBE NOTEBOOK PRODUCT_WHEEL_OPT.RAW.PRODUCT_WHEEL_OPTIMIZER;"

else
    echo "Usage: run.sh [main|validate]"
    echo "  main     - Execute the optimization notebook and verify results"
    echo "  validate - Check deployment status and row counts (default)"
    exit 1
fi

echo ""
echo "=========================================="
echo " RUN COMPLETE (${MODE})"
echo "=========================================="
