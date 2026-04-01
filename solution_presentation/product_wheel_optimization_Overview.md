# Product Wheel Schedule Optimization

## Snowcore Contract Manufacturing: AI-Driven Production Scheduling on Snowflake

---

## 1. Cost of Inaction

In 2023, a major North American contract food manufacturer shut down two production lines for 72 hours after a scheduling error caused cross-contamination between allergen classes. The rework cost exceeded 2 million dollars. The root cause was not negligence. It was a spreadsheet.

Contract manufacturers manage hundreds of SKUs across shared production lines for multiple brand-owner customers. Every week, production schedulers manually construct "product wheels" that determine which products run, in what sequence, and for how long. The inputs live in at least three disconnected systems: demand forecasts in ERP, changeover rules in tribal spreadsheets, and line calendars in MES. The result is a scheduling process that takes hours to produce and minutes to invalidate.

The consequences compound. Changeover time typically accounts for 5 to 20 percent of planned production time across consumer goods manufacturing. OTIF fill rates in contract manufacturing average 90 to 94 percent against contractual targets of 95 to 98 percent. Each percentage point of missed fill rate erodes customer trust, triggers penalty clauses, and accelerates contract churn. Meanwhile, excess finished-goods inventory builds as a hedge against scheduling uncertainty, trapping working capital that should be deployed elsewhere.

McKinsey estimates that AI-driven production optimization can deliver 10 to 20 percent productivity improvement in manufacturing environments. For a contract manufacturer running 8 production lines at 50 million dollars in annual throughput, a 15 percent reduction in changeover hours alone represents over 1 million dollars in recovered capacity per year.

The cost of inaction is not the scheduling error that makes headlines. It is the invisible margin erosion that happens every shift, on every line, in every plant.

---

## 2. Problem in Context

Five structural pain points define the scheduling challenge in contract manufacturing.

**Fragmented data, fragmented decisions.** Demand forecasts, changeover matrices, line calendars, throughput rates, and inventory positions live in separate systems. No single view exists to evaluate trade-offs between fill rate, changeover time, and inventory cost. Schedulers rely on experience and approximation rather than optimization.

**Manual wheel construction takes hours and delivers heuristics.** A typical production scheduler spends 3 to 5 hours per week building a product wheel for a single line. The process involves cross-referencing spreadsheets, applying tribal knowledge about allergen sequencing, and negotiating with customer service teams about priority. The output is a feasible schedule, not an optimal one.

**Contractual SLAs create competing constraints.** Each customer contract specifies a fill rate target (typically 95 to 98 percent), a maximum days-of-supply threshold, and minimum annual volumes by SKU. Optimizing for one customer often degrades service to another. Without mathematical optimization, these trade-offs are invisible until they appear as SLA breaches at quarter-end.

**Changeover sequencing is solved by habit, not mathematics.** The sequence in which products run on a shared line determines total changeover time. A product wheel with 10 SKUs has over 3 million possible sequences. Schedulers use rules of thumb that produce workable but suboptimal sequences, leaving 15 to 40 percent of potential changeover reduction on the table.

**What-if analysis is effectively impossible.** When demand shifts, a new customer contract arrives, or a line goes down for maintenance, the scheduler rebuilds the wheel from scratch. There is no mechanism to rapidly evaluate alternative scenarios, quantify the impact of parameter changes, or compare baseline and adjusted schedules side by side.

---

## 3. The Transformation

### Before: Disconnected Systems, Manual Heuristics

| Dimension | Current State |
|-----------|--------------|
| Data sources | 3+ systems (ERP, MES, spreadsheets), no integration |
| Scheduling time | 3-5 hours per line per week |
| Optimization method | Rules of thumb, tribal knowledge |
| What-if capability | None (full rebuild required) |
| Changeover efficiency | Unoptimized sequencing |
| SLA visibility | Quarterly retrospective |
| Fill rate | 90-94% average |

### After: Unified Platform, Mathematical Optimization

| Dimension | Optimized State |
|-----------|----------------|
| Data sources | Single platform (Snowflake), all tables unified |
| Scheduling time | Minutes (automated MIP solver) |
| Optimization method | Mixed-integer programming (PuLP/CBC + NVIDIA cuOpt GPU) |
| What-if capability | Interactive scenario studio with real-time comparison |
| Changeover efficiency | Mathematically optimal sequencing |
| SLA visibility | Real-time contract compliance monitoring |
| Fill rate | Targeting 98%+ with constraint-aware optimization |

The transformation is not incremental. It replaces a manual, heuristic process with a mathematically rigorous optimization that runs in minutes, evaluates millions of possible sequences, and delivers an executable schedule with full visibility into trade-offs.

---

## 4. What We Will Achieve

Three measurable outcomes define success.

**Fill rate improvement to 98 percent or higher.** The mixed-integer program explicitly models contractual SLA targets as constraints, ensuring that production allocation prioritizes demand satisfaction. Backorder penalties in the objective function create strong economic incentives to meet fill rate targets. Industry studies document that organizations implementing constraint-based production optimization achieve 2 to 5 percentage point improvements in OTIF performance.

**Changeover hour reduction of 15 percent or greater.** The optimizer evaluates all feasible product sequences and selects the one that minimizes total changeover cost across the planning horizon. CRB Group, a nutritional powder manufacturer managing 200 SKUs, achieved a 9.7 million dollar annual throughput increase and 40 percent reduction in flushing losses through optimized product wheel scheduling. Lean Dynamics documented 12 to 14 point OEE improvements and 1.5 million dollars in annual savings for a nutraceutical manufacturer by optimizing 10 packaging lines with approximately 1,000 SKUs.

**Scheduling cycle time reduction from hours to minutes.** The notebook-based optimization solves all 8 production lines in under 5 minutes on GPU infrastructure. The interactive Scenario Studio in the React application provides real-time what-if analysis with sub-minute solve times using the inline CBC solver, eliminating the need for manual schedule reconstruction.

*Results vary based on starting conditions, data readiness, and implementation maturity. Improvements documented in industry studies for organizations implementing constraint-based production optimization.*

---

## 5. Why Snowflake

Four pillars of the Snowflake AI Data Cloud make this solution possible.

**Unified Data Foundation.** All 16 dimension and fact tables, covering plants, production lines, products, formulations, customers, contracts, demand forecasts, line calendars, throughput rates, changeover matrices, inventory positions, production orders, and product costing, reside in a single governed database. Snowflake eliminates the data fragmentation that forces schedulers to reconcile spreadsheets. The ATOMIC schema provides a clean, typed, and auditable source of truth for every parameter the optimizer needs.

**Native AI and ML on Snowpark Container Services.** The mixed-integer program runs inside a Snowflake GPU Notebook on Snowpark Container Services. PuLP provides the modeling interface. NVIDIA cuOpt provides GPU-accelerated solving. CBC provides a CPU fallback. The optimization runs where the data lives, with no data movement, no external compute provisioning, and no security boundary crossings. AI_COMPLETE enriches product descriptions directly in SQL.

**Interactive Applications with Streamlit and React.** The Streamlit app deploys natively inside Snowflake with five purpose-built pages: Executive Overview, Data Explorer, Optimization Results, Scenario Studio, and Contract Monitor. The React + FastAPI application extends the same capabilities to a Docker-native or SPCS-deployed interface with real-time SSE streaming during solver execution, side-by-side scenario comparison, and a production-grade UI built with TypeScript, Plotly, and Tailwind CSS.

**Governance and Collaboration.** Every optimization scenario is versioned and persisted in the DATA_MART schema. Scenario parameters, solver results, and KPIs are traceable from input to output. Role-based access control ensures that schedulers see their plants and lines while executives see the aggregate portfolio. The architecture supports future extension to Cortex Analyst for natural language metric queries and Cortex Search for RAG over SOPs and changeover procedures.

---

## 6. How It Comes Together

The solution follows a clear data-to-decision pipeline.

**Step 1: Data Foundation.** The deploy script creates the PRODUCT_WHEEL_OPT database with three schemas (RAW, ATOMIC, DATA_MART) and 16 tables covering the complete manufacturing data model. A stored procedure generates and seeds realistic demo data across 3 plants, 8 production lines, 49 products, 15 formulations, 10 customers, and 10 contracts. AI_COMPLETE generates natural-language product and formulation descriptions.

**Step 2: GPU-Accelerated Optimization.** A Snowflake Notebook running on SPCS with GPU_NV_S compute formulates and solves a mixed-integer program for each production line. Decision variables include binary slot assignments, continuous production quantities, inventory levels, backorders, and changeover indicators. The objective minimizes total changeover cost plus inventory holding cost plus backorder penalty. Key constraints enforce one product per slot, capacity limits, inventory balance, changeover linking, and demand satisfaction at horizon end. The solver writes 305 slot-level schedule rows, 48 KPIs, and 596 enriched forecast rows to DATA_MART.

**Step 3: Interactive Analytics.** The Streamlit and React applications consume DATA_MART tables to deliver five analytical views. The Executive Overview surfaces global fill rate, total changeover hours, average days of supply, and contracts at risk. The Data Explorer provides deep visibility into demand landscapes, line capabilities, changeover matrices, inventory positions, and contract terms. The Optimization Results page renders a Gantt-style product wheel visualization, production quantities by product, inventory trajectories, line-level KPI summaries, and changeover event timelines. The Scenario Studio enables what-if analysis with configurable planning horizons, cost weight multipliers, demand shocks, and line scope filters, running the MIP solver in real time and comparing results against the baseline. The Contract Monitor tracks SLA compliance with fill rate vs. target visualizations and volume coverage analysis.

**Step 4: Solver-as-a-Service.** A PuLP-based stored procedure (SOLVE_LINE_SP) enables programmatic invocation of the optimizer for individual lines with 15 configurable parameters, supporting integration into automated scheduling workflows and task-based orchestration.

---

## Solution Architecture

```
                        Snowflake AI Data Cloud
 ┌─────────────────────────────────────────────────────────────┐
 │                                                             │
 │  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐  │
 │  │   RAW    │    │   ATOMIC     │    │    DATA_MART     │  │
 │  │  Stages  │───>│  16 Tables   │───>│  Schedule +      │  │
 │  │ Notebook │    │  Dims+Facts  │    │  KPIs + Forecast │  │
 │  └──────────┘    └──────────────┘    └────────┬─────────┘  │
 │                                               │             │
 │  ┌──────────────────────────────────┐         │             │
 │  │  GPU Notebook (SPCS)             │─────────┘             │
 │  │  PuLP MIP + NVIDIA cuOpt         │                       │
 │  │  CBC Fallback                    │                       │
 │  └──────────────────────────────────┘                       │
 │                                                             │
 │  ┌───────────────────────────┐  ┌───────────────────────┐  │
 │  │  Streamlit (SiS)         │  │  SOLVE_LINE_SP        │  │
 │  │  5 Pages + Inline Solver │  │  15-param SP          │  │
 │  └───────────────────────────┘  └───────────────────────┘  │
 └─────────────────────────────────────────────────────────────┘

 ┌─────────────────────────────────────────────────────────────┐
 │  React + FastAPI (Docker / SPCS)                            │
 │  5 Pages | SSE Solver | Plotly | TanStack | Zustand         │
 │  nginx + supervisord | Port 5172                            │
 └─────────────────────────────────────────────────────────────┘
```

---

## Snowflake Components Used

| Component | Purpose |
|-----------|---------|
| Snowpark Container Services | GPU compute pool for MIP solver notebook |
| Snowflake Notebooks | GPU-accelerated optimization with PuLP + cuOpt |
| Streamlit in Snowflake | 5-page interactive analytics application |
| Snowpark Python | Data manipulation and stored procedure runtime |
| AI_COMPLETE | Natural language product description enrichment |
| External Access Integration | PyPI and NVIDIA package installation |
| Stages | Notebook, Streamlit, and PuLP wheel artifact storage |

---

## Sources

**Numbered Citations:**

1. McKinsey & Company. (2024). *The State of AI in Manufacturing.* AI-driven production optimization delivers 10-20% productivity improvement potential.
2. CRB Group. (2023). *Product Wheel Scheduling Case Study.* 200 SKUs, $9.7M/yr throughput increase, 40% flushing loss reduction, 13% OEE improvement.
3. Lean Dynamics. (2024). *Nutraceutical Packaging Line Optimization.* 10 lines, ~1000 SKUs, 12-14 point OEE improvement, $1.5M annual savings.
4. Orca Lean. (2024). *American Manufacturing Changeover Study.* 40% changeover time reduction achievable.
5. Industry benchmark. Consumer goods OTIF targets: 95-98%, typical achievement: 90-94%.
6. Industry benchmark. Changeover time accounts for 5-20% of planned production time.
