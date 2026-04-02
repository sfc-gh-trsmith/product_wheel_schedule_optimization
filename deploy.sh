#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

ONLY_COMPONENT=""
SNOW_ARGS=()
HAS_CONNECTION=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --only-sql) ONLY_COMPONENT="sql"; shift ;;
        --only-streamlit) ONLY_COMPONENT="streamlit"; shift ;;
        --only-notebook) ONLY_COMPONENT="notebook"; shift ;;
        --only-cortex) ONLY_COMPONENT="cortex"; shift ;;
        -c|--connection) HAS_CONNECTION=true; SNOW_ARGS+=("$1" "$2"); shift 2 ;;
        *) SNOW_ARGS+=("$1"); shift ;;
    esac
done

if [ "$HAS_CONNECTION" = false ]; then
    SNOW_ARGS+=("-c" "demo")
fi

should_run_step() {
    local step_name="$1"
    [ -z "$ONLY_COMPONENT" ] && return 0
    [[ "$step_name" == "$ONLY_COMPONENT" ]]
}

echo "=========================================="
echo " Product Wheel Schedule Optimization"
echo " DEPLOY"
echo "=========================================="

if should_run_step "sql"; then
    echo ""
    echo "[1/6] Setting up database, warehouse, schemas, and tables..."
    snow sql -f "${PROJECT_DIR}/sql/01_setup.sql" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"

    echo ""
    echo "[2/6] Creating data generation stored procedure and seeding data..."
    snow sql -f "${PROJECT_DIR}/sql/02_seed_data.sql" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
    echo "  Running SP_GENERATE_ALL_DATA()..."
    snow sql -q "USE ROLE SYSADMIN; USE WAREHOUSE PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_WH; CALL PRODUCT_WHEEL_OPT.ATOMIC.SP_GENERATE_ALL_DATA();" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"

    echo ""
    echo "[2.5/6] Uploading PuLP wheel and creating solver stored procedure..."
    snow sql -q "USE ROLE SYSADMIN; PUT file://${PROJECT_DIR}/streamlit/PuLP-2.9.0-py3-none-any.whl @PRODUCT_WHEEL_OPT.RAW.DATA_STAGE/libs/ AUTO_COMPRESS=FALSE OVERWRITE=TRUE;" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
    snow sql -f "${PROJECT_DIR}/sql/05_solve_line_sp.sql" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
fi

if should_run_step "sql" || should_run_step "notebook"; then
    echo ""
    echo "[3/6] Creating GPU compute pool and external access..."
    snow sql -q "USE ROLE SYSADMIN; GRANT CREATE COMPUTE POOL ON ACCOUNT TO ROLE SYSADMIN;" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}" || true
    snow sql -f "${PROJECT_DIR}/sql/03_gpu_infra.sql" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
fi

if should_run_step "notebook"; then
    echo ""
    echo "[4/6] Uploading notebook and creating Snowflake notebook..."
    snow sql -q "USE ROLE SYSADMIN; USE WAREHOUSE PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_WH; PUT file://${PROJECT_DIR}/notebooks/product_wheel_optimizer.ipynb @PRODUCT_WHEEL_OPT.RAW.DATA_STAGE/notebooks/ AUTO_COMPRESS=FALSE OVERWRITE=TRUE;" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
    snow sql -q "
USE ROLE SYSADMIN;
CREATE OR REPLACE NOTEBOOK PRODUCT_WHEEL_OPT.RAW.PRODUCT_WHEEL_OPTIMIZER
    FROM '@PRODUCT_WHEEL_OPT.RAW.DATA_STAGE/notebooks'
    MAIN_FILE = 'product_wheel_optimizer.ipynb'
    RUNTIME_NAME = 'SYSTEM\$GPU_RUNTIME'
    COMPUTE_POOL = 'PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_POOL'
    QUERY_WAREHOUSE = PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_WH
    EXTERNAL_ACCESS_INTEGRATIONS = (PWO_EXTERNAL_ACCESS)
    IDLE_AUTO_SHUTDOWN_TIME_SECONDS = 1800;
" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
    snow sql -q "ALTER NOTEBOOK PRODUCT_WHEEL_OPT.RAW.PRODUCT_WHEEL_OPTIMIZER ADD LIVE VERSION FROM LAST;" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
fi

if should_run_step "sql" || should_run_step "cortex"; then
    echo ""
    echo "[4.5/6] Deploying Cortex services (search, semantic views, notes, agent)..."

    echo "  Uploading process documents to stage..."
    snow sql -q "USE ROLE SYSADMIN; USE WAREHOUSE PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_WH; USE DATABASE PRODUCT_WHEEL_OPT; USE SCHEMA RAW;" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
    snow sql -q "CREATE STAGE IF NOT EXISTS PRODUCT_WHEEL_OPT.RAW.PROCESS_DOCS DIRECTORY = (ENABLE = TRUE) ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE');" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
    for f in "${PROJECT_DIR}"/docs/process/*.md; do
        [ -f "$f" ] && snow sql -q "PUT file://${f} @PRODUCT_WHEEL_OPT.RAW.PROCESS_DOCS/ AUTO_COMPRESS=FALSE OVERWRITE=TRUE;" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
    done
    snow sql -q "ALTER STAGE PRODUCT_WHEEL_OPT.RAW.PROCESS_DOCS REFRESH;" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"

    echo "  Setting up Cortex Search..."
    snow sql -f "${PROJECT_DIR}/sql/06_cortex_search.sql" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
    echo "  Running document chunker..."
    snow sql -q "USE ROLE SYSADMIN; USE WAREHOUSE PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_WH; CALL PRODUCT_WHEEL_OPT.RAW.CHUNK_PROCESS_DOCS();" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}" || true

    echo "  Uploading semantic models to stage..."
    snow sql -q "CREATE STAGE IF NOT EXISTS PRODUCT_WHEEL_OPT.RAW.SEMANTIC_MODELS DIRECTORY = (ENABLE = TRUE) ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE');" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
    for f in "${PROJECT_DIR}"/semantic_models/*.yaml; do
        [ -f "$f" ] && snow sql -q "PUT file://${f} @PRODUCT_WHEEL_OPT.RAW.SEMANTIC_MODELS/ AUTO_COMPRESS=FALSE OVERWRITE=TRUE;" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
    done
    echo "  Creating semantic views..."
    snow sql -f "${PROJECT_DIR}/sql/07_semantic_views.sql" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}" || true

    echo "  Creating notes table and UDF..."
    snow sql -f "${PROJECT_DIR}/sql/08_notes.sql" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"

    echo "  Creating Cortex Agent..."
    snow sql -f "${PROJECT_DIR}/sql/09_cortex_agent.sql" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}" || true
fi

if should_run_step "streamlit"; then
    echo ""
    echo "[5/6] Deploying Streamlit app..."
    find "${PROJECT_DIR}/streamlit" -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
    rm -rf "${PROJECT_DIR}/streamlit/output" 2>/dev/null || true

    STREAMLIT_DIR="${PROJECT_DIR}/streamlit"
    STAGE_PATH="@PRODUCT_WHEEL_OPT.RAW.streamlit/PRODUCT_WHEEL_APP"

    echo "  Uploading files to stage..."
    snow sql -q "CREATE STAGE IF NOT EXISTS PRODUCT_WHEEL_OPT.RAW.streamlit ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE');" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
    snow sql -q "REMOVE ${STAGE_PATH}/;" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}" || true

    snow sql -q "PUT file://${STREAMLIT_DIR}/streamlit_app.py ${STAGE_PATH}/ AUTO_COMPRESS=FALSE OVERWRITE=TRUE;" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
    snow sql -q "PUT file://${STREAMLIT_DIR}/environment.yml ${STAGE_PATH}/ AUTO_COMPRESS=FALSE OVERWRITE=TRUE;" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
    snow sql -q "PUT file://${STREAMLIT_DIR}/PuLP-2.9.0-py3-none-any.whl ${STAGE_PATH}/ AUTO_COMPRESS=FALSE OVERWRITE=TRUE;" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
    snow sql -q "PUT file://${STREAMLIT_DIR}/pages/*.py ${STAGE_PATH}/pages/ AUTO_COMPRESS=FALSE OVERWRITE=TRUE;" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
    snow sql -q "PUT file://${STREAMLIT_DIR}/utils/*.py ${STAGE_PATH}/utils/ AUTO_COMPRESS=FALSE OVERWRITE=TRUE;" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"

    echo "  Creating Streamlit object..."
    snow sql -q "
USE ROLE SYSADMIN;
CREATE OR REPLACE STREAMLIT PRODUCT_WHEEL_OPT.RAW.PRODUCT_WHEEL_APP
    ROOT_LOCATION = '${STAGE_PATH}'
    MAIN_FILE = 'streamlit_app.py'
    QUERY_WAREHOUSE = PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_WH
    TITLE = 'Product Wheel Schedule Optimization';
" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
fi

echo ""
echo "=========================================="
echo " DEPLOY COMPLETE"
echo "=========================================="

if should_run_step "sql"; then
    echo ""
    echo "Row counts:"
    snow sql -q "
SELECT TABLE_SCHEMA, TABLE_NAME, ROW_COUNT
FROM PRODUCT_WHEEL_OPT.INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_SCHEMA, TABLE_NAME;
" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
fi

if should_run_step "notebook"; then
    echo ""
    echo "Notebook:"
    snow sql -q "DESCRIBE NOTEBOOK PRODUCT_WHEEL_OPT.RAW.PRODUCT_WHEEL_OPTIMIZER;" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
    echo ""
    echo "Compute pool:"
    snow sql -q "DESCRIBE COMPUTE POOL PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_POOL;" "${SNOW_ARGS[@]+${SNOW_ARGS[@]}}"
fi
