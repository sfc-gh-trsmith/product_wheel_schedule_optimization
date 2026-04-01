import plotly.express as px
import plotly.graph_objects as go

DARK_THEME = dict(
    paper_bgcolor='#0f172a',
    plot_bgcolor='#0f172a',
    font=dict(color='#e2e8f0', size=12),
    hoverlabel=dict(bgcolor='#1e293b', bordercolor='#334155'),
    margin=dict(l=40, r=20, t=40, b=40),
)

SNOWFLAKE_COLORS = ['#29B5E8', '#11567F', '#64D2FF', '#FF6F61', '#6B8E23', '#DA70D6']

FAMILY_COLORS = {
    'Premium Wet Food': '#29B5E8',
    'Standard Dry Food': '#11567F',
    'Grain-Free': '#64D2FF',
    'Organic': '#6B8E23',
    'Treats & Snacks': '#FF6F61',
    'Veterinary Diet': '#DA70D6',
}


def apply_dark_theme(fig):
    fig.update_layout(**DARK_THEME)
    return fig


def make_gantt(df, y_col='LINE_CODE', color_col='PRODUCT_FAMILY'):
    if df.empty:
        fig = go.Figure()
        fig.add_annotation(text="No schedule data", showarrow=False, font=dict(size=16))
        return apply_dark_theme(fig)

    fig = px.timeline(
        df,
        x_start='TIME_SLOT_START',
        x_end='TIME_SLOT_END',
        y=y_col,
        color=color_col,
        color_discrete_map=FAMILY_COLORS,
        hover_data=['PRODUCT_CODE', 'PLANNED_QTY', 'PROJECTED_FILL_RATE',
                    'TOTAL_CHANGEOVER_TIME_HOURS'],
    )
    fig.update_yaxes(autorange='reversed')
    fig.update_layout(xaxis_title='Time', yaxis_title='Production Line', height=400)
    return apply_dark_theme(fig)


def make_grouped_bar(df, x, y, color=None, barmode='group', orientation='v',
                     title=None, xaxis_title=None, yaxis_title=None, height=350):
    fig = px.bar(
        df, x=x, y=y, color=color, barmode=barmode, orientation=orientation,
        color_discrete_sequence=SNOWFLAKE_COLORS,
    )
    fig.update_layout(
        title=title, xaxis_title=xaxis_title, yaxis_title=yaxis_title,
        height=height, showlegend=color is not None,
    )
    return apply_dark_theme(fig)


def make_stacked_bar(df, x, y, color, orientation='h', title=None, height=350):
    fig = px.bar(
        df, x=x, y=y, color=color, barmode='stack', orientation=orientation,
        color_discrete_sequence=SNOWFLAKE_COLORS,
    )
    fig.update_layout(title=title, height=height)
    return apply_dark_theme(fig)


def make_heatmap(df, x, y, z, title=None, color_scale='Blues', height=350):
    pivot = df.pivot_table(index=y, columns=x, values=z, aggfunc='sum').fillna(0)
    fig = go.Figure(data=go.Heatmap(
        z=pivot.values.tolist(),
        x=[str(c) for c in pivot.columns.tolist()],
        y=[str(r) for r in pivot.index.tolist()],
        colorscale=color_scale,
        hoverongaps=False,
    ))
    fig.update_layout(title=title, height=height, xaxis_title=str(x), yaxis_title=str(y))
    return apply_dark_theme(fig)


def make_waterfall(categories, values, title=None, height=350):
    measures = ['absolute'] + ['relative'] * (len(values) - 2) + ['total']
    if len(values) < 3:
        measures = ['absolute'] * len(values)
    fig = go.Figure(go.Waterfall(
        x=categories,
        y=values,
        measure=measures,
        connector=dict(line=dict(color='#475569')),
        increasing=dict(marker=dict(color='#29B5E8')),
        decreasing=dict(marker=dict(color='#FF6F61')),
        totals=dict(marker=dict(color='#11567F')),
    ))
    fig.update_layout(title=title, height=height, showlegend=False)
    return apply_dark_theme(fig)


def make_radar(baseline_dict, scenario_dict, labels, title=None, height=400):
    fig = go.Figure()
    fig.add_trace(go.Scatterpolar(
        r=list(baseline_dict.values()),
        theta=labels,
        fill='toself',
        name='Baseline',
        line_color='#475569',
    ))
    fig.add_trace(go.Scatterpolar(
        r=list(scenario_dict.values()),
        theta=labels,
        fill='toself',
        name='New Scenario',
        line_color='#29B5E8',
    ))
    fig.update_layout(
        polar=dict(
            bgcolor='#0f172a',
            radialaxis=dict(visible=True, gridcolor='#334155'),
            angularaxis=dict(gridcolor='#334155'),
        ),
        title=title, height=height, showlegend=True,
    )
    return apply_dark_theme(fig)


def make_dumbbell(df, y_col, target_col, achieved_col, title=None, height=400):
    fig = go.Figure()
    for _, row in df.iterrows():
        color = '#22c55e' if float(row[achieved_col] or 0) >= float(row[target_col] or 0) else '#ef4444'
        y_val = str(row[y_col])
        fig.add_trace(go.Scatter(
            x=[float(row[target_col] or 0), float(row[achieved_col] or 0)],
            y=[y_val, y_val],
            mode='lines',
            line=dict(color=color, width=2),
            showlegend=False,
        ))
    if not df.empty:
        fig.add_trace(go.Scatter(
            x=[float(v) for v in df[target_col].tolist()],
            y=[str(v) for v in df[y_col].tolist()],
            mode='markers', marker=dict(symbol='circle', size=10, color='#94a3b8'),
            name='SLA Target',
        ))
        fig.add_trace(go.Scatter(
            x=[float(v) for v in df[achieved_col].tolist()],
            y=[str(v) for v in df[y_col].tolist()],
            mode='markers', marker=dict(symbol='diamond', size=10, color='#29B5E8'),
            name='Achieved',
        ))
    fig.update_layout(
        title=title, xaxis_title='Fill Rate', height=height,
        xaxis=dict(range=[0, 1.1], tickformat='.0%'),
    )
    return apply_dark_theme(fig)


def make_scatter(df, x, y, color=None, title=None, height=350):
    fig = px.scatter(
        df, x=x, y=y, color=color,
        color_discrete_sequence=SNOWFLAKE_COLORS,
    )
    fig.update_layout(title=title, height=height)
    return apply_dark_theme(fig)


def make_line(df, x, y, color=None, title=None, height=350):
    fig = px.line(
        df, x=x, y=y, color=color,
        color_discrete_sequence=SNOWFLAKE_COLORS,
    )
    fig.update_layout(title=title, height=height)
    return apply_dark_theme(fig)


def make_box(df, x, y, title=None, height=350):
    fig = px.box(
        df, x=x, y=y,
        color_discrete_sequence=SNOWFLAKE_COLORS,
    )
    fig.update_layout(title=title, height=height)
    return apply_dark_theme(fig)
