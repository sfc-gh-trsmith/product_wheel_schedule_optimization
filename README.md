# Product Wheel Schedule Optimization

End-to-end Snowflake AI Data Cloud demo for contract manufacturing product-wheel scheduling. Combines demand forecasting, production schedule optimization (MIP via PuLP/CBC), and interactive analytics using Snowpark ML, Cortex, Streamlit, and a React+FastAPI app deployed on SPCS.

## Problem

Contract manufacturers run thousands of SKUs for multiple brand-owner customers across shared production lines. Schedulers rely on manual heuristics to build "product wheels," resulting in excess inventory, missed fill-rate targets, and poor visibility into changeover/capacity/service-level trade-offs.

This demo unifies forecasted demand, contractual SLAs, and line constraints into an optimized, executable schedule.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Snowflake Account                    │
│                                                         │
│  ┌──────────┐   ┌──────────┐   ┌────────────────────┐  │
│  │   RAW    │   │  ATOMIC  │   │    DATA_MART       │  │
│  │  Stage   │──▶│ 16 tables│──▶│ Optimized schedule │  │
│  │ Notebook │   │ Dims+Facts│  │ KPIs, Enriched fcst│  │
│  └──────────┘   └──────────┘   └────────────────────┘  │
│                                                         │
│  ┌─────────────────┐  ┌───────────────────────────────┐ │
│  │  GPU Notebook   │  │   Streamlit App (SiS)         │ │
│  │  PuLP + cuOpt   │  │   5 pages + inline solver     │ │
│  │  (SPCS pool)    │  │                               │ │
│  └─────────────────┘  └───────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│             React + FastAPI App (Docker/SPCS)           │
│  Frontend: React 18, TypeScript, Vite, Tailwind, Plotly │
│  Backend:  FastAPI, snowflake-connector-python, SSE     │
│  Infra:    nginx reverse proxy, supervisord             │
└─────────────────────────────────────────────────────────┘
```

## Database: `PRODUCT_WHEEL_OPT`

| Schema | Contents |
|--------|----------|
| `RAW` | Stages, notebook, Streamlit app |
| `ATOMIC` | 16 dimension and fact tables (plants, lines, products, formulations, customers, contracts, demand forecasts, calendars, throughput, changeovers, inventory, production orders, costing, events) |
| `DATA_MART` | `FACT_LINE_SCHEDULE_OPTIMIZED` (slot-level schedule), `FACT_SERVICE_AND_SCHEDULE_KPI` (line × product family KPIs), `FACT_DEMAND_FORECAST_ENRICHED` (forecasts + prediction intervals), `SCENARIO_PARAMETERS`, `SCENARIO_COMPARISON` (view) |

## Prerequisites

- [Snowflake CLI (`snow`)](https://docs.snowflake.com/en/developer-guide/snowflake-cli/index) configured with a connection named `demo` (or pass `-c <name>`)
- Snowflake account with `SYSADMIN` and `ACCOUNTADMIN` roles
- GPU compute pool support (GPU_NV_S) for the notebook
- Docker (for the React app)
- Node.js 18+ and npm (for React frontend development)

## Deploy

```bash
# Full deploy: database + tables + seed data + GPU infra + notebook + Streamlit
./deploy.sh

# Deploy with a specific connection
./deploy.sh -c my_connection

# Deploy individual components
./deploy.sh --only-sql         # Database, tables, seed data, solver SP
./deploy.sh --only-notebook    # GPU compute pool + notebook
./deploy.sh --only-streamlit   # Streamlit app
```

The deploy script:
1. Creates the database, warehouse, schemas, and 16 ATOMIC tables
2. Seeds data via `SP_GENERATE_ALL_DATA()` (3 plants, 8 lines, ~50 SKUs, 10 customers)
3. Uploads PuLP wheel and creates the `SOLVE_LINE_SP` stored procedure
4. Creates a GPU compute pool and external access integration
5. Uploads and creates the optimization notebook
6. Deploys the Streamlit app to Snowflake

## Run

```bash
# Validate deployment (check row counts, table status)
./run.sh validate

# Execute the GPU optimization notebook and verify results
./run.sh main
```

`run.sh main` executes the notebook which:
- Generates demand forecasts with prediction intervals
- Runs MIP optimization (PuLP/CBC) across all 8 production lines
- Writes results to the 3 DATA_MART tables (~305 schedule rows, 48 KPIs, 596 enriched forecasts)

## Streamlit App

5-page app deployed to Snowflake (Streamlit in Snowflake):

| Page | Description |
|------|-------------|
| Executive Overview | KPI cards (fill rate, changeover hours, days of supply, contracts at risk) + trend charts |
| Data Explorer | Browse dimension and fact tables with filtering |
| Optimization Results | Gantt-style schedule visualization, production quantities, inventory trajectories |
| Scenario Studio | Interactive what-if analysis with inline CBC solver (no GPU required) |
| Contract Monitor | SLA compliance tracking, fill rate vs. target, volume coverage |

## React App

Full-featured React + FastAPI application with the same 5 pages, designed for Docker or SPCS deployment.

```bash
# Local development via Docker (port 5172)
./react/dev.sh

# Or run frontend + backend separately
cd react/frontend && npm install && npm run dev     # Frontend on :5173
cd react && uvicorn backend.api.main:app --port 8000  # Backend on :8000

# Deploy to SPCS
./react/spcs/deploy_spcs.sh
```

**Frontend**: React 18, TypeScript, Vite, Tailwind CSS, react-plotly.js, Zustand, TanStack Query/Table

**Backend**: FastAPI, snowflake-connector-python, SSE (for solver streaming)

## Clean

```bash
# Tear down everything: SP, notebook, compute pool, integrations, database, warehouse
./clean.sh
```

## Project Structure

```
├── deploy.sh                  # Full deployment script
├── run.sh                     # Run/validate script
├── clean.sh                   # Teardown script
├── DRD.md                     # Demo Requirements Document
├── sql/
│   ├── 01_setup.sql           # Database, warehouse, schemas, tables
│   ├── 02_seed_data.sql       # Data generation stored procedure
│   ├── 03_gpu_infra.sql       # Compute pool + external access
│   ├── 04_notebook.sql        # Notebook SQL (reference)
│   └── 05_solve_line_sp.sql   # MIP solver stored procedure
├── notebooks/
│   └── product_wheel_optimizer.ipynb  # GPU optimization notebook
├── streamlit/
│   ├── streamlit_app.py       # Main Streamlit entry point
│   ├── snowflake.yml          # Streamlit deployment config
│   ├── environment.yml        # Conda dependencies
│   ├── PuLP-2.9.0-py3-none-any.whl  # Bundled solver
│   ├── pages/                 # 4 sub-pages
│   └── utils/                 # queries.py, charts.py, solver.py
├── react/
│   ├── Dockerfile             # Multi-stage build
│   ├── dev.sh                 # Local Docker dev script
│   ├── nginx.conf             # Reverse proxy config
│   ├── supervisord.conf       # Process manager
│   ├── frontend/              # React + TypeScript + Vite
│   ├── backend/               # FastAPI + Snowflake connector
│   └── spcs/                  # SPCS deployment files
└── requirements/
    └── requirements.md        # Detailed data model spec
```
