import streamlit as st
from snowflake.snowpark.context import get_active_session
from utils.queries import (
    cached_query, execute_query, QUERY_SCENARIOS, QUERY_CONTRACT_COMPLIANCE,
    QUERY_CONTRACTS, QUERY_CONTRACT_ITEMS,
)
from utils.charts import (
    make_dumbbell, make_stacked_bar, apply_dark_theme, SNOWFLAKE_COLORS,
)
import plotly.graph_objects as go
import pandas as pd

st.set_page_config(page_title="Contract Monitor", layout="wide")
session = get_active_session()

st.title("Contract Monitor")
st.caption("Track contract SLA compliance against the optimized schedule")

scenarios_df = cached_query(session, QUERY_SCENARIOS)
if scenarios_df.empty:
    st.warning("No optimization scenarios found.")
    st.stop()

scenario_list = scenarios_df['SCENARIO_ID'].tolist()

with st.sidebar:
    st.header("Filters")
    scenario = st.selectbox("Scenario", scenario_list, index=0)

compliance_df = execute_query(session, QUERY_CONTRACT_COMPLIANCE, {'scenario': scenario})

if compliance_df.empty:
    st.info("No contract compliance data for this scenario.")
    st.stop()

compliance_df['ACHIEVED_FILL_RATE'] = compliance_df['ACHIEVED_FILL_RATE'].fillna(0).astype(float)
compliance_df['SLA_TARGET'] = compliance_df['SLA_TARGET'].fillna(0).astype(float)
compliance_df['GAP'] = compliance_df['ACHIEVED_FILL_RATE'] - compliance_df['SLA_TARGET']

def status_label(row):
    if row['GAP'] >= 0:
        return 'On Track'
    elif row['GAP'] >= -0.05:
        return 'At Risk'
    else:
        return 'Breach'

compliance_df['STATUS'] = compliance_df.apply(status_label, axis=1)

on_track = int((compliance_df['STATUS'] == 'On Track').sum())
at_risk = int((compliance_df['STATUS'] == 'At Risk').sum())
breach = int((compliance_df['STATUS'] == 'Breach').sum())
avg_gap = float(compliance_df['GAP'].mean())

c1, c2, c3 = st.columns(3)
c1.metric("Contracts On-Track", str(on_track))
c2.metric("Contracts At-Risk / Breach", f"{at_risk + breach}")
c3.metric("Avg Fill Rate Gap", f"{avg_gap:+.1%}")

st.subheader("Customer SLA Compliance")

display_df = compliance_df[['CUSTOMER_NAME', 'SLA_TARGET', 'ACHIEVED_FILL_RATE', 'GAP',
                             'TOTAL_DEMAND', 'TOTAL_PLANNED', 'STATUS']].copy()

def color_status(val):
    if val == 'On Track':
        return 'color: #22c55e'
    elif val == 'At Risk':
        return 'color: #f59e0b'
    else:
        return 'color: #ef4444'

def color_gap(val):
    if isinstance(val, (int, float)):
        return 'color: #22c55e' if val >= 0 else 'color: #ef4444'
    return ''

styled = display_df.style.applymap(color_status, subset=['STATUS'])
styled = styled.applymap(color_gap, subset=['GAP'])
styled = styled.format({
    'SLA_TARGET': '{:.1%}',
    'ACHIEVED_FILL_RATE': '{:.1%}',
    'GAP': '{:+.1%}',
    'TOTAL_DEMAND': '{:,.0f}',
    'TOTAL_PLANNED': '{:,.0f}',
})
st.dataframe(styled, use_container_width=True, hide_index=True, height=350)

col_l, col_r = st.columns(2)

with col_l:
    st.subheader("Fill Rate vs. SLA Target")
    fig = make_dumbbell(
        compliance_df, y_col='CUSTOMER_NAME',
        target_col='SLA_TARGET', achieved_col='ACHIEVED_FILL_RATE',
        title='SLA Target (circle) vs. Achieved (diamond)', height=400,
    )
    st.plotly_chart(fig, use_container_width=True)

with col_r:
    st.subheader("Contract Volume Coverage")
    vol_df = compliance_df[['CUSTOMER_NAME', 'TOTAL_PLANNED', 'TOTAL_DEMAND']].copy()
    vol_df['GAP_VOL'] = (vol_df['TOTAL_DEMAND'] - vol_df['TOTAL_PLANNED']).clip(lower=0)
    vol_df['COVERED'] = vol_df['TOTAL_PLANNED'].clip(upper=vol_df['TOTAL_DEMAND'])

    fig = go.Figure()
    fig.add_trace(go.Bar(
        y=[str(v) for v in vol_df['CUSTOMER_NAME'].tolist()],
        x=[float(v) for v in vol_df['COVERED'].tolist()],
        orientation='h', name='Covered', marker_color='#29B5E8',
    ))
    fig.add_trace(go.Bar(
        y=[str(v) for v in vol_df['CUSTOMER_NAME'].tolist()],
        x=[float(v) for v in vol_df['GAP_VOL'].tolist()],
        orientation='h', name='Gap', marker_color='#FF6F61',
    ))
    fig.update_layout(barmode='stack', height=400, xaxis_title='Volume')
    fig = apply_dark_theme(fig)
    st.plotly_chart(fig, use_container_width=True)

st.subheader("Contract Item Detail")
contracts_df = cached_query(session, QUERY_CONTRACTS)
if not contracts_df.empty:
    for _, row in contracts_df.iterrows():
        cname = str(row['CUSTOMER_NAME'])
        cid = int(row['CONTRACT_ID'])
        comp_row = compliance_df[compliance_df['CUSTOMER_NAME'] == cname]
        status_str = str(comp_row.iloc[0]['STATUS']) if not comp_row.empty else 'Unknown'

        status_color = '#22c55e' if status_str == 'On Track' else '#f59e0b' if status_str == 'At Risk' else '#ef4444'
        st.markdown(
            f'<div style="background:#1e293b;padding:0.8rem;border-radius:8px;margin-bottom:0.5rem;">'
            f'<strong>{cname}</strong> &mdash; '
            f'SLA: {float(row["SERVICE_LEVEL_TARGET_FILL_RATE"]):.0%} &nbsp;|&nbsp; '
            f'Status: <span style="color:{status_color};font-weight:bold;">{status_str}</span>'
            f'</div>',
            unsafe_allow_html=True,
        )
        if st.checkbox(f"Show contract items for {cname}", key=f"cm_{cid}"):
            items_df = execute_query(session, QUERY_CONTRACT_ITEMS, {'contract_id': cid})
            if not items_df.empty:
                st.dataframe(
                    items_df[['PRODUCT_CODE', 'PRODUCT_FAMILY', 'MIN_ANNUAL_VOLUME',
                              'MAX_ANNUAL_VOLUME', 'AGREED_PRICE_PER_UNIT', 'PRIORITY_TIER']],
                    use_container_width=True, hide_index=True, height=200,
                )
