Below is a **minimal atomic data model** and a **Snowcore scenario** tuned for contract manufacturing and product-wheel optimization, and mappable to common **MES (Manufacturing Execution System)** and **ERP (Enterprise Resource Planning)** entities.

---

### 1. High-level Snowcore Contract Manufacturing scenario

- **Company**: Snowcore Contract Manufacturing (SCM).
- **Business**:
  - Produces wet and dry pet food and treats for multiple brand owners.
  - Operates 3 plants, each with several canning / retort / packaging lines.
  - Customers sign multi-year **manufacturing contracts** with service-level targets:
    - Minimum volume by formulation.
    - Target fill rate by finished good.
    - Maximum inventory days of supply.
- **Operational reality**:
  - Thousands of stock keeping units sharing a few hundred base formulations.
  - Lines are formulation-specific; some are flexible, some are dedicated.
  - Changeovers between formulations are long and costly (cleaning, allergen controls).
  - Schedulers currently:
    - Use heuristics and spreadsheets.
    - Build informal “wheels” to rotate through formulations.
- **Optimization use case**:
  - For a given planning horizon (for example, 4 weeks by day or shift), SCM wants to:
    - Sequence SKUs on each line as a product wheel.
    - Respect changeover rules (allergens, can size, viscosity).
    - Respect contract volumes and fill-rate targets by customer.
    - Minimize changeover and inventory costs and missed-demand penalties.

---

### 2. Minimal atomic data model (tables and grain)

#### 2.1 Product and formulation (ERP / PLM / MES)

1) **DIM_PRODUCT**
- Grain:
  - One row per finished good SKU.
- Key fields:
  - `product_id` (PK, surrogate).
  - `product_code` (ERP item number).
  - `product_description`.
  - `formulation_id` (FK → DIM_FORMULATION).
  - `package_size_uom` (for example, 13oz, 3kg).
  - `brand_id` (FK → DIM_CUSTOMER or separate brand dim).
  - `shelf_life_days`.
- Source:
  - ERP item master, product lifecycle management (if present).

2) **DIM_FORMULATION**
- Grain:
  - One row per formulation (recipe).
- Key fields:
  - `formulation_id` (PK).
  - `formulation_code` (for example, “CHICKEN_RICE_BASE_01”).
  - `formulation_description`.
  - `allergen_class` (for example, “contains poultry”, “grain-free”).
  - `viscosity_class` or `processing_family` (for line capability grouping).
- Source:
  - ERP / PLM / MES recipe master.

3) **DIM_FORMULATION_COMPONENT**
- Grain:
  - One row per component in a formulation bill of materials.
- Key fields:
  - `formulation_id` (FK).
  - `component_id` (FK → DIM_COMPONENT, optional for this optimization).
  - `component_seq`.
  - `quantity_per_batch`.
  - `uom`.
- Source:
  - ERP BOM or PLM formulation.

*(For the scheduling optimization, you mainly use formulation-level attributes, but atomic components allow extension to raw-material constraints later.)*

---

#### 2.2 Customer, contract, and demand (ERP)

4) **DIM_CUSTOMER**
- Grain:
  - One row per contract manufacturing customer.
- Key fields:
  - `customer_id` (PK).
  - `customer_code` (ERP account).
  - `customer_name`.
  - `customer_segment` (for example, “premium retail”, “private label”).
- Source:
  - ERP customer master.

5) **FACT_CONTRACT**
- Grain:
  - One row per manufacturing contract per customer.
- Key fields:
  - `contract_id` (PK).
  - `customer_id` (FK).
  - `contract_start_date`.
  - `contract_end_date`.
  - `service_level_target_fill_rate` (for example, 0.98).
  - `max_days_of_supply_target`.
- Source:
  - ERP contract / agreement module, legal repository.

6) **FACT_CONTRACT_ITEM**
- Grain:
  - One row per contract–product combination.
- Key fields:
  - `contract_item_id` (PK).
  - `contract_id` (FK).
  - `product_id` (FK).
  - `min_annual_volume` (for example, cases/year).
  - `max_annual_volume` or soft cap.
  - `agreed_price_per_unit`.
- Source:
  - ERP sales / contract line items.

7) **FACT_DEMAND_FORECAST**
- Grain:
  - One row per customer, product, and planning bucket (for example, week).
- Key fields:
  - `forecast_id` (PK).
  - `customer_id`.
  - `product_id`.
  - `forecast_bucket_start_date` (for example, week start).
  - `forecast_bucket_end_date`.
  - `forecast_qty` (units or cases for that bucket).
  - `forecast_version` (for scenario comparison).
- Source:
  - ERP demand planning module, external forecasting, or Snowflake ML output.

---

#### 2.3 Resources, lines, and routings (MES / ERP routing)

8) **DIM_PLANT**
- Grain:
  - One row per manufacturing site.
- Key fields:
  - `plant_id` (PK).
  - `plant_code`.
  - `plant_name`.
  - `timezone`.
- Source:
  - ERP plant master.

9) **DIM_PRODUCTION_LINE**
- Grain:
  - One row per physical production line.
- Key fields:
  - `line_id` (PK).
  - `plant_id` (FK).
  - `line_code`.
  - `line_name`.
  - `line_type` (for example, “retort”, “pouch”, “can”).
  - `is_allergen_dedicated_flag`.
- Source:
  - MES line master, ERP work-center master.

10) **FACT_LINE_CALENDAR**
- Grain:
  - One row per line and time slot (for example, day or shift).
- Key fields:
  - `line_calendar_id` (PK).
  - `line_id` (FK).
  - `time_slot_start` (timestamp / datetime).
  - `time_slot_end`.
  - `available_hours` (numeric, capacity for scheduling).
  - `calendar_status` (for example, “available”, “maintenance”, “holiday”).
- Source:
  - MES line calendar, ERP capacity calendar, maintenance planning.

11) **FACT_LINE_PRODUCT_THROUGHPUT**
- Grain:
  - One row per line and product (or formulation) combination.
- Key fields:
  - `line_product_id` (PK).
  - `line_id` (FK).
  - `product_id` (FK) or `formulation_id` (if you plan at formulation level).
  - `run_rate_units_per_hour`.
  - `max_run_hours_per_slot` (optional).
  - `min_run_hours_per_campaign` (optional).
- Source:
  - MES historical performance, standard routing, or engineering standards.

12) **FACT_LINE_PRODUCT_CHANGEOVER**
- Grain:
  - One row per ordered pair of products (or formulations) on a given line.
- Key fields:
  - `changeover_id` (PK).
  - `line_id` (FK).
  - `from_product_id` (FK) or `from_formulation_id`.
  - `to_product_id` (FK) or `to_formulation_id`.
  - `changeover_time_hours`.
  - `changeover_cost` (optional, or derive from time × line-hour cost).
- Source:
  - MES / engineering standards, changeover matrix maintained by operations.

*(These two tables are the direct physical source for `rate` and `changeCost` in the PuLP model.)*

---

#### 2.4 Inventory and execution (ERP / MES)

13) **FACT_INVENTORY_POSITION**
- Grain:
  - One row per product, location (plant or warehouse), and time bucket (for example, end-of-day).
- Key fields:
  - `inventory_snapshot_id` (PK).
  - `product_id` (FK).
  - `location_id` (FK → DIM_PLANT or DIM_LOCATION if extended).
  - `snapshot_timestamp`.
  - `on_hand_qty`.
  - `on_order_qty` (optional).
  - `safety_stock_qty` (optional).
- Source:
  - ERP inventory, warehouse management system, or nightly snapshots.

14) **FACT_PRODUCTION_ORDER**
- Grain:
  - One row per production order (batch) in MES/ERP.
- Key fields:
  - `prod_order_id` (PK).
  - `plant_id`.
  - `line_id`.
  - `product_id`.
  - `planned_start_time`.
  - `planned_end_time`.
  - `planned_qty`.
  - `order_status` (for example, “planned”, “released”, “completed”).
- Source:
  - ERP production order / process order tables.

15) **FACT_PRODUCTION_EVENT**
- Grain:
  - One row per actual production event (for example, batch completion) from MES.
- Key fields:
  - `production_event_id` (PK).
  - `prod_order_id` (FK).
  - `line_id`.
  - `product_id`.
  - `event_start_time`.
  - `event_end_time`.
  - `actual_qty`.
  - `scrap_qty`.
- Source:
  - MES batch records, shift reports.

*(For optimization, you primarily need initial inventory and historicals to estimate throughput and validate solutions.)*

---

#### 2.5 Profitability and cost (ERP / finance)

16) **FACT_PRODUCT_COSTING**
- Grain:
  - One row per product and cost version (and optionally plant).
- Key fields:
  - `product_cost_id` (PK).
  - `product_id` (FK).
  - `cost_version` (for example, fiscal year or standard-cost run identifier).
  - `plant_id` (FK, optional).
  - `material_cost_per_unit`.
  - `conversion_cost_per_unit`.
  - `packaging_cost_per_unit`.
  - `overhead_cost_per_unit`.
  - `standard_margin_per_unit` (if price is known).
- Source:
  - ERP costing module, margin reporting.

*(This feeds the optimization if you want to prioritize higher-margin SKUs under tight capacity.)*

---

### 3. How this feeds the product wheel optimization

- **Demand inputs**:
  - From `FACT_DEMAND_FORECAST` aggregated to the optimization time buckets and joined to `DIM_PRODUCT` and `DIM_CUSTOMER`.
- **Initial inventory**:
  - From `FACT_INVENTORY_POSITION` at the start of the horizon.
- **Line capacity and calendar**:
  - From `FACT_LINE_CALENDAR` (hours by line and slot).
- **Throughput rates**:
  - From `FACT_LINE_PRODUCT_THROUGHPUT` (units/hour).
- **Changeover matrix**:
  - From `FACT_LINE_PRODUCT_CHANGEOVER` by line and ordered product pairs.
- **Cost parameters**:
  - Inventory and backorder penalties derived from `FACT_PRODUCT_COSTING` and service-level policies in `FACT_CONTRACT` / `FACT_CONTRACT_ITEM`.

---

### 4. Minimal subset if you must start very small

For a first demo or proof of concept, you can get away with:

- **Core dimensions**:
  - `DIM_PRODUCT`
  - `DIM_PLANT`
  - `DIM_PRODUCTION_LINE`
- **Core facts**:
  - `FACT_DEMAND_FORECAST`
  - `FACT_LINE_CALENDAR`
  - `FACT_LINE_PRODUCT_THROUGHPUT`
  - `FACT_LINE_PRODUCT_CHANGEOVER`
  - `FACT_INVENTORY_POSITION`
  - (Optional) `FACT_PRODUCT_COSTING` for cost-based objective.

Then add contracts, formulations, and execution events as you expand beyond the initial scheduling optimization and into full commercial and operations analytics.


Below is a concise, generic **PuLP model design** for a **single-line product wheel schedule optimizer**, aligned to the Snowcore requirements but reusable for other manufacturers.

---

### 1. Problem framing (aligned to Snowcore)

Target:

- Input:
  - **Demand forecast** by stock keeping unit (SKU) and time bucket.   
  - **Line capacity and throughput** by SKU and time bucket.   
  - **Changeover matrix**: time or cost to switch from SKU i to SKU j on a given line.   
  - **Profit or margin** per SKU (optional, for profit-based objective).   
- Output:
  - **Sequence** of SKUs on a given line across a set of discrete time slots, plus production quantities in each slot.  
  - Objective: minimize a weighted combination of **changeover cost**, **inventory cost**, and **unmet demand penalty**, or maximize profit.   

Product wheel alignment:

- Treat a “wheel” as a **repeating sequence of time slots** on a line.
- Start with a **finite horizon** (for example, 2–4 weeks of slots), then later:
  - Enforce that the **first and last slot** connect (cyclic).
  - Or precompute a “canonical” order using a separate changeover-only model and reuse that order each cycle.

---

### 2. Sets and indices

- Lines:
  - \( L \): set of lines.
  - For this first version, focus on **one line** \( l \in L \); multi-line extension is straightforward.
- Products:
  - \( P \): set of SKUs.
- Time buckets in the wheel:
  - \( T = \{1, \dots, T_{\max}\} \): ordered time slots on the line (for example, 8-hour blocks, days, or “runs”).

---

### 3. Parameters (generic, Snowcore-friendly)

You can map these to Snowflake semantic views (for example, `demand_forecast`, `line_capacity`, `changeover_matrix`, `sku_profitability`).   

Per line \( l \), product \( p \), time slot \( t \):

- \( d_{p,t} \): demand quantity for product \( p \) that must be satisfied by the end of time slot \( t \).
- \( cap_{l,t} \): available run time on line \( l \) in time slot \( t \) (for example, hours).
- \( rate_{l,p} \): production rate of product \( p \) on line \( l \) (for example, units per hour).
- \( invCost_p \): inventory holding cost per unit of product \( p \) per slot.
- \( backorderCost_p \): penalty cost per unit of unmet demand for product \( p \).
- \( changeCost_{p,q} \): cost of changing from product \( p \) in the previous slot to product \( q \) in the current slot.
  - Could be **time converted to cost** (for example, changeover hours × line cost per hour).
- Optional:
  - \( minRunTime_p \): minimum run time for product \( p \) when it is scheduled.
  - \( maxRunTime_p \): maximum run time per visit (if needed).
  - \( profit_p \): contribution margin per unit; if you want to maximize profit instead of minimize cost.

---

### 4. Decision variables

For each line \( l \), product \( p \), time slot \( t \):

- **Production quantity**  
  - \( q_{l,p,t} \ge 0 \): quantity of product \( p \) produced on line \( l \) in slot \( t \).
- **Slot assignment**  
  - \( y_{l,p,t} \in \{0,1\} \): 1 if slot \( t \) on line \( l \) runs product \( p \), else 0.  
- **Changeover indicator**  
  - \( z_{l,p,q,t} \in \{0,1\} \): 1 if slot \( t-1 \) runs product \( p \) and slot \( t \) runs product \( q \) on line \( l \), else 0.  
- **Inventory and unmet demand (backorders)**  
  - \( inv_{p,t} \ge 0 \): inventory position for product \( p \) at end of slot \( t \).  
  - \( bo_{p,t} \ge 0 \): unmet demand (backorder) for product \( p \) at end of slot \( t \).  

---

### 5. Objective function (cost-minimizing version)

Minimize total cost over the horizon:

\[
\text{Minimize } 
\sum_{p,t} invCost_p \cdot inv_{p,t}
+ \sum_{p,t} backorderCost_p \cdot bo_{p,t}
+ \sum_{l,t \ge 2} \sum_{p,q} changeCost_{p,q} \cdot z_{l,p,q,t}
\]

You can switch to **profit maximization** by adding revenue or margin for produced quantities and subtracting costs.

---

### 6. Constraints

1. **Slot assignment: one product per slot per line**

\[
\sum_{p} y_{l,p,t} \le 1 \quad \forall l, t
\]

2. **Capacity constraint on each line and slot**

\[
\sum_{p} \frac{q_{l,p,t}}{rate_{l,p}} 
\le cap_{l,t} \quad \forall l, t
\]

Also enforce minimum run if used:

\[
\frac{q_{l,p,t}}{rate_{l,p}} \ge minRunTime_p \cdot y_{l,p,t} \quad \forall l,p,t
\]

3. **Inventory balance with demand and production**

Let \( inv_{p,0} \) be given starting inventory.

For each product and slot:

\[
inv_{p,t-1} + \sum_l q_{l,p,t} = d_{p,t} + inv_{p,t} - bo_{p,t} \quad \forall p,t
\]

(You can adjust to cumulative demand, but this form keeps it flexible.)

4. **Changeover linking constraints**

For each line \( l \), time slot \( t \ge 2 \), products \( p,q \):

- Upper bounds linking \( z \) to \( y \):

\[
z_{l,p,q,t} \le y_{l,p,t-1} \quad \forall l,p,q,t \ge 2
\]
\[
z_{l,p,q,t} \le y_{l,q,t} \quad \forall l,p,q,t \ge 2
\]

- Ensure exactly one predecessor–successor combination is chosen when there is a product in the slot:

\[
\sum_{p,q} z_{l,p,q,t} = \sum_q y_{l,q,t} \quad \forall l,t \ge 2
\]

(If you always use exactly one product per slot, the right-hand side can be 1.)

5. **Wheel closure (optional but recommended)**

If you want a strict wheel (cycle), link the **last slot** back to the **first slot**:

\[
z_{l,p,q,1}^{\text{wrap}} \le y_{l,p,T_{\max}} \quad \forall l,p,q
\]
\[
z_{l,p,q,1}^{\text{wrap}} \le y_{l,q,1} \quad \forall l,p,q
\]
\[
\sum_{p,q} z_{l,p,q,1}^{\text{wrap}} = \sum_q y_{l,q,1}
\]

Then add wrap-around changeover cost for \( t = 1 \) in the objective.

6. **Demand satisfaction policy**

- If you want **hard demand satisfaction** by horizon end:

\[
bo_{p,T_{\max}} = 0 \quad \forall p
\]

- Or penalize backorders via the objective and allow them if capacity is tight.

---

### 7. PuLP code skeleton

Below is a compact Python / PuLP skeleton for a **single line**. Extend to multiple lines by adding index `l` and looping over lines.

```python
import pulp as pl

# -------------------------
# Sets
# -------------------------
products = list(P)        # SKU list
time_slots = list(T)      # [1, 2, ..., T_max]

# -------------------------
# Parameters (provided as dicts)
# -------------------------
demand = {(p, t): ...}           # d_{p,t}
capacity = {t: ...}              # cap_{t} for this line
rate = {p: ...}                  # rate_{p}
inv_cost = {p: ...}              # invCost_p
bo_cost = {p: ...}               # backorderCost_p
change_cost = {(p, q): ...}      # changeCost_{p,q}
inv0 = {p: ...}                  # starting inventory inv_{p,0}
min_run_time = {p: 0.0 for p in products}  # optional

# -------------------------
# Model
# -------------------------
model = pl.LpProblem("Product_Wheel_Single_Line", pl.LpMinimize)

# -------------------------
# Decision variables
# -------------------------
q = pl.LpVariable.dicts("q", (products, time_slots), lowBound=0)
y = pl.LpVariable.dicts("y", (products, time_slots), lowBound=0, upBound=1, cat="Binary")
inv = pl.LpVariable.dicts("inv", (products, time_slots), lowBound=0)
bo = pl.LpVariable.dicts("bo", (products, time_slots), lowBound=0)

# z for internal transitions (t >= 2)
z = pl.LpVariable.dicts("z", (products, products, time_slots[1:]), lowBound=0, upBound=1, cat="Binary")

# Optional wrap-around z for wheel closure
z_wrap = pl.LpVariable.dicts("z_wrap", (products, products), lowBound=0, upBound=1, cat="Binary")

# -------------------------
# Objective
# -------------------------
changeover_cost_expr = pl.lpSum(
    change_cost[(p, q)] * z[p][q][t]
    for p in products
    for q in products
    for t in time_slots[1:]  # t >= 2
)

wrap_cost_expr = pl.lpSum(
    change_cost[(p, q)] * z_wrap[p][q]
    for p in products
    for q in products
)

inv_cost_expr = pl.lpSum(
    inv_cost[p] * inv[p][t]
    for p in products
    for t in time_slots
)

bo_cost_expr = pl.lpSum(
    bo_cost[p] * bo[p][t]
    for p in products
    for t in time_slots
)

model += changeover_cost_expr + wrap_cost_expr + inv_cost_expr + bo_cost_expr

# -------------------------
# Constraints
# -------------------------

# 1) One product per slot
for t in time_slots:
    model += pl.lpSum(y[p][t] for p in products) <= 1, f"one_product_slot_{t}"

# 2) Capacity per slot
for t in time_slots:
    model += pl.lpSum(q[p][t] / rate[p] for p in products) <= capacity[t], f"capacity_{t}"
    for p in products:
        if min_run_time[p] > 0:
            model += q[p][t] / rate[p] >= min_run_time[p] * y[p][t], f"min_run_{p}_{t}"

# 3) Inventory balance
for p in products:
    for idx, t in enumerate(time_slots):
        if idx == 0:
            prev_inv = inv0[p]
        else:
            prev_inv = inv[p][time_slots[idx - 1]]

        model += prev_inv + pl.lpSum(q[p][t]) == demand[(p, t)] + inv[p][t] - bo[p][t], f"inv_bal_{p}_{t}"

# 4) Changeover linking for t >= 2
for idx, t in enumerate(time_slots):
    if idx == 0:
        continue
    prev_t = time_slots[idx - 1]

    # z <= y constraints
    for p in products:
        for q in products:
            model += z[p][q][t] <= y[p][prev_t], f"z_le_prev_{p}_{q}_{t}"
            model += z[p][q][t] <= y[q][t],      f"z_le_cur_{p}_{q}_{t}"

    # exactly one predecessor-successor if a product runs in slot t
    model += pl.lpSum(z[p][q][t] for p in products for q in products) == \
             pl.lpSum(y[q][t] for q in products), f"trans_count_{t}"

# 5) Wheel closure (wrap last slot to first slot)
first_t = time_slots[0]
last_t = time_slots[-1]

for p in products:
    for q in products:
        model += z_wrap[p][q] <= y[p][last_t], f"wrap_le_last_{p}_{q}"
        model += z_wrap[p][q] <= y[q][first_t], f"wrap_le_first_{p}_{q}"

model += pl.lpSum(z_wrap[p][q] for p in products for q in products) == \
         pl.lpSum(y[q][first_t] for q in products), "wrap_count"

# Optional: enforce no backorders at end of horizon
for p in products:
    model += bo[p][last_t] == 0, f"no_bo_end_{p}"

# -------------------------
# Solve
# -------------------------
model.solve(pl.PULP_CBC_CMD(msg=False))
```

---

### 8. Making this generic and reusable (Snowcore and beyond)

- **Data layer** (Snowflake):
  - Create semantic views for:
    - `vw_demand_forecast(sku_id, week, qty)`
    - `vw_line_capacity(line_id, time_slot, hours)`
    - `vw_changeover_matrix(line_id, from_sku, to_sku, changeover_hours)`
    - `vw_sku_costs(sku_id, inv_cost, backorder_cost, margin)`
- **Model runner**:
  - Use Snowpark Python to:
    - Query these views into pandas dataframes.
    - Build PuLP parameters (`demand`, `capacity`, `change_cost`, etc.).
    - Run PuLP and write results back to a `vw_line_schedule` table:
      - `(line_id, time_slot, sku_id, qty, changeover_flag, inv_level, bo_level)`.
- **Product wheel refinement**:
  - Optional two-stage pattern:
    - Stage 1: solve a **pure sequence problem** (minimize changeover cost only) to get a canonical wheel order.
    - Stage 2: fix that order and only optimize **run lengths / cycle frequency** against demand.

This design matches the Snowcore conceptual requirements (demand forecast, line capacity, changeover constraints, profitability) while remaining generic enough for other manufacturers.

