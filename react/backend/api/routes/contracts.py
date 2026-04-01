from fastapi import APIRouter
from ..database import query, DATA_MART, ATOMIC

router = APIRouter()


@router.get("/compliance")
def get_compliance(scenario: str):
    rows = query(f"""
    WITH contract_products AS (
        SELECT fc.CUSTOMER_ID, fc.SERVICE_LEVEL_TARGET_FILL_RATE,
               fc.MAX_DAYS_OF_SUPPLY_TARGET, ci.PRODUCT_ID
        FROM {ATOMIC}.FACT_CONTRACT fc
        JOIN {ATOMIC}.FACT_CONTRACT_ITEM ci ON fc.CONTRACT_ID = ci.CONTRACT_ID
    ),
    demand AS (
        SELECT cp.CUSTOMER_ID, cp.SERVICE_LEVEL_TARGET_FILL_RATE,
               cp.MAX_DAYS_OF_SUPPLY_TARGET,
               SUM(df.FORECAST_QTY) AS TOTAL_DEMAND
        FROM contract_products cp
        JOIN {ATOMIC}.FACT_DEMAND_FORECAST df
            ON cp.CUSTOMER_ID = df.CUSTOMER_ID AND cp.PRODUCT_ID = df.PRODUCT_ID
        GROUP BY cp.CUSTOMER_ID, cp.SERVICE_LEVEL_TARGET_FILL_RATE,
                 cp.MAX_DAYS_OF_SUPPLY_TARGET
    ),
    production AS (
        SELECT cp.CUSTOMER_ID,
               SUM(s.PLANNED_QTY) AS TOTAL_PLANNED
        FROM contract_products cp
        JOIN {DATA_MART}.FACT_LINE_SCHEDULE_OPTIMIZED s
            ON cp.PRODUCT_ID = s.PRODUCT_ID AND s.SCENARIO_ID = '{scenario}'
        GROUP BY cp.CUSTOMER_ID
    )
    SELECT d.CUSTOMER_ID, c.CUSTOMER_NAME,
           d.SERVICE_LEVEL_TARGET_FILL_RATE AS SLA_TARGET,
           d.MAX_DAYS_OF_SUPPLY_TARGET,
           COALESCE(p.TOTAL_PLANNED, 0) / NULLIF(d.TOTAL_DEMAND, 0) AS ACHIEVED_FILL_RATE,
           d.TOTAL_DEMAND, COALESCE(p.TOTAL_PLANNED, 0) AS TOTAL_PLANNED
    FROM demand d
    JOIN {ATOMIC}.DIM_CUSTOMER c ON d.CUSTOMER_ID = c.CUSTOMER_ID
    LEFT JOIN production p ON d.CUSTOMER_ID = p.CUSTOMER_ID
    ORDER BY (COALESCE(p.TOTAL_PLANNED, 0) / NULLIF(d.TOTAL_DEMAND, 0)) -
             d.SERVICE_LEVEL_TARGET_FILL_RATE ASC
    """)
    for r in rows:
        achieved = float(r.get("achieved_fill_rate") or 0)
        target = float(r.get("sla_target") or 0)
        gap = achieved - target
        r["gap"] = round(gap, 4)
        if gap >= 0:
            r["status"] = "On Track"
        elif gap >= -0.05:
            r["status"] = "At Risk"
        else:
            r["status"] = "Breach"
    return rows


@router.get("/items")
def get_contract_items(contract_id: int):
    return query(f"""
    SELECT ci.*, p.PRODUCT_CODE, p.PRODUCT_FAMILY, p.PRODUCT_DESCRIPTION
    FROM {ATOMIC}.FACT_CONTRACT_ITEM ci
    JOIN {ATOMIC}.DIM_PRODUCT p ON ci.PRODUCT_ID = p.PRODUCT_ID
    WHERE ci.CONTRACT_ID = {contract_id}
    ORDER BY p.PRODUCT_FAMILY, p.PRODUCT_CODE
    """)
