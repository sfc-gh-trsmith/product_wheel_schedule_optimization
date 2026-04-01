import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'PuLP-2.9.0-py3-none-any.whl'))
import pulp
import pandas as pd
import numpy as np
from datetime import datetime, timedelta


def _solve_line(line_id, line_code, df_cal_line, df_tp_line, df_co_line,
                df_demand_agg, cost_df, inv0_dict, n_lines,
                horizon_days=14, shifts_per_day=3, time_limit=120, mip_gap=0.01,
                inv_cost_mult=1.0, bo_cost_mult=1.0, co_cost_mult=1.0,
                max_products_per_line=15):
    slots = sorted(df_cal_line['LINE_CALENDAR_ID'].unique())
    if len(slots) == 0:
        return None, None
    products_on_line = sorted(df_tp_line['PRODUCT_ID'].unique())
    if len(products_on_line) < 2:
        return None, None

    n_slots = min(len(slots), horizon_days * shifts_per_day)
    slots = slots[:n_slots]
    products_on_line = products_on_line[:min(len(products_on_line), max_products_per_line)]

    slot_cap, slot_times = {}, {}
    for _, row in df_cal_line[df_cal_line['LINE_CALENDAR_ID'].isin(slots)].iterrows():
        sid = row['LINE_CALENDAR_ID']
        slot_cap[sid] = float(row['AVAILABLE_HOURS'])
        slot_times[sid] = (row['TIME_SLOT_START'], row['TIME_SLOT_END'])

    rate = {}
    for _, row in df_tp_line[df_tp_line['PRODUCT_ID'].isin(products_on_line)].iterrows():
        rate[row['PRODUCT_ID']] = max(float(row['RUN_RATE_UNITS_PER_HOUR']), 1.0)

    change_cost = {}
    for _, row in df_co_line[
        (df_co_line['FROM_PRODUCT_ID'].isin(products_on_line)) &
        (df_co_line['TO_PRODUCT_ID'].isin(products_on_line))
    ].iterrows():
        change_cost[(row['FROM_PRODUCT_ID'], row['TO_PRODUCT_ID'])] = float(row['CHANGEOVER_COST']) * co_cost_mult

    demand_per_slot = {}
    for p in products_on_line:
        d_rows = df_demand_agg[df_demand_agg['PRODUCT_ID'] == p]
        total_demand = float(d_rows['FORECAST_QTY'].sum()) if len(d_rows) > 0 else 0
        per_slot = total_demand / max(n_slots, 1)
        for s in slots:
            demand_per_slot[(p, s)] = per_slot

    cost_map = dict(zip(cost_df['PRODUCT_ID'], cost_df.to_dict('records')))
    inv_cost, bo_cost = {}, {}
    for p in products_on_line:
        if p in cost_map:
            inv_cost[p] = cost_map[p]['inv_holding_cost'] * inv_cost_mult
            bo_cost[p] = cost_map[p]['backorder_cost'] * bo_cost_mult
        else:
            inv_cost[p] = 0.05 * inv_cost_mult
            bo_cost[p] = 5.0 * bo_cost_mult

    inv0 = {p: min(inv0_dict.get(p, 0.0) / max(1, n_lines),
                   demand_per_slot.get((p, slots[0]), 0) * 2)
            for p in products_on_line}

    model = pulp.LpProblem(f'ProductWheel_Line_{line_id}', pulp.LpMinimize)

    q_v   = pulp.LpVariable.dicts('q',   (products_on_line, slots), lowBound=0)
    y_v   = pulp.LpVariable.dicts('y',   (products_on_line, slots), cat='Binary')
    inv_v = pulp.LpVariable.dicts('inv', (products_on_line, slots), lowBound=0)
    bo_v  = pulp.LpVariable.dicts('bo',  (products_on_line, slots), lowBound=0)

    internal_slots = slots[1:]
    z_v = pulp.LpVariable.dicts('z', (products_on_line, products_on_line, internal_slots), cat='Binary')

    BIG_M = {p: rate.get(p, 100.0) * 8.0 for p in products_on_line}

    changeover_expr = pulp.lpSum(
        change_cost.get((p, qq), 200.0 * co_cost_mult) * z_v[p][qq][t]
        for p in products_on_line for qq in products_on_line
        for t in internal_slots if p != qq
    )
    inv_expr = pulp.lpSum(
        inv_cost[p] * inv_v[p][t]
        for p in products_on_line for t in slots
    )
    bo_expr = pulp.lpSum(
        bo_cost[p] * bo_v[p][t]
        for p in products_on_line for t in slots
    )
    model += changeover_expr + inv_expr + bo_expr

    for t in slots:
        model += pulp.lpSum(y_v[p][t] for p in products_on_line) <= 1

    for t in slots:
        model += pulp.lpSum(
            (1.0 / rate.get(p, 100.0)) * q_v[p][t]
            for p in products_on_line
        ) <= slot_cap.get(t, 8.0)

    for p in products_on_line:
        for t in slots:
            model += q_v[p][t] <= BIG_M[p] * y_v[p][t]

    for p in products_on_line:
        for idx, t in enumerate(slots):
            prev = inv0[p] if idx == 0 else inv_v[p][slots[idx - 1]]
            model += prev + q_v[p][t] == demand_per_slot.get((p, t), 0) + inv_v[p][t] - bo_v[p][t]

    for idx, t in enumerate(slots):
        if idx == 0:
            continue
        prev_t = slots[idx - 1]
        for p in products_on_line:
            for qq in products_on_line:
                if p != qq:
                    model += z_v[p][qq][t] <= y_v[p][prev_t]
                    model += z_v[p][qq][t] <= y_v[qq][t]
        model += pulp.lpSum(
            z_v[p][qq][t] for p in products_on_line
            for qq in products_on_line if p != qq
        ) <= pulp.lpSum(y_v[qq][t] for qq in products_on_line)

    for p in products_on_line:
        model += bo_v[p][slots[-1]] == 0

    solver = pulp.PULP_CBC_CMD(
        timeLimit=time_limit,
        gapRel=mip_gap,
        msg=0,
        threads=4,
    )
    model.solve(solver)
    status = pulp.LpStatus[model.status]
    obj_val = pulp.value(model.objective) if model.status == 1 else None

    if model.status != 1:
        return None, None

    schedule_rows = []
    for t in slots:
        for p in products_on_line:
            yval = y_v[p][t].varValue
            if yval is not None and yval > 0.5:
                qty_val = q_v[p][t].varValue or 0
                inv_out = inv_v[p][t].varValue or 0
                ts_start, ts_end = slot_times.get(t, (None, None))
                co_time = 0
                if t in internal_slots:
                    for pp in products_on_line:
                        if pp != p:
                            zval = z_v[pp][p][t].varValue
                            if zval is not None and zval > 0.5:
                                co_time = change_cost.get((pp, p), 0) / max(200.0 * co_cost_mult, 1)
                schedule_rows.append({
                    'LINE_ID': line_id,
                    'TIME_SLOT_START': ts_start,
                    'TIME_SLOT_END': ts_end,
                    'PRODUCT_ID': int(p),
                    'PLANNED_QTY': round(qty_val, 1),
                    'PROJECTED_INVENTORY_QTY': round(inv_out, 1),
                    'TOTAL_CHANGEOVER_TIME_HOURS': round(co_time, 2),
                    'OBJECTIVE_COST': round(obj_val, 2) if obj_val else 0,
                })

    total_demand = sum(demand_per_slot.get((p, t), 0) for p in products_on_line for t in slots)
    total_produced = sum(r['PLANNED_QTY'] for r in schedule_rows)
    fill_rate = min(total_produced / max(total_demand, 1), 1.0)
    for r in schedule_rows:
        r['PROJECTED_FILL_RATE'] = round(fill_rate, 4)

    kpi = {
        'LINE_ID': line_id,
        'LINE_CODE': line_code,
        'FILL_RATE': fill_rate,
        'TOTAL_CHANGEOVER_HOURS': sum(r['TOTAL_CHANGEOVER_TIME_HOURS'] for r in schedule_rows),
        'TOTAL_PLANNED_QTY': total_produced,
        'TOTAL_DEMAND_QTY': total_demand,
        'OBJECTIVE_COST': obj_val,
    }
    return schedule_rows, kpi


def solve_scenario(
    session,
    scenario_id,
    horizon_days=14,
    shifts_per_day=3,
    time_limit=120,
    mip_gap=0.01,
    inv_cost_mult=1.0,
    bo_cost_mult=1.0,
    co_cost_mult=1.0,
    demand_mult=1.0,
    demand_shock_family=None,
    demand_shock_pct=0.0,
    inv_mult=1.0,
    plant_filter=None,
    line_filter=None,
    max_products_per_line=15,
    progress_callback=None,
):
    DB = 'PRODUCT_WHEEL_OPT'
    ATOMIC = f'{DB}.ATOMIC'
    DATA_MART = f'{DB}.DATA_MART'

    def read_table(t):
        return session.sql(f'SELECT * FROM {ATOMIC}.{t}').to_pandas()

    df_plant = read_table('DIM_PLANT')
    df_line = read_table('DIM_PRODUCTION_LINE')
    df_product = read_table('DIM_PRODUCT')
    df_demand = read_table('FACT_DEMAND_FORECAST')
    df_calendar = read_table('FACT_LINE_CALENDAR')
    df_throughput = read_table('FACT_LINE_PRODUCT_THROUGHPUT')
    df_changeover = read_table('FACT_LINE_PRODUCT_CHANGEOVER')
    df_inventory = read_table('FACT_INVENTORY_POSITION')
    df_costing = read_table('FACT_PRODUCT_COSTING')

    df_demand['FORECAST_QTY'] = df_demand['FORECAST_QTY'] * demand_mult
    if demand_shock_family and demand_shock_pct != 0:
        shock_products = df_product[df_product['PRODUCT_FAMILY'] == demand_shock_family]['PRODUCT_ID'].tolist()
        mask = df_demand['PRODUCT_ID'].isin(shock_products)
        df_demand.loc[mask, 'FORECAST_QTY'] = df_demand.loc[mask, 'FORECAST_QTY'] * (1 + demand_shock_pct / 100.0)

    df_calendar_avail = df_calendar[df_calendar['CALENDAR_STATUS'] == 'available'].copy()
    df_calendar_avail['SLOT_DATE'] = pd.to_datetime(df_calendar_avail['TIME_SLOT_START']).dt.date
    min_date = df_calendar_avail['SLOT_DATE'].min()
    horizon_end = min_date + timedelta(days=horizon_days)
    df_calendar_avail = df_calendar_avail[df_calendar_avail['SLOT_DATE'] < horizon_end]

    avg_cost = df_costing.groupby('PRODUCT_ID').agg(
        material=('MATERIAL_COST_PER_UNIT', 'mean'),
        conversion=('CONVERSION_COST_PER_UNIT', 'mean'),
        margin=('STANDARD_MARGIN_PER_UNIT', 'mean'),
    ).reset_index()
    avg_cost['inv_holding_cost'] = (avg_cost['material'] + avg_cost['conversion']) * 0.02
    avg_cost['backorder_cost'] = avg_cost['margin'] * 5.0

    latest_snap = df_inventory.groupby(['PRODUCT_ID', 'PLANT_ID'])['SNAPSHOT_TIMESTAMP'].max().reset_index()
    latest_inv = pd.merge(latest_snap, df_inventory, on=['PRODUCT_ID', 'PLANT_ID', 'SNAPSHOT_TIMESTAMP'])
    inv_by_product = latest_inv.groupby('PRODUCT_ID')['ON_HAND_QTY'].sum().reset_index()
    inv_dict = dict(zip(inv_by_product['PRODUCT_ID'], inv_by_product['ON_HAND_QTY'] * inv_mult))

    demand_agg = df_demand.groupby('PRODUCT_ID')['FORECAST_QTY'].sum().reset_index()

    if plant_filter:
        plant_ids = df_plant[df_plant['PLANT_NAME'].isin(plant_filter)]['PLANT_ID'].tolist()
        df_line = df_line[df_line['PLANT_ID'].isin(plant_ids)]
    if line_filter:
        df_line = df_line[df_line['LINE_CODE'].isin(line_filter)]

    n_lines = len(df_line)
    all_schedule_rows = []
    all_kpi_rows = []

    import time
    start_time = time.time()

    for idx, (_, line_row) in enumerate(df_line.iterrows()):
        lid = line_row['LINE_ID']
        lcode = line_row['LINE_CODE']
        plant_id = line_row['PLANT_ID']

        cal_line = df_calendar_avail[df_calendar_avail['LINE_ID'] == lid]
        tp_line = df_throughput[df_throughput['LINE_ID'] == lid]
        co_line = df_changeover[df_changeover['LINE_ID'] == lid]

        sched, kpi = _solve_line(
            lid, lcode, cal_line, tp_line, co_line,
            demand_agg, avg_cost, inv_dict, n_lines,
            horizon_days=horizon_days,
            shifts_per_day=shifts_per_day,
            time_limit=time_limit,
            mip_gap=mip_gap,
            inv_cost_mult=inv_cost_mult,
            bo_cost_mult=bo_cost_mult,
            co_cost_mult=co_cost_mult,
            max_products_per_line=max_products_per_line,
        )

        if sched:
            for r in sched:
                r['SCENARIO_ID'] = scenario_id
            all_schedule_rows.extend(sched)
        if kpi:
            plant_row = df_plant[df_plant['PLANT_ID'] == plant_id].iloc[0]
            kpi['SCENARIO_ID'] = scenario_id
            kpi['PLANT_NAME'] = plant_row['PLANT_NAME']
            all_kpi_rows.append(kpi)

        if progress_callback:
            progress_callback(idx, n_lines, lcode, 'solved' if sched else 'skipped')

    solve_time = time.time() - start_time

    if all_schedule_rows:
        sched_df = pd.DataFrame(all_schedule_rows)
        sched_df = sched_df[[
            'SCENARIO_ID', 'LINE_ID', 'TIME_SLOT_START', 'TIME_SLOT_END',
            'PRODUCT_ID', 'PLANNED_QTY', 'PROJECTED_FILL_RATE',
            'PROJECTED_INVENTORY_QTY', 'TOTAL_CHANGEOVER_TIME_HOURS',
            'OBJECTIVE_COST',
        ]]
        sp_sched = session.create_dataframe(sched_df)
        for col in sched_df.columns:
            sp_sched = sp_sched.with_column_renamed(col, col.upper())
        sp_sched.write.mode('append').save_as_table(
            f'{DATA_MART}.FACT_LINE_SCHEDULE_OPTIMIZED'
        )

    if all_kpi_rows:
        cols = ['SCENARIO_ID', 'PLANT_NAME', 'LINE_CODE', 'PRODUCT_FAMILY',
                'CUSTOMER_NAME', 'WEEK_START', 'FILL_RATE', 'INVENTORY_DAYS_OF_SUPPLY',
                'CHANGEOVER_HOURS', 'TOTAL_PLANNED_QTY', 'TOTAL_DEMAND_QTY', 'OBJECTIVE_COST']
        col_list = ', '.join(cols)

        for kpi in all_kpi_rows:
            for fam in df_product['PRODUCT_FAMILY'].unique():
                vals = []
                rec = {
                    'SCENARIO_ID': kpi['SCENARIO_ID'],
                    'PLANT_NAME': kpi['PLANT_NAME'],
                    'LINE_CODE': kpi['LINE_CODE'],
                    'PRODUCT_FAMILY': fam,
                    'CUSTOMER_NAME': 'All Customers',
                    'WEEK_START': str(min_date),
                    'FILL_RATE': round(kpi['FILL_RATE'], 4),
                    'INVENTORY_DAYS_OF_SUPPLY': round(
                        kpi['TOTAL_PLANNED_QTY'] / max(kpi['TOTAL_DEMAND_QTY'] / max(horizon_days, 1), 1), 1
                    ),
                    'CHANGEOVER_HOURS': round(kpi['TOTAL_CHANGEOVER_HOURS'], 2),
                    'TOTAL_PLANNED_QTY': round(kpi['TOTAL_PLANNED_QTY'], 1),
                    'TOTAL_DEMAND_QTY': round(kpi['TOTAL_DEMAND_QTY'], 1),
                    'OBJECTIVE_COST': round(kpi['OBJECTIVE_COST'], 2) if kpi['OBJECTIVE_COST'] else 0,
                }
                for c in cols:
                    v = rec[c]
                    if c == 'WEEK_START':
                        vals.append(f"TO_DATE('{v}', 'YYYY-MM-DD')")
                    elif isinstance(v, str):
                        safe = str(v).replace("'", "''")
                        vals.append(f"'{safe}'")
                    else:
                        vals.append(str(v))
                val_list = ', '.join(vals)
                session.sql(f'INSERT INTO {DATA_MART}.FACT_SERVICE_AND_SCHEDULE_KPI ({col_list}) VALUES ({val_list})').collect()

    total_obj = sum(k.get('OBJECTIVE_COST', 0) or 0 for k in all_kpi_rows)

    return {
        'scenario_id': scenario_id,
        'solve_status': 'success' if all_schedule_rows else 'no_solution',
        'lines_solved': len(all_kpi_rows),
        'schedule_rows': len(all_schedule_rows),
        'solve_time_sec': round(solve_time, 1),
        'total_objective_cost': total_obj,
        'kpi_summary': all_kpi_rows,
    }
