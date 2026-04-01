import streamlit as st
from snowflake.snowpark.context import get_active_session
from datetime import datetime
from utils.queries import (
    cached_query, execute_query, QUERY_SCENARIOS, QUERY_KPI_BY_SCENARIO,
    QUERY_SCHEDULE_BY_SCENARIO, QUERY_PLANTS, QUERY_LINES_BY_PLANT,
    QUERY_PRODUCT_FAMILIES, QUERY_DEMAND_AGG, QUERY_SCENARIO_PARAMS,
    DATA_MART,
)
from utils.charts import (
    make_gantt, make_radar, apply_dark_theme, SNOWFLAKE_COLORS,
)
import plotly.graph_objects as go
import pandas as pd

st.set_page_config(page_title="Scenario Studio", layout="wide")
session = get_active_session()

st.title("Scenario Studio")
st.caption("Configure parameters, run what-if optimizations, and compare results")

scenarios_df = cached_query(session, QUERY_SCENARIOS)
scenario_list = scenarios_df['SCENARIO_ID'].tolist() if not scenarios_df.empty else []

with st.sidebar:
    st.header("Baseline")
    if scenario_list:
        baseline_scenario = st.selectbox("Baseline Scenario", scenario_list, index=0)
    else:
        baseline_scenario = None
        st.warning("No baseline scenarios. Run the notebook first.")

plants_df = cached_query(session, QUERY_PLANTS)
all_plants = plants_df['PLANT_NAME'].tolist()
lines_df = cached_query(session, QUERY_LINES_BY_PLANT)
families_df = cached_query(session, QUERY_PRODUCT_FAMILIES)
all_families = families_df['PRODUCT_FAMILY'].tolist() if not families_df.empty else []

col_params, col_preview = st.columns([2, 3])

with col_params:
    st.subheader("Parameter Configuration")

    st.markdown('<div style="background:#1e293b;padding:0.8rem;border-radius:8px;margin-bottom:0.5rem;">'
                '<strong>Planning Horizon</strong></div>', unsafe_allow_html=True)
    horizon_days = st.slider("Horizon Days", 7, 28, 14)
    shifts_per_day = st.selectbox("Shifts per Day", [1, 2, 3], index=2)

    st.markdown('<div style="background:#1e293b;padding:0.8rem;border-radius:8px;margin-bottom:0.5rem;">'
                '<strong>Cost Weights</strong></div>', unsafe_allow_html=True)
    inv_cost_mult = st.slider("Inventory Holding Cost Multiplier", 0.1, 5.0, 1.0, 0.1)
    bo_cost_mult = st.slider("Backorder Penalty Multiplier", 0.5, 10.0, 1.0, 0.5)
    co_cost_mult = st.slider("Changeover Cost Multiplier", 0.1, 5.0, 1.0, 0.1)

    st.markdown('<div style="background:#1e293b;padding:0.8rem;border-radius:8px;margin-bottom:0.5rem;">'
                '<strong>Line Scope</strong></div>', unsafe_allow_html=True)
    plant_sel = st.multiselect("Plants to Include", all_plants, default=all_plants)
    filtered_lines = lines_df[lines_df['PLANT_NAME'].isin(plant_sel)]['LINE_CODE'].tolist() if plant_sel else []
    line_sel = st.multiselect("Lines to Include", filtered_lines, default=filtered_lines)
    max_products = st.slider("Max Products per Line", 5, 25, 15)

    st.markdown('<div style="background:#1e293b;padding:0.8rem;border-radius:8px;margin-bottom:0.5rem;">'
                '<strong>Solver Settings</strong></div>', unsafe_allow_html=True)
    time_limit = st.number_input("Solver Time Limit (sec)", 10, 600, 120, step=10)
    mip_gap = st.slider("MIP Gap Tolerance (%)", 0.1, 10.0, 1.0, 0.1)

    st.markdown('<div style="background:#1e293b;padding:0.8rem;border-radius:8px;margin-bottom:0.5rem;">'
                '<strong>Demand Scenarios</strong></div>', unsafe_allow_html=True)
    demand_mult = st.slider("Demand Multiplier", 0.5, 2.0, 1.0, 0.1)
    shock_family = st.selectbox("Demand Shock: Product Family", ["None"] + all_families)
    shock_pct = st.slider("Demand Shock: Magnitude (%)", -50, 100, 0, 5)

    st.markdown('<div style="background:#1e293b;padding:0.8rem;border-radius:8px;margin-bottom:0.5rem;">'
                '<strong>Inventory Override</strong></div>', unsafe_allow_html=True)
    inv_mult = st.slider("Starting Inventory Multiplier", 0.0, 3.0, 1.0, 0.1)

with col_preview:
    st.subheader("Parameter Impact Preview")

    demand_df = cached_query(session, QUERY_DEMAND_AGG)
    if not demand_df.empty:
        preview_df = demand_df.groupby('PRODUCT_FAMILY')['FORECAST_QTY'].sum().reset_index()
        preview_df['ADJUSTED_QTY'] = preview_df['FORECAST_QTY'] * demand_mult
        if shock_family != "None" and shock_pct != 0:
            mask = preview_df['PRODUCT_FAMILY'] == shock_family
            preview_df.loc[mask, 'ADJUSTED_QTY'] = preview_df.loc[mask, 'ADJUSTED_QTY'] * (1 + shock_pct / 100.0)

        fig = go.Figure()
        fig.add_trace(go.Bar(
            x=[str(v) for v in preview_df['PRODUCT_FAMILY'].tolist()],
            y=[float(v) for v in preview_df['FORECAST_QTY'].tolist()],
            name='Baseline Demand', marker_color='#475569',
        ))
        fig.add_trace(go.Bar(
            x=[str(v) for v in preview_df['PRODUCT_FAMILY'].tolist()],
            y=[float(v) for v in preview_df['ADJUSTED_QTY'].tolist()],
            name='Adjusted Demand', marker_color='#29B5E8',
        ))
        fig.update_layout(barmode='group', height=300, yaxis_title='Demand Qty',
                          title='Demand Profile: Baseline vs. Adjusted')
        fig = apply_dark_theme(fig)
        st.plotly_chart(fig, use_container_width=True)

    n_lines_sel = len(line_sel) if line_sel else len(filtered_lines)
    n_slots = horizon_days * shifts_per_day
    est_time = max(1, n_lines_sel * n_slots * max_products / 5000)

    pc1, pc2 = st.columns(2)
    pc1.metric("Estimated Solve Time", f"~{est_time:.0f} sec")
    pc2.metric("Problem Size", f"{n_lines_sel} lines x {n_slots} slots x {max_products} products")

st.divider()

if st.button("Run Optimization", type="primary", use_container_width=True):
    scenario_id = f"SCN-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    st.info(f"Running scenario **{scenario_id}**...")

    progress_bar = st.progress(0)
    status_container = st.status("Solving...", expanded=True)

    def progress_cb(idx, total, line_code, status):
        pct = (idx + 1) / max(total, 1)
        progress_bar.progress(pct)
        status_container.write(f"Line {line_code}: {status}")

    from utils.solver import solve_scenario

    result = solve_scenario(
        session=session,
        scenario_id=scenario_id,
        horizon_days=horizon_days,
        shifts_per_day=shifts_per_day,
        time_limit=time_limit,
        mip_gap=mip_gap / 100.0,
        inv_cost_mult=inv_cost_mult,
        bo_cost_mult=bo_cost_mult,
        co_cost_mult=co_cost_mult,
        demand_mult=demand_mult,
        demand_shock_family=shock_family if shock_family != "None" else None,
        demand_shock_pct=float(shock_pct),
        inv_mult=inv_mult,
        plant_filter=plant_sel if plant_sel else None,
        line_filter=line_sel if line_sel else None,
        max_products_per_line=max_products,
        progress_callback=progress_cb,
    )

    status_container.update(label="Solve Complete", state="complete")
    progress_bar.progress(1.0)

    st.session_state['new_scenario_id'] = scenario_id
    st.session_state['solve_result'] = result

if 'new_scenario_id' in st.session_state and baseline_scenario:
    new_id = st.session_state['new_scenario_id']
    result = st.session_state.get('solve_result', {})

    st.subheader("Scenario Comparison")

    new_kpi = cached_query(session, QUERY_KPI_BY_SCENARIO, {'scenario': new_id})
    base_kpi = cached_query(session, QUERY_KPI_BY_SCENARIO, {'scenario': baseline_scenario})

    if not new_kpi.empty and not base_kpi.empty:
        def calc_metrics(df):
            tp = float(df['TOTAL_PLANNED_QTY'].sum())
            td = float(df['TOTAL_DEMAND_QTY'].sum())
            dedup = df.drop_duplicates(subset=['PLANT_NAME', 'LINE_CODE'])
            return {
                'fill_rate': tp / max(td, 1),
                'changeover_hrs': float(dedup['CHANGEOVER_HOURS'].sum()),
                'total_planned': tp,
                'objective_cost': float(df['OBJECTIVE_COST'].sum()),
            }

        bm = calc_metrics(base_kpi)
        nm = calc_metrics(new_kpi)

        mc1, mc2, mc3, mc4 = st.columns(4)
        mc1.metric("Fill Rate", f"{nm['fill_rate']:.1%}",
                   delta=f"{(nm['fill_rate'] - bm['fill_rate'])*100:+.1f} pp")
        mc2.metric("Changeover Hrs", f"{nm['changeover_hrs']:.1f}",
                   delta=f"{nm['changeover_hrs'] - bm['changeover_hrs']:+.1f}")
        mc3.metric("Total Planned Qty", f"{nm['total_planned']:,.0f}",
                   delta=f"{nm['total_planned'] - bm['total_planned']:+,.0f}")
        mc4.metric("Objective Cost", f"${nm['objective_cost']:,.0f}",
                   delta=f"${nm['objective_cost'] - bm['objective_cost']:+,.0f}",
                   delta_color="inverse")

        gcol1, gcol2 = st.columns(2)
        with gcol1:
            st.markdown(f"**Baseline: {baseline_scenario}**")
            base_sched = cached_query(session, QUERY_SCHEDULE_BY_SCENARIO, {'scenario': baseline_scenario})
            if not base_sched.empty:
                base_sched['TIME_SLOT_START'] = pd.to_datetime(base_sched['TIME_SLOT_START'])
                base_sched['TIME_SLOT_END'] = pd.to_datetime(base_sched['TIME_SLOT_END'])
                fig = make_gantt(base_sched)
                st.plotly_chart(fig, use_container_width=True)

        with gcol2:
            st.markdown(f"**New: {new_id}**")
            new_sched = cached_query(session, QUERY_SCHEDULE_BY_SCENARIO, {'scenario': new_id})
            if not new_sched.empty:
                new_sched['TIME_SLOT_START'] = pd.to_datetime(new_sched['TIME_SLOT_START'])
                new_sched['TIME_SLOT_END'] = pd.to_datetime(new_sched['TIME_SLOT_END'])
                fig = make_gantt(new_sched)
                st.plotly_chart(fig, use_container_width=True)

        bm_dedup = base_kpi.drop_duplicates(subset=['PLANT_NAME', 'LINE_CODE'])
        nm_dedup = new_kpi.drop_duplicates(subset=['PLANT_NAME', 'LINE_CODE'])
        labels = ['Fill Rate', 'Days of Supply', 'Changeover (inv)', 'Cost (inv)', 'Utilization']
        max_co = max(float(bm_dedup['CHANGEOVER_HOURS'].sum()), float(nm_dedup['CHANGEOVER_HOURS'].sum()), 1)
        max_cost = max(bm['objective_cost'], nm['objective_cost'], 1)
        base_radar = {
            'Fill Rate': bm['fill_rate'],
            'Days of Supply': min(float(bm_dedup['INVENTORY_DAYS_OF_SUPPLY'].mean()) / 30, 1),
            'Changeover (inv)': 1 - float(bm_dedup['CHANGEOVER_HOURS'].sum()) / max_co,
            'Cost (inv)': 1 - bm['objective_cost'] / max_cost,
            'Utilization': bm['fill_rate'],
        }
        new_radar = {
            'Fill Rate': nm['fill_rate'],
            'Days of Supply': min(float(nm_dedup['INVENTORY_DAYS_OF_SUPPLY'].mean()) / 30, 1),
            'Changeover (inv)': 1 - float(nm_dedup['CHANGEOVER_HOURS'].sum()) / max_co,
            'Cost (inv)': 1 - nm['objective_cost'] / max_cost,
            'Utilization': nm['fill_rate'],
        }
        fig = make_radar(base_radar, new_radar, labels, title='KPI Comparison Radar', height=400)
        st.plotly_chart(fig, use_container_width=True)

        st.subheader("Parameter Differences")
        param_data = {
            'Parameter': ['Horizon Days', 'Shifts/Day', 'Inv Cost Mult', 'BO Cost Mult',
                          'CO Cost Mult', 'Demand Mult', 'Shock Family', 'Shock %',
                          'Inv Mult', 'Max Products/Line', 'Time Limit', 'MIP Gap'],
            'New Value': [horizon_days, shifts_per_day, inv_cost_mult, bo_cost_mult,
                         co_cost_mult, demand_mult,
                         shock_family if shock_family != "None" else "None",
                         shock_pct, inv_mult, max_products, time_limit, mip_gap],
            'Default': [14, 3, 1.0, 1.0, 1.0, 1.0, 'None', 0, 1.0, 15, 120, 1.0],
        }
        param_df = pd.DataFrame(param_data)
        param_df['Changed'] = param_df['New Value'].astype(str) != param_df['Default'].astype(str)
        changed = param_df[param_df['Changed']]
        if not changed.empty:
            st.dataframe(changed[['Parameter', 'Default', 'New Value']],
                         use_container_width=True, hide_index=True)
        else:
            st.info("All parameters at default values.")

    st.divider()
    scol1, scol2 = st.columns(2)
    with scol1:
        if st.button("Save Scenario", type="primary"):
            save_sql = f"""
            INSERT INTO {DATA_MART}.SCENARIO_PARAMETERS
            (SCENARIO_ID, HORIZON_DAYS, SHIFTS_PER_DAY, TIME_LIMIT_SEC, MIP_GAP_PCT,
             INV_COST_MULTIPLIER, BO_COST_MULTIPLIER, CO_COST_MULTIPLIER,
             DEMAND_MULTIPLIER, DEMAND_SHOCK_FAMILY, DEMAND_SHOCK_PCT, INV_MULTIPLIER,
             PLANT_FILTER, LINE_FILTER, MAX_PRODUCTS_PER_LINE, SOLVER_ENGINE,
             SOLVE_TIME_SEC, TOTAL_OBJECTIVE_COST, STATUS)
            VALUES ('{new_id}', {horizon_days}, {shifts_per_day}, {time_limit},
                    {mip_gap / 100.0}, {inv_cost_mult}, {bo_cost_mult}, {co_cost_mult},
                    {demand_mult},
                    {"'" + shock_family + "'" if shock_family != "None" else "NULL"},
                    {shock_pct}, {inv_mult},
                    '{",".join(plant_sel) if plant_sel else "All"}',
                    '{",".join(line_sel) if line_sel else "All"}',
                    {max_products}, 'CBC',
                    {result.get('solve_time_sec', 0)},
                    {result.get('total_objective_cost', 0)},
                    'saved')
            """
            session.sql(save_sql).collect()
            st.success(f"Scenario {new_id} saved.")

    with scol2:
        if st.button("Discard Scenario"):
            session.sql(f"DELETE FROM {DATA_MART}.FACT_LINE_SCHEDULE_OPTIMIZED WHERE SCENARIO_ID = '{new_id}'").collect()
            session.sql(f"DELETE FROM {DATA_MART}.FACT_SERVICE_AND_SCHEDULE_KPI WHERE SCENARIO_ID = '{new_id}'").collect()
            del st.session_state['new_scenario_id']
            del st.session_state['solve_result']
            st.info(f"Scenario {new_id} discarded.")
            st.rerun()
