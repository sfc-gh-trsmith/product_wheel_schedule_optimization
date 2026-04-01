from fastapi import APIRouter, Query
from ..database import query, DATA_MART, ATOMIC

router = APIRouter()


@router.get("/kpis")
def get_kpis(scenario: str, plants: str | None = None):
    sql = f"""
    SELECT *
    FROM {DATA_MART}.FACT_SERVICE_AND_SCHEDULE_KPI
    WHERE SCENARIO_ID = '{scenario}'
    """
    rows = query(sql)
    if plants:
        plist = [p.strip() for p in plants.split(",")]
        rows = [r for r in rows if r["plant_name"] in plist]
    return rows


@router.get("/fill-rate")
def get_fill_rate(scenario: str, plants: str | None = None):
    sql = f"""
    SELECT k.PLANT_NAME, k.LINE_CODE,
           SUM(k.TOTAL_PLANNED_QTY) / NULLIF(SUM(k.TOTAL_DEMAND_QTY), 0) AS FILL_RATE
    FROM {DATA_MART}.FACT_SERVICE_AND_SCHEDULE_KPI k
    WHERE k.SCENARIO_ID = '{scenario}'
    GROUP BY k.PLANT_NAME, k.LINE_CODE
    ORDER BY k.PLANT_NAME, k.LINE_CODE
    """
    rows = query(sql)
    if plants:
        plist = [p.strip() for p in plants.split(",")]
        rows = [r for r in rows if r["plant_name"] in plist]
    return rows


@router.get("/changeover")
def get_changeover(scenario: str, plants: str | None = None):
    sql = f"""
    SELECT PLANT_NAME, LINE_CODE, MIN(CHANGEOVER_HOURS) AS CHANGEOVER_HOURS
    FROM {DATA_MART}.FACT_SERVICE_AND_SCHEDULE_KPI
    WHERE SCENARIO_ID = '{scenario}'
    GROUP BY PLANT_NAME, LINE_CODE
    ORDER BY PLANT_NAME, LINE_CODE
    """
    rows = query(sql)
    if plants:
        plist = [p.strip() for p in plants.split(",")]
        rows = [r for r in rows if r["plant_name"] in plist]
    return rows


@router.get("/demand-vs-planned")
def get_demand_vs_planned(scenario: str):
    return query(f"""
    SELECT PRODUCT_FAMILY,
           SUM(TOTAL_DEMAND_QTY) / COUNT(DISTINCT LINE_CODE) AS TOTAL_DEMAND_QTY,
           SUM(TOTAL_PLANNED_QTY) / COUNT(DISTINCT LINE_CODE) AS TOTAL_PLANNED_QTY
    FROM {DATA_MART}.FACT_SERVICE_AND_SCHEDULE_KPI
    WHERE SCENARIO_ID = '{scenario}'
    GROUP BY PRODUCT_FAMILY
    ORDER BY PRODUCT_FAMILY
    """)


@router.get("/dos")
def get_dos(scenario: str):
    return query(f"""
    SELECT PRODUCT_FAMILY,
           AVG(INVENTORY_DAYS_OF_SUPPLY) AS AVG_DOS
    FROM {DATA_MART}.FACT_SERVICE_AND_SCHEDULE_KPI
    WHERE SCENARIO_ID = '{scenario}'
    GROUP BY PRODUCT_FAMILY
    ORDER BY PRODUCT_FAMILY
    """)


@router.get("/utilization")
def get_utilization(scenario: str):
    rows = query(f"""
    SELECT l.LINE_CODE, DATE(s.TIME_SLOT_START) AS SLOT_DATE,
           COUNT(s.PRODUCT_ID) AS ASSIGNED_SLOTS,
           COUNT(DISTINCT c.LINE_CALENDAR_ID) AS TOTAL_SLOTS
    FROM {DATA_MART}.FACT_LINE_SCHEDULE_OPTIMIZED s
    JOIN {ATOMIC}.DIM_PRODUCTION_LINE l ON s.LINE_ID = l.LINE_ID
    LEFT JOIN {ATOMIC}.FACT_LINE_CALENDAR c
        ON s.LINE_ID = c.LINE_ID AND DATE(s.TIME_SLOT_START) = DATE(c.TIME_SLOT_START)
        AND c.CALENDAR_STATUS = 'available'
    WHERE s.SCENARIO_ID = '{scenario}'
    GROUP BY l.LINE_CODE, DATE(s.TIME_SLOT_START)
    ORDER BY l.LINE_CODE, SLOT_DATE
    """)
    for r in rows:
        ts = max(r.get("total_slots", 1) or 1, 1)
        r["utilization"] = (r.get("assigned_slots", 0) or 0) / ts
        r["slot_date"] = str(r["slot_date"])
    return rows
