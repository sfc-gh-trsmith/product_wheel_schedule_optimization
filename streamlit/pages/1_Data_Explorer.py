import streamlit as st
from snowflake.snowpark.context import get_active_session
from utils.queries import (
    cached_query, execute_query, QUERY_DEMAND_LANDSCAPE, QUERY_DEMAND_TIMESERIES,
    QUERY_LINE_CAPABILITIES, QUERY_THROUGHPUT_DETAIL, QUERY_CALENDAR_GRID,
    QUERY_CHANGEOVER_MATRIX, QUERY_INVENTORY_SNAPSHOT, QUERY_CONTRACTS,
    QUERY_CONTRACT_ITEMS, QUERY_LINES_BY_PLANT,
)
from utils.charts import (
    make_heatmap, make_grouped_bar, make_stacked_bar, make_box, make_scatter,
    apply_dark_theme, SNOWFLAKE_COLORS,
)
import plotly.express as px
import plotly.graph_objects as go

st.set_page_config(page_title="Data Explorer", layout="wide")
session = get_active_session()

st.title("Data Explorer")
st.caption("Explore the source data that feeds the product wheel optimizer")

tab1, tab2, tab3, tab4, tab5 = st.tabs([
    "Demand Landscape", "Line Capabilities", "Changeover Matrix",
    "Inventory Snapshot", "Contracts & SLAs",
])

with tab1:
    st.subheader("Demand Landscape")
    dl_df = cached_query(session, QUERY_DEMAND_LANDSCAPE)
    if not dl_df.empty:
        c1, c2, c3 = st.columns(3)
        c1.metric("Total Demand Volume", f"{dl_df['TOTAL_FORECAST_QTY'].sum():,.0f}")
        c2.metric("Customer-Family Combos", str(len(dl_df)))

        ts_df = cached_query(session, QUERY_DEMAND_TIMESERIES)
        if not ts_df.empty:
            weeks = ts_df['FORECAST_WEEK_START'].nunique()
            c3.metric("Forecast Weeks", str(weeks))

        fig = make_heatmap(
            dl_df, x='PRODUCT_FAMILY', y='CUSTOMER_NAME', z='TOTAL_FORECAST_QTY',
            title='Customer x Product Family Demand', color_scale='Blues', height=400,
        )
        st.plotly_chart(fig, use_container_width=True)

        if not ts_df.empty:
            fig2 = px.area(
                ts_df, x='FORECAST_WEEK_START', y='FORECAST_QTY',
                color='PRODUCT_FAMILY', color_discrete_sequence=SNOWFLAKE_COLORS,
            )
            fig2.update_layout(
                title='Weekly Demand by Product Family',
                xaxis_title='Week', yaxis_title='Forecast Qty', height=350,
            )
            fig2 = apply_dark_theme(fig2)
            st.plotly_chart(fig2, use_container_width=True)

with tab2:
    st.subheader("Line Capabilities")
    lc_df = cached_query(session, QUERY_LINE_CAPABILITIES)
    if not lc_df.empty:
        st.dataframe(
            lc_df[['PLANT_NAME', 'LINE_CODE', 'LINE_NAME', 'LINE_TYPE',
                   'IS_ALLERGEN_DEDICATED_FLAG', 'PRODUCT_COUNT',
                   'AVG_RUN_RATE', 'MIN_RUN_RATE', 'MAX_RUN_RATE']],
            use_container_width=True, hide_index=True,
        )

    tp_df = cached_query(session, QUERY_THROUGHPUT_DETAIL)
    if not tp_df.empty:
        fig = make_box(tp_df, x='LINE_CODE', y='RUN_RATE_UNITS_PER_HOUR',
                       title='Run Rate Distribution by Line', height=350)
        st.plotly_chart(fig, use_container_width=True)

    cal_df = cached_query(session, QUERY_CALENDAR_GRID)
    if not cal_df.empty:
        status_map = {'available': 1, 'maintenance': 0.5, 'holiday': 0}
        cal_df['STATUS_NUM'] = cal_df['CALENDAR_STATUS'].map(status_map).fillna(0)
        fig = make_heatmap(cal_df, x='SLOT_DATE', y='LINE_CODE', z='STATUS_NUM',
                           title='Calendar Availability (1=available, 0.5=maintenance, 0=holiday)',
                           color_scale='RdYlGn', height=300)
        st.plotly_chart(fig, use_container_width=True)

with tab3:
    st.subheader("Changeover Matrix")
    lines_df = cached_query(session, QUERY_LINES_BY_PLANT)
    if not lines_df.empty:
        line_options = lines_df[['LINE_ID', 'LINE_CODE', 'PLANT_NAME']].copy()
        line_options['LABEL'] = line_options['PLANT_NAME'] + ' / ' + line_options['LINE_CODE']
        selected_label = st.selectbox("Select Line", line_options['LABEL'].tolist())
        selected_row = line_options[line_options['LABEL'] == selected_label].iloc[0]
        selected_line_id = int(selected_row['LINE_ID'])

        co_df = cached_query(session, QUERY_CHANGEOVER_MATRIX.replace('{line_id}', str(selected_line_id)))
        if not co_df.empty:
            mc1, mc2, mc3 = st.columns(3)
            mc1.metric("Avg Changeover (hrs)", f"{co_df['CHANGEOVER_TIME_HOURS'].mean():.2f}")
            mc2.metric("Min", f"{co_df['CHANGEOVER_TIME_HOURS'].min():.2f}")
            mc3.metric("Max", f"{co_df['CHANGEOVER_TIME_HOURS'].max():.2f}")

            fig = make_heatmap(
                co_df, x='TO_PRODUCT', y='FROM_PRODUCT', z='CHANGEOVER_TIME_HOURS',
                title='Changeover Time (Hours)', color_scale='YlOrRd', height=450,
            )
            st.plotly_chart(fig, use_container_width=True)

            top10 = co_df.nlargest(10, 'CHANGEOVER_TIME_HOURS').copy()
            top10['PAIR'] = top10['FROM_PRODUCT'] + ' -> ' + top10['TO_PRODUCT']
            fig2 = go.Figure(go.Bar(
                x=[float(v) for v in top10['CHANGEOVER_TIME_HOURS'].tolist()],
                y=[str(v) for v in top10['PAIR'].tolist()],
                orientation='h', marker_color='#FF6F61',
            ))
            fig2.update_layout(title='Top 10 Most Expensive Changeovers', height=350,
                               xaxis_title='Hours')
            fig2 = apply_dark_theme(fig2)
            st.plotly_chart(fig2, use_container_width=True)
        else:
            st.info("No changeover data for this line.")

with tab4:
    st.subheader("Inventory Snapshot")
    inv_df = cached_query(session, QUERY_INVENTORY_SNAPSHOT)
    if not inv_df.empty:
        inv_agg = inv_df.groupby(['PRODUCT_FAMILY', 'PLANT_NAME'])['ON_HAND_QTY'].sum().reset_index()
        fig = make_stacked_bar(
            inv_agg, x='ON_HAND_QTY', y='PRODUCT_FAMILY', color='PLANT_NAME',
            orientation='h', title='On-Hand Inventory by Product Family & Plant', height=350,
        )
        st.plotly_chart(fig, use_container_width=True)

        st.dataframe(
            inv_df[['PRODUCT_CODE', 'PRODUCT_FAMILY', 'PLANT_NAME',
                    'ON_HAND_QTY', 'SAFETY_STOCK_QTY', 'ON_ORDER_QTY']],
            use_container_width=True, hide_index=True, height=300,
        )

        scatter_df = inv_df.groupby('PRODUCT_CODE').agg(
            ON_HAND=('ON_HAND_QTY', 'sum'),
            SAFETY_STOCK=('SAFETY_STOCK_QTY', 'sum'),
            FAMILY=('PRODUCT_FAMILY', 'first'),
        ).reset_index()
        fig2 = px.scatter(
            scatter_df, x='SAFETY_STOCK', y='ON_HAND', color='FAMILY',
            hover_data=['PRODUCT_CODE'],
            color_discrete_sequence=SNOWFLAKE_COLORS,
        )
        max_val = max(scatter_df['ON_HAND'].max(), scatter_df['SAFETY_STOCK'].max(), 1)
        fig2.add_shape(type='line', x0=0, y0=0, x1=max_val, y1=max_val,
                       line=dict(dash='dash', color='#475569'))
        fig2.update_layout(
            title='On-Hand vs. Safety Stock (above line = overstocked)',
            xaxis_title='Safety Stock', yaxis_title='On-Hand Qty', height=400,
        )
        fig2 = apply_dark_theme(fig2)
        st.plotly_chart(fig2, use_container_width=True)

with tab5:
    st.subheader("Contracts & SLAs")
    con_df = cached_query(session, QUERY_CONTRACTS)
    if not con_df.empty:
        mc1, mc2, mc3 = st.columns(3)
        mc1.metric("Active Contracts", str(len(con_df)))
        mc2.metric("Avg SLA Target", f"{con_df['SERVICE_LEVEL_TARGET_FILL_RATE'].mean():.1%}")
        dos_targets = con_df['MAX_DAYS_OF_SUPPLY_TARGET'].dropna()
        if not dos_targets.empty:
            mc3.metric("DoS Target Range", f"{dos_targets.min():.0f} - {dos_targets.max():.0f} days")

        st.dataframe(
            con_df[['CUSTOMER_NAME', 'CUSTOMER_SEGMENT', 'CONTRACT_START_DATE',
                    'CONTRACT_END_DATE', 'SERVICE_LEVEL_TARGET_FILL_RATE',
                    'MAX_DAYS_OF_SUPPLY_TARGET', 'ITEM_COUNT', 'TOTAL_MIN_VOLUME']],
            use_container_width=True, hide_index=True,
        )

        for _, row in con_df.iterrows():
            cname = str(row['CUSTOMER_NAME'])
            cid = int(row['CONTRACT_ID'])
            with st.container():
                st.markdown(
                    f'<div style="background:#1e293b;padding:0.8rem;border-radius:8px;margin-bottom:0.5rem;">'
                    f'<strong>{cname}</strong> &mdash; SLA: {float(row["SERVICE_LEVEL_TARGET_FILL_RATE"]):.0%} '
                    f'| Items: {int(row["ITEM_COUNT"])} | Min Volume: {int(row.get("TOTAL_MIN_VOLUME", 0) or 0):,}'
                    f'</div>',
                    unsafe_allow_html=True,
                )
                if st.checkbox(f"Show items for {cname}", key=f"ci_{cid}"):
                    items_df = execute_query(session, QUERY_CONTRACT_ITEMS, {'contract_id': cid})
                    if not items_df.empty:
                        st.dataframe(
                            items_df[['PRODUCT_CODE', 'PRODUCT_FAMILY', 'MIN_ANNUAL_VOLUME',
                                      'MAX_ANNUAL_VOLUME', 'AGREED_PRICE_PER_UNIT', 'PRIORITY_TIER']],
                            use_container_width=True, hide_index=True, height=200,
                        )

        vol_df = con_df[['CUSTOMER_NAME', 'ITEM_COUNT', 'TOTAL_MIN_VOLUME']].copy()
        fig = make_grouped_bar(
            vol_df, x='CUSTOMER_NAME', y='TOTAL_MIN_VOLUME',
            title='Total Min Annual Volume by Customer', height=350,
        )
        fig.update_layout(xaxis_tickangle=-45)
        st.plotly_chart(fig, use_container_width=True)
