Demo Requirements Document (DRD): Snowcore Contract Manufacturing Product Wheel Optimization  
GITHUB REPO NAME: product_wheel_schedule_optimization  
GITHUB REPO DESCRIPTION: End-to-end Snowflake AI Data Cloud demo for contract manufacturing product-wheel scheduling, combining demand forecasting, production schedule optimization, and agentic decision support using Snowpark ML, PuLP, Cortex, and Streamlit.

---

1. Strategic Overview  
Problem Statement: Global contract manufacturers like “Snowcore Contract Manufacturing” run thousands of SKUs for multiple brand-owner customers across a limited set of shared lines. Demand forecasts live in ERP, changeover rules in tribal spreadsheets, and line calendars in MES. Production schedulers rely on manual heuristics to build “product wheels,” resulting in excess inventory, missed fill-rate targets in customer contracts, and poor visibility into the trade-offs between changeover time, capacity, and service levels. There is no unified, data-driven optimization that links forecasted demand, contractual SLAs, and line constraints into an executable schedule.

Target Business Goals (KPIs):  
- Increase on-time, in-full (OTIF) fill rate for contract customers to ≥ 98% while honoring line constraints.  
- Reduce finished-goods days-of-supply by 20% for targeted formulations without increasing stockouts.  
- Reduce total changeover hours per line by 15% through optimized product-wheel sequencing.

The "Wow" Moment: A planner opens a Streamlit app, asks in natural language, “What should Line 2 at the Snowcore East plant run next week to hit 98% fill rate for premium wet food customers while minimizing changeover time?”, and within seconds sees an optimized product wheel schedule, visualized by slot, with projected fill rate, inventory trajectory, and changeover time, plus an interactive explanation of why the model chose that sequence.

---

2. User Personas & Stories  

Persona Level | Role Title | Key User Story (Demo Flow)  
---|---|---  
Strategic | VP, Contract Manufacturing & Customer Operations | “As a VP, I want to see customer-level fill rate, inventory days of supply, and changeover-driven capacity loss across all plants so I can prioritize capex, pricing, and contract renewals.”  
Operational | Production Scheduler / Plant Manager | “As a Production Scheduler, I want an automatically generated, machine-validated product wheel for each line that meets contractual demand, respects changeover and allergen rules, and shows the impact on fill rate and inventory so I can release a feasible plan every week.”  
Technical | Manufacturing Data Scientist / Process Engineer | “As a Data Scientist, I want to use Snowpark ML and optimization libraries to correlate forecast error, changeover patterns, and line utilization with service-level performance and then generate improved wheel sequences that are stored, versioned, and re-runnable directly in Snowflake.”

---

3. Data Architecture & Snowpark ML (Backend)  

Structured Data (Inferred Schema):

- DIM_PRODUCT (ATOMIC.DIM_PRODUCT):  
  - Grain: One row per finished-good SKU.  
  - Columns: product_id (PK), product_code, product_description, formulation_id, brand_id, package_size_uom, shelf_life_days, product_family.

- DIM_FORMULATION (ATOMIC.DIM_FORMULATION):  
  - Grain: One row per formulation (recipe).  
  - Columns: formulation_id (PK), formulation_code, formulation_description, allergen_class, processing_family.

- DIM_CUSTOMER (ATOMIC.DIM_CUSTOMER):  
  - Grain: One row per contract manufacturing customer.  
  - Columns: customer_id (PK), customer_code, customer_name, customer_segment.

- DIM_PLANT (ATOMIC.DIM_PLANT):  
  - Grain: One row per manufacturing site.  
  - Columns: plant_id (PK), plant_code, plant_name, timezone, region.

- DIM_PRODUCTION_LINE (ATOMIC.DIM_PRODUCTION_LINE):  
  - Grain: One row per physical line.  
  - Columns: line_id (PK), plant_id, line_code, line_name, line_type, is_allergen_dedicated_flag.

- FACT_CONTRACT (ATOMIC.FACT_CONTRACT):  
  - Grain: One row per manufacturing contract with a customer.  
  - Columns: contract_id (PK), customer_id, contract_start_date, contract_end_date, service_level_target_fill_rate, max_days_of_supply_target.

- FACT_CONTRACT_ITEM (ATOMIC.FACT_CONTRACT_ITEM):  
  - Grain: One row per contract–product combination.  
  - Columns: contract_item_id (PK), contract_id, product_id, min_annual_volume, max_annual_volume, agreed_price_per_unit, priority_tier.

- FACT_DEMAND_FORECAST (ATOMIC.FACT_DEMAND_FORECAST):  
  - Grain: One row per customer, product, and planning bucket (for example, week).  
  - Columns: forecast_id (PK), customer_id, product_id, forecast_week_start, forecast_week_end, forecast_qty, forecast_version, source_system.

- FACT_LINE_CALENDAR (ATOMIC.FACT_LINE_CALENDAR):  
  - Grain: One row per line and time slot (for example, day or shift).  
  - Columns: line_calendar_id (PK), line_id, time_slot_start, time_slot_end, available_hours, calendar_status (available / maintenance / holiday).

- FACT_LINE_PRODUCT_THROUGHPUT (ATOMIC.FACT_LINE_PRODUCT_THROUGHPUT):  
  - Grain: One row per line–product (or line–formulation) pairing.  
  - Columns: line_product_id (PK), line_id, product_id, run_rate_units_per_hour, min_run_hours_per_campaign, max_run_hours_per_slot.

- FACT_LINE_PRODUCT_CHANGEOVER (ATOMIC.FACT_LINE_PRODUCT_CHANGEOVER):  
  - Grain: One row per line and ordered pair of products (or formulations).  
  - Columns: changeover_id (PK), line_id, from_product_id, to_product_id, changeover_time_hours, changeover_cost.

- FACT_INVENTORY_POSITION (ATOMIC.FACT_INVENTORY_POSITION):  
  - Grain: One row per product, plant (or warehouse), and snapshot timestamp.  
  - Columns: inventory_snapshot_id (PK), product_id, plant_id, snapshot_timestamp, on_hand_qty, on_order_qty, safety_stock_qty.

- FACT_PRODUCTION_ORDER (ATOMIC.FACT_PRODUCTION_ORDER):  
  - Grain: One row per production order / batch.  
  - Columns: prod_order_id (PK), plant_id, line_id, product_id, planned_start_time, planned_end_time, planned_qty, order_status, source_system.

- FACT_PRODUCT_COSTING (ATOMIC.FACT_PRODUCT_COSTING):  
  - Grain: One row per product, cost version, and plant (optional).  
  - Columns: product_cost_id (PK), product_id, cost_version, plant_id, material_cost_per_unit, conversion_cost_per_unit, packaging_cost_per_unit, overhead_cost_per_unit, standard_margin_per_unit.

Unstructured Data (Tribal Knowledge):  
- Source Material: Standard operating procedures for cleaning and changeover, allergen control procedures, maintenance logs, production playbooks, customer SLAs and contracts (PDF), and scheduler spreadsheets describing informal wheels and rules of thumb.  
- Purpose: Used to answer qualitative questions like “Why is this changeover so long?”, “What are the required steps between poultry and grain-free formulations?”, or “What does the Acme Pet contract require for fill rate and minimum volume?” via Cortex Search and RAG, complementing the quantitative schedule.

ML Notebook Specification:  
- Objective: Weekly demand forecasting by customer–SKU and schedule cost estimation to drive product-wheel optimization.  
- Target Variable: `forecast_qty` in ATOMIC.FACT_DEMAND_FORECAST (trained against historical shipments and orders).  
- Algorithm Choice: Gradient boosted trees or Prophet-style time series (Snowpark ML Forecasting) with hierarchical features (customer, product_family, plant) and calendar effects; optimization cost model implemented via PuLP in the same notebook.  
- Inference Output:  
  - Forecasts written to `DATA_MART.FACT_DEMAND_FORECAST_ENRICHED` with columns (customer_id, product_id, week_start, week_end, forecast_qty, prediction_interval_low, prediction_interval_high, model_version).  
  - Schedule optimization outputs written to `DATA_MART.FACT_LINE_SCHEDULE_OPTIMIZED` with columns (scenario_id, line_id, time_slot_start, time_slot_end, product_id, planned_qty, projected_fill_rate, projected_inventory_qty, total_changeover_time_hours, objective_cost).

---

4. Cortex Intelligence Specifications  

Cortex Analyst (Structured Data / SQL)  

- Semantic Model Scope:  
  - Measures:  
    - `fill_rate` (OTIF percentage by customer, product, and horizon).  
    - `inventory_days_of_supply` (on_hand_qty ÷ average daily demand).  
    - `changeover_hours` (sum of changeover_time_hours from optimized schedule vs. historical).  
  - Dimensions:  
    - `customer_name` (from DIM_CUSTOMER).  
    - `plant_name` and `line_code` (from DIM_PLANT and DIM_PRODUCTION_LINE).  
    - `product_family` or `formulation_code` (from DIM_PRODUCT / DIM_FORMULATION).  

- Golden Query (Verification):  
  - User Prompt: “Show me last month’s average fill rate and total changeover hours by plant and line for premium wet food SKUs, and highlight where fill rate was below 97%.”  
  - Expected SQL Operation:  
    - `SELECT plant_name, line_code, product_family, AVG(fill_rate) AS avg_fill_rate, SUM(changeover_hours) AS total_changeover_hours FROM DATA_MART.FACT_SERVICE_AND_SCHEDULE_KPI WHERE month = '2025-03' AND product_family = 'Premium Wet Food' GROUP BY plant_name, line_code, product_family;`

Cortex Search (Unstructured Data / RAG)  

- Service Name: CONTRACT_MFG_SEARCH_SERVICE  
- Indexing Strategy:  
  - Index: SOPs, cleaning procedures, changeover checklists, customer SLA documents, and maintenance logs.  
  - Document Attribute: `doc_type` (SOP, SLA, Playbook), `plant_id`, `line_id`, `customer_id`, and `formulation_id` to enable filtering by line, customer, and formulation.  
- Sample RAG Prompt:  
  - “According to our SOPs, what are the required cleaning steps and minimum wait time when switching Line 2 from poultry-based formulations to grain-free formulations at the Snowcore East plant, and how might that affect the recommended product wheel for next week?”

---

5. Streamlit Application UX/UI  

Layout Strategy:  
- Page 1 (Executive Overview):  
  - KPI cards for: global fill rate, total changeover hours this month, finished-goods days of supply by product family, and number of contracts at risk of missing SLA.  
  - Trend charts for fill rate and changeover hours over time by plant.  
  - A natural language “Ask the Analyst” panel powered by Cortex Analyst for quick metric questions.  

- Page 2 (Wheel Optimization & Action):  
  - Line selector (plant + line + week/ horizon).  
  - Gantt-style visualization of the optimized product wheel by time slot, color-coded by product family, overlaid with changeover events.  
  - Side-by-side comparison of “Current Schedule vs. Optimized Schedule” for KPIs (fill rate, inventory days of supply, changeover hours, margin).  
  - Chat interface to toggle between structured and unstructured intelligence:
    - “Analyst” mode (Cortex Analyst): answers numeric questions like “What happens to fill rate if I drop SKU X from next week’s wheel on Line 3?”.
    - “Search” mode (Cortex Search): answers procedural questions like “What are the cleaning requirements if I move SKU Y earlier in the sequence?”.  
  - Action buttons to write back selected optimized scenarios to `DATA_MART.FACT_LINE_SCHEDULE_OPTIMIZED` as “Approved” for execution.

Component Logic:  
- Visualizations:  
  - Altair (or Plotly) Gantt/heatmap of product vs. time slot by line to show wheel structure and highlight long changeovers.  
  - Bar charts comparing changeover hours and projected OTIF before/after optimization by line and customer.  
  - Scatterplots of demand volatility vs. assigned wheel position to illustrate how optimization stabilizes service levels.  
- Chat Integration:  
  - A tabbed pane with two tabs: “Metrics Chat (Analyst)” and “Docs Chat (Search)”.  
  - In “Metrics Chat,” user prompts are routed to Cortex Analyst backed by the semantic view; results are rendered both as numbers and charts.  
  - In “Docs Chat,” user prompts are routed to CONTRACT_MFG_SEARCH_SERVICE, returning cited text snippets from SOPs and SLAs, displayed alongside any impacted schedule slots (for example, highlighting which changeovers must be lengthened).  

---

6. Success Criteria  

- Technical Validator: The system ingests updated forecast and inventory data, runs the Snowpark ML forecast and PuLP-based schedule optimization for a single week and 3–5 lines, and returns an optimized wheel and KPI visualizations in the Streamlit app in under 3 seconds for ad-hoc analytic queries and under 5 minutes for a full weekly optimization run.  
- Business Validator: The combined forecasting, optimization, and agentic workflow reduces the time for planners to generate and validate a weekly line schedule from multiple hours of spreadsheet work to under 15 minutes, while demonstrating simulated improvements of at least +2 percentage points in fill rate and a 10–20% reduction in changeover hours for selected Snowcore contract customers.
