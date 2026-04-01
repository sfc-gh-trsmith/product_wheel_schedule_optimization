from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from datetime import datetime
import json
import time

from ..database import query, execute, DATA_MART, ATOMIC

router = APIRouter()


@router.get("")
def list_scenarios():
    rows = query(f"""
    SELECT DISTINCT SCENARIO_ID
    FROM {DATA_MART}.FACT_LINE_SCHEDULE_OPTIMIZED
    ORDER BY SCENARIO_ID DESC
    """)
    return rows


class RunParams(BaseModel):
    horizon_days: int = 14
    shifts_per_day: int = 3
    time_limit: int = 120
    mip_gap: float = 1.0
    inv_cost_mult: float = 1.0
    bo_cost_mult: float = 1.0
    co_cost_mult: float = 1.0
    demand_mult: float = 1.0
    shock_family: str | None = None
    shock_pct: float = 0.0
    inv_mult: float = 1.0
    plant_filter: list[str] = []
    line_filter: list[str] = []
    max_products_per_line: int = 15


@router.post("/run")
async def run_scenario(params: RunParams):
    scenario_id = f"SCN-{datetime.now().strftime('%Y%m%d-%H%M%S')}"

    async def event_stream():
        lines = query(f"""
        SELECT l.LINE_ID, l.LINE_CODE, p.PLANT_NAME
        FROM {ATOMIC}.DIM_PRODUCTION_LINE l
        JOIN {ATOMIC}.DIM_PLANT p ON l.PLANT_ID = p.PLANT_ID
        ORDER BY p.PLANT_NAME, l.LINE_CODE
        """)
        if params.plant_filter:
            lines = [ln for ln in lines if ln["plant_name"] in params.plant_filter]
        if params.line_filter:
            lines = [ln for ln in lines if ln["line_code"] in params.line_filter]

        total = len(lines)
        start = time.time()

        for idx, ln in enumerate(lines):
            pct = round((idx + 1) / max(total, 1) * 100)
            yield f"data: {json.dumps({'event': 'progress', 'line': ln['line_code'], 'status': 'solving', 'pct': pct})}\n\n"

            try:
                execute(f"""
                CALL {DATA_MART}.SOLVE_LINE_SP(
                    '{scenario_id}', {ln['line_id']}, '{ln['line_code']}',
                    {params.horizon_days}, {params.shifts_per_day},
                    {params.time_limit}, {params.mip_gap / 100.0},
                    {params.inv_cost_mult}, {params.bo_cost_mult}, {params.co_cost_mult},
                    {params.demand_mult},
                    {f"'{params.shock_family}'" if params.shock_family else 'NULL'},
                    {params.shock_pct}, {params.inv_mult}, {params.max_products_per_line}
                )
                """)
                yield f"data: {json.dumps({'event': 'progress', 'line': ln['line_code'], 'status': 'solved', 'pct': pct})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'event': 'progress', 'line': ln['line_code'], 'status': f'error: {str(e)[:100]}', 'pct': pct})}\n\n"

        solve_time = round(time.time() - start, 1)

        kpi_rows = query(f"""
        SELECT * FROM {DATA_MART}.FACT_SERVICE_AND_SCHEDULE_KPI
        WHERE SCENARIO_ID = '{scenario_id}'
        """)
        sched_count = query(f"""
        SELECT COUNT(*) AS CNT FROM {DATA_MART}.FACT_LINE_SCHEDULE_OPTIMIZED
        WHERE SCENARIO_ID = '{scenario_id}'
        """)
        total_cost = sum(float(r.get("objective_cost", 0) or 0) for r in kpi_rows)
        rows_count = sched_count[0]["cnt"] if sched_count else 0

        yield f"data: {json.dumps({'event': 'complete', 'scenario_id': scenario_id, 'solve_status': 'success' if rows_count > 0 else 'no_solution', 'lines_solved': len(kpi_rows), 'schedule_rows': rows_count, 'solve_time_sec': solve_time, 'total_objective_cost': total_cost})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


class SaveParams(BaseModel):
    scenario_id: str
    horizon_days: int = 14
    shifts_per_day: int = 3
    time_limit: int = 120
    mip_gap: float = 1.0
    inv_cost_mult: float = 1.0
    bo_cost_mult: float = 1.0
    co_cost_mult: float = 1.0
    demand_mult: float = 1.0
    shock_family: str | None = None
    shock_pct: float = 0.0
    inv_mult: float = 1.0
    plant_filter: str = "All"
    line_filter: str = "All"
    max_products_per_line: int = 15
    solve_time_sec: float = 0
    total_objective_cost: float = 0


@router.post("/save")
def save_scenario(p: SaveParams):
    shock_val = f"'{p.shock_family}'" if p.shock_family else "NULL"
    execute(f"""
    INSERT INTO {DATA_MART}.SCENARIO_PARAMETERS
    (SCENARIO_ID, HORIZON_DAYS, SHIFTS_PER_DAY, TIME_LIMIT_SEC, MIP_GAP_PCT,
     INV_COST_MULTIPLIER, BO_COST_MULTIPLIER, CO_COST_MULTIPLIER,
     DEMAND_MULTIPLIER, DEMAND_SHOCK_FAMILY, DEMAND_SHOCK_PCT, INV_MULTIPLIER,
     PLANT_FILTER, LINE_FILTER, MAX_PRODUCTS_PER_LINE, SOLVER_ENGINE,
     SOLVE_TIME_SEC, TOTAL_OBJECTIVE_COST, STATUS)
    VALUES ('{p.scenario_id}', {p.horizon_days}, {p.shifts_per_day}, {p.time_limit},
            {p.mip_gap / 100.0}, {p.inv_cost_mult}, {p.bo_cost_mult}, {p.co_cost_mult},
            {p.demand_mult}, {shock_val}, {p.shock_pct}, {p.inv_mult},
            '{p.plant_filter}', '{p.line_filter}', {p.max_products_per_line}, 'CBC',
            {p.solve_time_sec}, {p.total_objective_cost}, 'saved')
    """)
    return {"status": "saved", "scenario_id": p.scenario_id}


@router.delete("/discard")
def discard_scenario(scenario_id: str):
    execute(f"DELETE FROM {DATA_MART}.FACT_LINE_SCHEDULE_OPTIMIZED WHERE SCENARIO_ID = '{scenario_id}'")
    execute(f"DELETE FROM {DATA_MART}.FACT_SERVICE_AND_SCHEDULE_KPI WHERE SCENARIO_ID = '{scenario_id}'")
    return {"status": "discarded"}


@router.get("/demand-agg")
def demand_agg():
    return query(f"""
    SELECT d.PRODUCT_ID, p.PRODUCT_FAMILY, SUM(d.FORECAST_QTY) AS FORECAST_QTY
    FROM {ATOMIC}.FACT_DEMAND_FORECAST d
    JOIN {ATOMIC}.DIM_PRODUCT p ON d.PRODUCT_ID = p.PRODUCT_ID
    GROUP BY d.PRODUCT_ID, p.PRODUCT_FAMILY
    ORDER BY p.PRODUCT_FAMILY
    """)
