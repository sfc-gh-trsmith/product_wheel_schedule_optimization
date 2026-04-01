from fastapi import APIRouter
from ..database import query, DATA_MART, ATOMIC

router = APIRouter()


@router.get("/schedule")
def get_schedule(scenario: str, plants: str | None = None, line: str | None = None):
    sql = f"""
    SELECT s.SCENARIO_ID, s.LINE_ID, l.LINE_CODE, pl.PLANT_NAME,
           s.TIME_SLOT_START, s.TIME_SLOT_END,
           s.PRODUCT_ID, p.PRODUCT_CODE, p.PRODUCT_DESCRIPTION, p.PRODUCT_FAMILY,
           s.PLANNED_QTY, s.PROJECTED_FILL_RATE, s.PROJECTED_INVENTORY_QTY,
           s.TOTAL_CHANGEOVER_TIME_HOURS, s.OBJECTIVE_COST
    FROM {DATA_MART}.FACT_LINE_SCHEDULE_OPTIMIZED s
    JOIN {ATOMIC}.DIM_PRODUCTION_LINE l ON s.LINE_ID = l.LINE_ID
    JOIN {ATOMIC}.DIM_PLANT pl ON l.PLANT_ID = pl.PLANT_ID
    JOIN {ATOMIC}.DIM_PRODUCT p ON s.PRODUCT_ID = p.PRODUCT_ID
    WHERE s.SCENARIO_ID = '{scenario}'
    ORDER BY l.LINE_CODE, s.TIME_SLOT_START
    """
    rows = query(sql)
    if plants:
        plist = [p.strip() for p in plants.split(",")]
        rows = [r for r in rows if r["plant_name"] in plist]
    if line and line != "All Lines":
        rows = [r for r in rows if r["line_code"] == line]
    for r in rows:
        r["time_slot_start"] = str(r["time_slot_start"])
        r["time_slot_end"] = str(r["time_slot_end"])
    return rows


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


@router.get("/params")
def get_params(scenario: str):
    rows = query(f"""
    SELECT * FROM {DATA_MART}.SCENARIO_PARAMETERS
    WHERE SCENARIO_ID = '{scenario}'
    """)
    return rows[0] if rows else None
