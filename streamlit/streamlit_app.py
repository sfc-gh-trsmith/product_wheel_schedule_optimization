import streamlit as st
from snowflake.snowpark.context import get_active_session
from utils.queries import (
    cached_query, execute_query, QUERY_SCENARIOS, QUERY_KPI_BY_SCENARIO,
    QUERY_FILL_RATE_BY_LINE, QUERY_CHANGEOVER_BY_PLANT, QUERY_DEMAND_VS_PLANNED,
    QUERY_DOS_BY_FAMILY, QUERY_UTILIZATION_HEATMAP, QUERY_CONTRACTS,
)
from utils.charts import (
    make_grouped_bar, make_stacked_bar, make_heatmap, apply_dark_theme,
    SNOWFLAKE_COLORS,
)
import plotly.graph_objects as go

st.set_page_config(page_title="Product Wheel Optimization", layout="wide")
session = get_active_session()

st.title("Executive Overview")
st.caption("Snowcore Contract Manufacturing -- Product Wheel Schedule Optimization")

scenarios_df = cached_query(session, QUERY_SCENARIOS)
if scenarios_df.empty:
    st.warning("No optimization scenarios found. Run the notebook or Scenario Studio first.")
    st.stop()

scenario_list = scenarios_df['SCENARIO_ID'].tolist()

with st.sidebar:
    st.header("Filters")
    scenario = st.selectbox("Scenario", scenario_list, index=0)
    plants_df = cached_query(session, "SELECT DISTINCT PLANT_NAME FROM PRODUCT_WHEEL_OPT.DATA_MART.FACT_SERVICE_AND_SCHEDULE_KPI ORDER BY PLANT_NAME")
    all_plants = plants_df['PLANT_NAME'].tolist() if not plants_df.empty else []
    plant_filter = st.multiselect("Plant", all_plants, default=all_plants)

kpi_df = cached_query(session, QUERY_KPI_BY_SCENARIO, {'scenario': scenario})
if not kpi_df.empty and plant_filter:
    kpi_df = kpi_df[kpi_df['PLANT_NAME'].isin(plant_filter)]

if kpi_df.empty:
    st.info("No KPI data for the selected scenario and filters.")
    st.stop()

total_planned = float(kpi_df['TOTAL_PLANNED_QTY'].sum())
total_demand = float(kpi_df['TOTAL_DEMAND_QTY'].sum())
global_fill_rate = total_planned / max(total_demand, 1)

co_dedup = kpi_df.drop_duplicates(subset=['PLANT_NAME', 'LINE_CODE'])
total_changeover = float(co_dedup['CHANGEOVER_HOURS'].sum())
avg_dos = float(co_dedup['INVENTORY_DAYS_OF_SUPPLY'].mean())

contracts_df = cached_query(session, QUERY_CONTRACTS)
contracts_at_risk = 0
if not contracts_df.empty:
    for _, c in contracts_df.iterrows():
        target = float(c.get('SERVICE_LEVEL_TARGET_FILL_RATE', 0) or 0)
        if global_fill_rate < target:
            contracts_at_risk += 1

c1, c2, c3, c4 = st.columns(4)
c1.metric("Global Fill Rate", f"{global_fill_rate:.1%}")
c2.metric("Total Changeover Hrs", f"{total_changeover:.1f}")
c3.metric("Avg Days of Supply", f"{avg_dos:.1f}")
c4.metric("Contracts at Risk", str(contracts_at_risk))

col_left, col_right = st.columns([3, 2])

with col_left:
    st.subheader("Fill Rate by Plant & Line")
    fr_df = cached_query(session, QUERY_FILL_RATE_BY_LINE, {'scenario': scenario})
    if not fr_df.empty and plant_filter:
        fr_df = fr_df[fr_df['PLANT_NAME'].isin(plant_filter)]
    if not fr_df.empty:
        fig = make_grouped_bar(
            fr_df, x='LINE_CODE', y='FILL_RATE', color='PLANT_NAME',
            yaxis_title='Fill Rate', height=380,
        )
        fig.update_yaxes(range=[0, 1.1], tickformat='.0%')
        fig.add_hline(y=0.95, line_dash='dash', line_color='#ef4444',
                      annotation_text='95% SLA Target')
        st.plotly_chart(fig, use_container_width=True)

with col_right:
    st.subheader("Changeover Hours by Plant")
    co_df = cached_query(session, QUERY_CHANGEOVER_BY_PLANT, {'scenario': scenario})
    if not co_df.empty and plant_filter:
        co_df = co_df[co_df['PLANT_NAME'].isin(plant_filter)]
    if not co_df.empty:
        fig = make_stacked_bar(
            co_df, x='CHANGEOVER_HOURS', y='PLANT_NAME', color='LINE_CODE',
            orientation='h', height=380,
        )
        fig.update_layout(xaxis_title='Hours')
        st.plotly_chart(fig, use_container_width=True)

col_l2, col_r2 = st.columns(2)

with col_l2:
    st.subheader("Demand vs. Planned Production")
    dvp_df = cached_query(session, QUERY_DEMAND_VS_PLANNED, {'scenario': scenario})
    if not dvp_df.empty:
        fig = go.Figure()
        fig.add_trace(go.Bar(
            x=[str(v) for v in dvp_df['PRODUCT_FAMILY'].tolist()],
            y=[float(v) for v in dvp_df['TOTAL_DEMAND_QTY'].tolist()],
            name='Demand', marker_color='#475569',
        ))
        fig.add_trace(go.Bar(
            x=[str(v) for v in dvp_df['PRODUCT_FAMILY'].tolist()],
            y=[float(v) for v in dvp_df['TOTAL_PLANNED_QTY'].tolist()],
            name='Planned', marker_color='#29B5E8',
        ))
        fig.update_layout(barmode='group', height=350, yaxis_title='Quantity')
        fig = apply_dark_theme(fig)
        st.plotly_chart(fig, use_container_width=True)

with col_r2:
    st.subheader("Inventory Days of Supply")
    dos_df = cached_query(session, QUERY_DOS_BY_FAMILY, {'scenario': scenario})
    if not dos_df.empty:
        fig = go.Figure(go.Bar(
            x=[float(v) for v in dos_df['AVG_DOS'].tolist()],
            y=[str(v) for v in dos_df['PRODUCT_FAMILY'].tolist()],
            orientation='h',
            marker_color='#29B5E8',
        ))
        fig.update_layout(height=350, xaxis_title='Days')
        fig = apply_dark_theme(fig)
        st.plotly_chart(fig, use_container_width=True)

st.subheader("Schedule Utilization Heatmap")
util_df = cached_query(session, QUERY_UTILIZATION_HEATMAP, {'scenario': scenario})
if not util_df.empty:
    util_df['UTILIZATION'] = util_df['ASSIGNED_SLOTS'] / util_df['TOTAL_SLOTS'].clip(lower=1)
    fig = make_heatmap(
        util_df, x='SLOT_DATE', y='LINE_CODE', z='UTILIZATION',
        color_scale='Blues', height=300,
    )
    fig.update_layout(xaxis_title='Date', yaxis_title='Line')
    st.plotly_chart(fig, use_container_width=True)
