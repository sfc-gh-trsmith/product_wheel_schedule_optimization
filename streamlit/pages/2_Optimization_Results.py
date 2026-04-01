import streamlit as st
from snowflake.snowpark.context import get_active_session
from utils.queries import (
    cached_query, QUERY_SCENARIOS, QUERY_SCHEDULE_BY_SCENARIO,
    QUERY_KPI_BY_SCENARIO, QUERY_ENRICHED_FORECAST, QUERY_PLANTS,
    QUERY_SCENARIO_PARAMS,
)
from utils.charts import (
    make_gantt, make_waterfall, apply_dark_theme, SNOWFLAKE_COLORS, FAMILY_COLORS,
)
import plotly.graph_objects as go
import plotly.express as px
import pandas as pd

st.set_page_config(page_title="Optimization Results", layout="wide")
session = get_active_session()

st.title("Optimization Results")
st.caption("Inspect the solver output for a specific scenario")

scenarios_df = cached_query(session, QUERY_SCENARIOS)
if scenarios_df.empty:
    st.warning("No optimization scenarios found.")
    st.stop()

scenario_list = scenarios_df['SCENARIO_ID'].tolist()

with st.sidebar:
    st.header("Filters")
    scenario = st.selectbox("Scenario", scenario_list, index=0)
    plants_df = cached_query(session, QUERY_PLANTS)
    all_plants = plants_df['PLANT_NAME'].tolist()
    plant_filter = st.multiselect("Plant", all_plants, default=all_plants)
    line_selector = st.selectbox("Line", ["All Lines"], index=0)

sched_df = cached_query(session, QUERY_SCHEDULE_BY_SCENARIO, {'scenario': scenario})

if sched_df.empty:
    st.info("No schedule data for the selected scenario.")
    st.stop()

if plant_filter:
    sched_df = sched_df[sched_df['PLANT_NAME'].isin(plant_filter)]

available_lines = ["All Lines"] + sorted(sched_df['LINE_CODE'].unique().tolist())
with st.sidebar:
    line_selector = st.selectbox("Line", available_lines, index=0, key="line_sel_actual")

if line_selector != "All Lines":
    sched_df = sched_df[sched_df['LINE_CODE'] == line_selector]

params_df = cached_query(session, QUERY_SCENARIO_PARAMS, {'scenario': scenario})
if not params_df.empty:
    p = params_df.iloc[0]
    st.markdown(
        f'<div style="background:#1e293b;padding:0.8rem;border-radius:8px;margin-bottom:1rem;">'
        f'<strong>Scenario:</strong> {scenario} &nbsp;|&nbsp; '
        f'<strong>Solver:</strong> {p.get("SOLVER_ENGINE", "CBC")} &nbsp;|&nbsp; '
        f'<strong>Solve Time:</strong> {p.get("SOLVE_TIME_SEC", "N/A")}s &nbsp;|&nbsp; '
        f'<strong>Horizon:</strong> {p.get("HORIZON_DAYS", 14)} days'
        f'</div>',
        unsafe_allow_html=True,
    )
else:
    st.markdown(
        f'<div style="background:#1e293b;padding:0.8rem;border-radius:8px;margin-bottom:1rem;">'
        f'<strong>Scenario:</strong> {scenario} &nbsp;|&nbsp; '
        f'<strong>Source:</strong> GPU Notebook'
        f'</div>',
        unsafe_allow_html=True,
    )

st.subheader("Product Wheel Gantt Chart")
sched_df['TIME_SLOT_START'] = pd.to_datetime(sched_df['TIME_SLOT_START'])
sched_df['TIME_SLOT_END'] = pd.to_datetime(sched_df['TIME_SLOT_END'])

fig = make_gantt(sched_df, y_col='LINE_CODE', color_col='PRODUCT_FAMILY')
fig.update_layout(height=max(350, len(sched_df['LINE_CODE'].unique()) * 60 + 100))
st.plotly_chart(fig, use_container_width=True)

col_l, col_r = st.columns(2)

with col_l:
    st.subheader("Production Quantity by Product")
    prod_qty = sched_df.groupby(['PRODUCT_CODE', 'PRODUCT_FAMILY'])['PLANNED_QTY'].sum().reset_index()
    prod_qty = prod_qty.nlargest(20, 'PLANNED_QTY')
    if not prod_qty.empty:
        fig = go.Figure()
        fig.add_trace(go.Bar(
            y=[str(v) for v in prod_qty['PRODUCT_CODE'].tolist()],
            x=[float(v) for v in prod_qty['PLANNED_QTY'].tolist()],
            orientation='h',
            marker_color=[FAMILY_COLORS.get(str(f), '#29B5E8') for f in prod_qty['PRODUCT_FAMILY'].tolist()],
            name='Planned',
        ))
        fig.update_layout(height=450, xaxis_title='Planned Quantity', yaxis_title='Product')
        fig = apply_dark_theme(fig)
        st.plotly_chart(fig, use_container_width=True)

with col_r:
    st.subheader("Inventory Trajectory")
    families = sorted(sched_df['PRODUCT_FAMILY'].unique().tolist())
    sel_family = st.selectbox("Product Family", families, key="inv_traj_fam")
    fam_sched = sched_df[sched_df['PRODUCT_FAMILY'] == sel_family].copy()
    if not fam_sched.empty:
        inv_traj = fam_sched.groupby('TIME_SLOT_START')['PROJECTED_INVENTORY_QTY'].sum().reset_index()
        inv_traj = inv_traj.sort_values('TIME_SLOT_START')
        fig = go.Figure()
        fig.add_trace(go.Scatter(
            x=inv_traj['TIME_SLOT_START'].tolist(),
            y=[float(v) for v in inv_traj['PROJECTED_INVENTORY_QTY'].tolist()],
            mode='lines', name='Projected Inventory',
            line=dict(color='#29B5E8', width=2),
        ))
        fig.update_layout(height=450, xaxis_title='Time', yaxis_title='Inventory Qty')
        fig = apply_dark_theme(fig)
        st.plotly_chart(fig, use_container_width=True)

col_l2, col_r2 = st.columns(2)

with col_l2:
    st.subheader("Line-Level KPI Summary")
    kpi_df = cached_query(session, QUERY_KPI_BY_SCENARIO, {'scenario': scenario})
    if not kpi_df.empty and plant_filter:
        kpi_df = kpi_df[kpi_df['PLANT_NAME'].isin(plant_filter)]
    if not kpi_df.empty:
        line_kpi = kpi_df.groupby(['PLANT_NAME', 'LINE_CODE']).agg(
            FILL_RATE=('FILL_RATE', 'mean'),
            CHANGEOVER_HOURS=('CHANGEOVER_HOURS', 'min'),
            TOTAL_PLANNED_QTY=('TOTAL_PLANNED_QTY', 'sum'),
            TOTAL_DEMAND_QTY=('TOTAL_DEMAND_QTY', 'sum'),
            OBJECTIVE_COST=('OBJECTIVE_COST', 'sum'),
            INVENTORY_DAYS_OF_SUPPLY=('INVENTORY_DAYS_OF_SUPPLY', 'mean'),
        ).reset_index()

        def highlight_fill(val):
            if isinstance(val, (int, float)) and val < 0.9:
                return 'color: #ef4444'
            return ''

        styled = line_kpi.style.applymap(highlight_fill, subset=['FILL_RATE'])
        styled = styled.format({
            'FILL_RATE': '{:.1%}',
            'CHANGEOVER_HOURS': '{:.1f}',
            'TOTAL_PLANNED_QTY': '{:,.0f}',
            'TOTAL_DEMAND_QTY': '{:,.0f}',
            'OBJECTIVE_COST': '${:,.0f}',
            'INVENTORY_DAYS_OF_SUPPLY': '{:.1f}',
        })
        st.dataframe(styled, use_container_width=True, hide_index=True, height=300)

with col_r2:
    st.subheader("Changeover Event Timeline")
    co_events = sched_df[sched_df['TOTAL_CHANGEOVER_TIME_HOURS'] > 0].copy()
    if not co_events.empty:
        fig = px.scatter(
            co_events,
            x='TIME_SLOT_START',
            y='TOTAL_CHANGEOVER_TIME_HOURS',
            color='LINE_CODE',
            size='TOTAL_CHANGEOVER_TIME_HOURS',
            hover_data=['PRODUCT_CODE', 'PLANNED_QTY'],
            color_discrete_sequence=SNOWFLAKE_COLORS,
        )
        fig.update_layout(
            height=350,
            xaxis_title='Time', yaxis_title='Changeover Hours',
        )
        fig = apply_dark_theme(fig)
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("No changeover events in this scenario.")

st.subheader("Demand Fulfillment Waterfall")
fam_agg = sched_df.groupby('PRODUCT_FAMILY').agg(
    PLANNED=('PLANNED_QTY', 'sum'),
).reset_index()

kpi_fam = kpi_df.groupby('PRODUCT_FAMILY').agg(
    DEMAND=('TOTAL_DEMAND_QTY', lambda x: x.sum() / kpi_df.groupby('PRODUCT_FAMILY').ngroups),
).reset_index() if not kpi_df.empty else pd.DataFrame()

if not fam_agg.empty and not kpi_fam.empty:
    merged = pd.merge(kpi_fam, fam_agg, on='PRODUCT_FAMILY', how='outer').fillna(0)
    total_demand = float(merged['DEMAND'].sum())
    total_planned = float(merged['PLANNED'].sum())
    gap = total_planned - total_demand

    categories = ['Total Demand', 'Production', 'Surplus/Shortfall']
    values = [total_demand, total_planned - total_demand, 0]
    measures = ['absolute', 'relative', 'total']

    fig = go.Figure(go.Waterfall(
        x=categories, y=[total_demand, total_planned - total_demand, total_planned],
        measure=measures,
        connector=dict(line=dict(color='#475569')),
        increasing=dict(marker=dict(color='#29B5E8')),
        decreasing=dict(marker=dict(color='#FF6F61')),
        totals=dict(marker=dict(color='#11567F')),
    ))
    fig.update_layout(height=350, yaxis_title='Quantity')
    fig = apply_dark_theme(fig)
    st.plotly_chart(fig, use_container_width=True)
