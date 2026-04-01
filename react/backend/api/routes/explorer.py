from fastapi import APIRouter
from ..database import query, ATOMIC

router = APIRouter()


@router.get("/demand-landscape")
def demand_landscape():
    return query(f"""
    SELECT c.CUSTOMER_NAME, p.PRODUCT_FAMILY, SUM(d.FORECAST_QTY) AS TOTAL_FORECAST_QTY
    FROM {ATOMIC}.FACT_DEMAND_FORECAST d
    JOIN {ATOMIC}.DIM_PRODUCT p ON d.PRODUCT_ID = p.PRODUCT_ID
    JOIN {ATOMIC}.DIM_CUSTOMER c ON d.CUSTOMER_ID = c.CUSTOMER_ID
    GROUP BY c.CUSTOMER_NAME, p.PRODUCT_FAMILY
    ORDER BY c.CUSTOMER_NAME, p.PRODUCT_FAMILY
    """)


@router.get("/demand-timeseries")
def demand_timeseries():
    rows = query(f"""
    SELECT d.FORECAST_WEEK_START, p.PRODUCT_FAMILY, SUM(d.FORECAST_QTY) AS FORECAST_QTY
    FROM {ATOMIC}.FACT_DEMAND_FORECAST d
    JOIN {ATOMIC}.DIM_PRODUCT p ON d.PRODUCT_ID = p.PRODUCT_ID
    GROUP BY d.FORECAST_WEEK_START, p.PRODUCT_FAMILY
    ORDER BY d.FORECAST_WEEK_START, p.PRODUCT_FAMILY
    """)
    for r in rows:
        r["forecast_week_start"] = str(r["forecast_week_start"])
    return rows


@router.get("/lines")
def line_capabilities():
    return query(f"""
    SELECT l.LINE_ID, l.LINE_CODE, l.LINE_NAME, l.LINE_TYPE,
           l.IS_ALLERGEN_DEDICATED_FLAG, p.PLANT_NAME,
           COUNT(DISTINCT t.PRODUCT_ID) AS PRODUCT_COUNT,
           AVG(t.RUN_RATE_UNITS_PER_HOUR) AS AVG_RUN_RATE,
           MIN(t.RUN_RATE_UNITS_PER_HOUR) AS MIN_RUN_RATE,
           MAX(t.RUN_RATE_UNITS_PER_HOUR) AS MAX_RUN_RATE
    FROM {ATOMIC}.DIM_PRODUCTION_LINE l
    JOIN {ATOMIC}.DIM_PLANT p ON l.PLANT_ID = p.PLANT_ID
    LEFT JOIN {ATOMIC}.FACT_LINE_PRODUCT_THROUGHPUT t ON l.LINE_ID = t.LINE_ID
    GROUP BY l.LINE_ID, l.LINE_CODE, l.LINE_NAME, l.LINE_TYPE,
             l.IS_ALLERGEN_DEDICATED_FLAG, p.PLANT_NAME
    ORDER BY p.PLANT_NAME, l.LINE_CODE
    """)


@router.get("/throughput")
def throughput_detail():
    return query(f"""
    SELECT l.LINE_CODE, t.RUN_RATE_UNITS_PER_HOUR
    FROM {ATOMIC}.FACT_LINE_PRODUCT_THROUGHPUT t
    JOIN {ATOMIC}.DIM_PRODUCTION_LINE l ON t.LINE_ID = l.LINE_ID
    """)


@router.get("/calendar")
def calendar_grid():
    rows = query(f"""
    SELECT l.LINE_CODE, DATE(c.TIME_SLOT_START) AS SLOT_DATE,
           c.CALENDAR_STATUS, COUNT(*) AS SLOT_COUNT
    FROM {ATOMIC}.FACT_LINE_CALENDAR c
    JOIN {ATOMIC}.DIM_PRODUCTION_LINE l ON c.LINE_ID = l.LINE_ID
    GROUP BY l.LINE_CODE, DATE(c.TIME_SLOT_START), c.CALENDAR_STATUS
    ORDER BY l.LINE_CODE, SLOT_DATE
    """)
    status_map = {"available": 1, "maintenance": 0.5, "holiday": 0}
    for r in rows:
        r["slot_date"] = str(r["slot_date"])
        r["status_num"] = status_map.get(r.get("calendar_status", ""), 0)
    return rows


@router.get("/changeover")
def changeover_matrix(line_id: int):
    return query(f"""
    SELECT co.LINE_ID, l.LINE_CODE,
           pf.PRODUCT_CODE AS FROM_PRODUCT, pt.PRODUCT_CODE AS TO_PRODUCT,
           co.CHANGEOVER_TIME_HOURS, co.CHANGEOVER_COST
    FROM {ATOMIC}.FACT_LINE_PRODUCT_CHANGEOVER co
    JOIN {ATOMIC}.DIM_PRODUCTION_LINE l ON co.LINE_ID = l.LINE_ID
    JOIN {ATOMIC}.DIM_PRODUCT pf ON co.FROM_PRODUCT_ID = pf.PRODUCT_ID
    JOIN {ATOMIC}.DIM_PRODUCT pt ON co.TO_PRODUCT_ID = pt.PRODUCT_ID
    WHERE co.LINE_ID = {line_id}
    ORDER BY pf.PRODUCT_CODE, pt.PRODUCT_CODE
    """)


@router.get("/inventory")
def inventory_snapshot():
    return query(f"""
    SELECT p.PRODUCT_ID, p.PRODUCT_CODE, p.PRODUCT_FAMILY,
           pl.PLANT_NAME,
           i.ON_HAND_QTY, i.SAFETY_STOCK_QTY, i.ON_ORDER_QTY,
           i.SNAPSHOT_TIMESTAMP
    FROM {ATOMIC}.FACT_INVENTORY_POSITION i
    JOIN {ATOMIC}.DIM_PRODUCT p ON i.PRODUCT_ID = p.PRODUCT_ID
    JOIN {ATOMIC}.DIM_PLANT pl ON i.PLANT_ID = pl.PLANT_ID
    QUALIFY ROW_NUMBER() OVER (PARTITION BY i.PRODUCT_ID, i.PLANT_ID ORDER BY i.SNAPSHOT_TIMESTAMP DESC) = 1
    ORDER BY p.PRODUCT_FAMILY, p.PRODUCT_CODE
    """)


@router.get("/contracts")
def contracts():
    return query(f"""
    SELECT fc.CONTRACT_ID, fc.CUSTOMER_ID, c.CUSTOMER_NAME, c.CUSTOMER_SEGMENT,
           fc.CONTRACT_START_DATE, fc.CONTRACT_END_DATE,
           fc.SERVICE_LEVEL_TARGET_FILL_RATE, fc.MAX_DAYS_OF_SUPPLY_TARGET,
           COUNT(ci.CONTRACT_ITEM_ID) AS ITEM_COUNT,
           SUM(ci.MIN_ANNUAL_VOLUME) AS TOTAL_MIN_VOLUME
    FROM {ATOMIC}.FACT_CONTRACT fc
    JOIN {ATOMIC}.DIM_CUSTOMER c ON fc.CUSTOMER_ID = c.CUSTOMER_ID
    LEFT JOIN {ATOMIC}.FACT_CONTRACT_ITEM ci ON fc.CONTRACT_ID = ci.CONTRACT_ID
    GROUP BY fc.CONTRACT_ID, fc.CUSTOMER_ID, c.CUSTOMER_NAME, c.CUSTOMER_SEGMENT,
             fc.CONTRACT_START_DATE, fc.CONTRACT_END_DATE,
             fc.SERVICE_LEVEL_TARGET_FILL_RATE, fc.MAX_DAYS_OF_SUPPLY_TARGET
    ORDER BY c.CUSTOMER_NAME
    """)


@router.get("/contract-items")
def contract_items(contract_id: int):
    return query(f"""
    SELECT ci.*, p.PRODUCT_CODE, p.PRODUCT_FAMILY, p.PRODUCT_DESCRIPTION
    FROM {ATOMIC}.FACT_CONTRACT_ITEM ci
    JOIN {ATOMIC}.DIM_PRODUCT p ON ci.PRODUCT_ID = p.PRODUCT_ID
    WHERE ci.CONTRACT_ID = {contract_id}
    ORDER BY p.PRODUCT_FAMILY, p.PRODUCT_CODE
    """)
