------------------------------------------------------------------------
-- 02_seed_data.sql
-- Product Wheel Schedule Optimization - Data Generation Stored Procedures
-- All data is generated server-side on Snowflake via stored procedures.
------------------------------------------------------------------------

USE ROLE SYSADMIN;
USE WAREHOUSE PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_WH;
USE DATABASE PRODUCT_WHEEL_OPT;
USE SCHEMA ATOMIC;

CREATE OR REPLACE PROCEDURE PRODUCT_WHEEL_OPT.ATOMIC.SP_GENERATE_ALL_DATA()
RETURNS STRING
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'main'
EXECUTE AS CALLER
AS
$$
import random
import json
from datetime import datetime, timedelta
from snowflake.snowpark import Session

SEED = 42

PLANTS = [
    (1, 'SCM-EAST', 'Snowcore East', 'America/New_York', 'Northeast'),
    (2, 'SCM-CENTRAL', 'Snowcore Central', 'America/Chicago', 'Midwest'),
    (3, 'SCM-WEST', 'Snowcore West', 'America/Los_Angeles', 'West Coast'),
]

LINES = [
    (1, 1, 'E-LINE-1', 'East Retort Line 1', 'retort', False),
    (2, 1, 'E-LINE-2', 'East Can Line 2', 'can', False),
    (3, 1, 'E-LINE-3', 'East Pouch Line 3', 'pouch', True),
    (4, 2, 'C-LINE-1', 'Central Retort Line 1', 'retort', False),
    (5, 2, 'C-LINE-2', 'Central Can Line 2', 'can', False),
    (6, 3, 'W-LINE-1', 'West Retort Line 1', 'retort', False),
    (7, 3, 'W-LINE-2', 'West Can Line 2', 'can', True),
    (8, 3, 'W-LINE-3', 'West Pouch Line 3', 'pouch', False),
]

FORMULATIONS = [
    (1, 'CHKN_RICE_01', 'Chicken and Rice Base Formula', 'contains poultry', 'wet_retort'),
    (2, 'BEEF_VEG_01', 'Beef and Vegetable Base Formula', 'contains beef', 'wet_retort'),
    (3, 'LAMB_RICE_01', 'Lamb and Rice Base Formula', 'contains lamb', 'wet_retort'),
    (4, 'SALMON_PEA_01', 'Salmon and Pea Grain-Free Formula', 'grain-free fish', 'wet_retort'),
    (5, 'TURKEY_SWP_01', 'Turkey and Sweet Potato Formula', 'contains poultry', 'wet_retort'),
    (6, 'DUCK_LENTIL_01', 'Duck and Lentil Grain-Free Formula', 'grain-free poultry', 'wet_can'),
    (7, 'VENISON_PMP_01', 'Venison and Pumpkin Limited Ingredient', 'novel protein', 'wet_can'),
    (8, 'WHITEFISH_01', 'Whitefish and Potato Formula', 'contains fish', 'wet_can'),
    (9, 'CHKN_LIVER_01', 'Chicken Liver Pate Formula', 'contains poultry', 'wet_pouch'),
    (10, 'TUNA_SHRIMP_01', 'Tuna and Shrimp Seafood Medley', 'contains shellfish', 'wet_pouch'),
    (11, 'DRY_CHKN_01', 'Dry Chicken and Brown Rice Kibble', 'contains poultry', 'dry_kibble'),
    (12, 'DRY_SALMON_01', 'Dry Salmon and Sweet Potato Kibble', 'grain-free fish', 'dry_kibble'),
    (13, 'TREAT_CHKN_01', 'Chicken Jerky Treat', 'contains poultry', 'treat'),
    (14, 'TREAT_BEEF_01', 'Beef Bites Training Treat', 'contains beef', 'treat'),
    (15, 'GRAINFREE_MIX_01', 'Grain-Free Multi-Protein Blend', 'grain-free mixed', 'wet_retort'),
]

CUSTOMERS = [
    (1, 'CUST-001', 'Acme Pet Nutrition', 'premium retail'),
    (2, 'CUST-002', 'PawPerfect Brands', 'premium retail'),
    (3, 'CUST-003', 'ValuePet Co', 'private label'),
    (4, 'CUST-004', 'NatureFresh Pet Foods', 'premium retail'),
    (5, 'CUST-005', 'BudgetBowl Inc', 'private label'),
    (6, 'CUST-006', 'GourmetPaws LLC', 'specialty'),
    (7, 'CUST-007', 'PetMart Store Brands', 'private label'),
    (8, 'CUST-008', 'WildHarvest Pet Co', 'premium retail'),
    (9, 'CUST-009', 'TailWaggers Nutrition', 'specialty'),
    (10, 'CUST-010', 'FreshBite Organics', 'premium retail'),
]

PRODUCT_FAMILIES = [
    'Premium Wet Food', 'Standard Wet Food', 'Grain-Free Wet Food',
    'Dry Kibble', 'Treats and Snacks', 'Limited Ingredient Diet',
]

PACKAGE_SIZES = ['5.5oz', '13oz', '3oz pouch', '12oz', '24oz', '5lb', '15lb', '6oz bag']

COMPONENTS = [
    'Chicken Meal', 'Beef Meal', 'Lamb Meal', 'Salmon Meal', 'Turkey Meal',
    'Brown Rice', 'Sweet Potato', 'Peas', 'Lentils', 'Potatoes',
    'Chicken Fat', 'Fish Oil', 'Flaxseed', 'Sunflower Oil',
    'Vitamin Premix', 'Mineral Premix', 'Taurine', 'Probiotics',
    'Carrageenan', 'Guar Gum', 'Water', 'Natural Flavor',
    'Pumpkin', 'Cranberries', 'Blueberries', 'Spinach',
]

def main(session: Session) -> str:
    random.seed(SEED)
    results = []

    results.append(seed_dim_plant(session))
    results.append(seed_dim_production_line(session))
    results.append(seed_dim_formulation(session))
    results.append(seed_dim_customer(session))
    results.append(seed_dim_product(session))
    results.append(seed_dim_formulation_component(session))
    results.append(seed_fact_contract(session))
    results.append(seed_fact_contract_item(session))
    results.append(seed_fact_demand_forecast(session))
    results.append(seed_fact_line_calendar(session))
    results.append(seed_fact_line_product_throughput(session))
    results.append(seed_fact_line_product_changeover(session))
    results.append(seed_fact_inventory_position(session))
    results.append(seed_fact_production_order(session))
    results.append(seed_fact_production_event(session))
    results.append(seed_fact_product_costing(session))
    results.append(generate_ai_descriptions(session))

    return ' | '.join(results)


def truncate_table(session, table_name):
    session.sql(f"TRUNCATE TABLE IF EXISTS PRODUCT_WHEEL_OPT.ATOMIC.{table_name}").collect()


def seed_dim_plant(session):
    truncate_table(session, 'DIM_PLANT')
    rows = []
    for p in PLANTS:
        rows.append(f"SELECT {p[0]}, '{p[1]}', '{p[2]}', '{p[3]}', '{p[4]}'")
    sql = f"INSERT INTO PRODUCT_WHEEL_OPT.ATOMIC.DIM_PLANT {' UNION ALL '.join(rows)}"
    session.sql(sql).collect()
    return f"DIM_PLANT: {len(PLANTS)}"


def seed_dim_production_line(session):
    truncate_table(session, 'DIM_PRODUCTION_LINE')
    rows = []
    for l in LINES:
        rows.append(f"SELECT {l[0]}, {l[1]}, '{l[2]}', '{l[3]}', '{l[4]}', {str(l[5]).upper()}")
    sql = f"INSERT INTO PRODUCT_WHEEL_OPT.ATOMIC.DIM_PRODUCTION_LINE {' UNION ALL '.join(rows)}"
    session.sql(sql).collect()
    return f"DIM_PRODUCTION_LINE: {len(LINES)}"


def seed_dim_formulation(session):
    truncate_table(session, 'DIM_FORMULATION')
    rows = []
    for f in FORMULATIONS:
        desc = f[2].replace("'", "''")
        rows.append(f"SELECT {f[0]}, '{f[1]}', '{desc}', '{f[3]}', '{f[4]}'")
    sql = f"INSERT INTO PRODUCT_WHEEL_OPT.ATOMIC.DIM_FORMULATION {' UNION ALL '.join(rows)}"
    session.sql(sql).collect()
    return f"DIM_FORMULATION: {len(FORMULATIONS)}"


def seed_dim_customer(session):
    truncate_table(session, 'DIM_CUSTOMER')
    rows = []
    for c in CUSTOMERS:
        rows.append(f"SELECT {c[0]}, '{c[1]}', '{c[2]}', '{c[3]}'")
    sql = f"INSERT INTO PRODUCT_WHEEL_OPT.ATOMIC.DIM_CUSTOMER {' UNION ALL '.join(rows)}"
    session.sql(sql).collect()
    return f"DIM_CUSTOMER: {len(CUSTOMERS)}"


def seed_dim_product(session):
    truncate_table(session, 'DIM_PRODUCT')
    products = []
    pid = 1
    for form in FORMULATIONS:
        num_skus = random.choice([2, 3, 4, 5])
        for _ in range(num_skus):
            brand_id = random.choice([c[0] for c in CUSTOMERS])
            pkg = random.choice(PACKAGE_SIZES)
            shelf = random.randint(180, 730)
            family = random.choice(PRODUCT_FAMILIES)
            code = f"SKU-{pid:04d}"
            desc = f"{form[2]} - {pkg}"
            products.append((pid, code, desc, form[0], brand_id, pkg, shelf, family))
            pid += 1
            if pid > 50:
                break
        if pid > 50:
            break

    rows = []
    for p in products:
        desc = p[2].replace("'", "''")
        fam = p[7].replace("'", "''")
        rows.append(f"SELECT {p[0]}, '{p[1]}', '{desc}', {p[3]}, {p[4]}, '{p[5]}', {p[6]}, '{fam}'")
    sql = f"INSERT INTO PRODUCT_WHEEL_OPT.ATOMIC.DIM_PRODUCT {' UNION ALL '.join(rows)}"
    session.sql(sql).collect()
    return f"DIM_PRODUCT: {len(products)}"


def seed_dim_formulation_component(session):
    truncate_table(session, 'DIM_FORMULATION_COMPONENT')
    rows = []
    comp_id = 1
    for form in FORMULATIONS:
        num_components = random.randint(4, 7)
        selected = random.sample(COMPONENTS, num_components)
        for seq, comp in enumerate(selected, 1):
            qty = round(random.uniform(0.5, 30.0), 2)
            uom = random.choice(['kg', 'lb', 'g'])
            comp_name = comp.replace("'", "''")
            rows.append(f"SELECT {comp_id}, {form[0]}, {comp_id}, {seq}, '{comp_name}', {qty}, '{uom}'")
            comp_id += 1

    sql = f"INSERT INTO PRODUCT_WHEEL_OPT.ATOMIC.DIM_FORMULATION_COMPONENT {' UNION ALL '.join(rows)}"
    session.sql(sql).collect()
    return f"DIM_FORMULATION_COMPONENT: {comp_id - 1}"


def seed_fact_contract(session):
    truncate_table(session, 'FACT_CONTRACT')
    rows = []
    for i, c in enumerate(CUSTOMERS, 1):
        fill_target = round(random.uniform(0.93, 0.99), 2)
        dos_target = random.choice([14, 21, 28, 30, 45])
        rows.append(
            f"SELECT {i}, {c[0]}, '2025-01-01'::DATE, '2027-12-31'::DATE, {fill_target}, {dos_target}"
        )
    sql = f"INSERT INTO PRODUCT_WHEEL_OPT.ATOMIC.FACT_CONTRACT {' UNION ALL '.join(rows)}"
    session.sql(sql).collect()
    return f"FACT_CONTRACT: {len(CUSTOMERS)}"


def seed_fact_contract_item(session):
    truncate_table(session, 'FACT_CONTRACT_ITEM')
    product_count = 50
    rows = []
    item_id = 1
    for contract_id in range(1, len(CUSTOMERS) + 1):
        num_items = random.randint(5, 12)
        product_ids = random.sample(range(1, product_count + 1), min(num_items, product_count))
        for prod_id in product_ids:
            min_vol = random.randint(5000, 50000)
            max_vol = min_vol + random.randint(10000, 100000)
            price = round(random.uniform(1.50, 8.00), 2)
            tier = random.choice([1, 1, 2, 2, 3])
            rows.append(
                f"SELECT {item_id}, {contract_id}, {prod_id}, {min_vol}, {max_vol}, {price}, {tier}"
            )
            item_id += 1
    sql = f"INSERT INTO PRODUCT_WHEEL_OPT.ATOMIC.FACT_CONTRACT_ITEM {' UNION ALL '.join(rows)}"
    session.sql(sql).collect()
    return f"FACT_CONTRACT_ITEM: {item_id - 1}"


def seed_fact_demand_forecast(session):
    truncate_table(session, 'FACT_DEMAND_FORECAST')
    base_date = datetime(2026, 3, 30)
    product_count = 50
    customer_count = 10
    weeks = 4
    rows = []
    fid = 1

    customer_products = {}
    for cust_id in range(1, customer_count + 1):
        num_prods = random.randint(8, 20)
        customer_products[cust_id] = random.sample(range(1, product_count + 1), min(num_prods, product_count))

    for week_offset in range(weeks):
        ws = base_date + timedelta(weeks=week_offset)
        we = ws + timedelta(days=6)
        ws_str = ws.strftime('%Y-%m-%d')
        we_str = we.strftime('%Y-%m-%d')
        for cust_id, prod_list in customer_products.items():
            for prod_id in prod_list:
                qty = round(random.uniform(50, 5000), 0)
                rows.append(
                    f"SELECT {fid}, {cust_id}, {prod_id}, '{ws_str}'::DATE, '{we_str}'::DATE, {qty}, 'v1', 'ERP_DEMAND'"
                )
                fid += 1

    batch_size = 500
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        sql = f"INSERT INTO PRODUCT_WHEEL_OPT.ATOMIC.FACT_DEMAND_FORECAST {' UNION ALL '.join(batch)}"
        session.sql(sql).collect()
        total += len(batch)

    return f"FACT_DEMAND_FORECAST: {total}"


def seed_fact_line_calendar(session):
    truncate_table(session, 'FACT_LINE_CALENDAR')
    base_date = datetime(2026, 3, 30)
    days = 28
    shifts_per_day = 3
    shift_hours = 8.0
    rows = []
    cal_id = 1

    for line in LINES:
        for d in range(days):
            day = base_date + timedelta(days=d)
            for shift in range(shifts_per_day):
                start = day + timedelta(hours=shift * shift_hours)
                end = start + timedelta(hours=shift_hours)
                status = 'available'
                avail = shift_hours
                if random.random() < 0.05:
                    status = 'maintenance'
                    avail = 0.0
                elif day.weekday() == 6 and shift == 2:
                    status = 'holiday'
                    avail = 0.0
                start_str = start.strftime('%Y-%m-%d %H:%M:%S')
                end_str = end.strftime('%Y-%m-%d %H:%M:%S')
                rows.append(
                    f"SELECT {cal_id}, {line[0]}, '{start_str}'::TIMESTAMP_NTZ, '{end_str}'::TIMESTAMP_NTZ, {avail}, '{status}'"
                )
                cal_id += 1

    batch_size = 500
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        sql = f"INSERT INTO PRODUCT_WHEEL_OPT.ATOMIC.FACT_LINE_CALENDAR {' UNION ALL '.join(batch)}"
        session.sql(sql).collect()
        total += len(batch)

    return f"FACT_LINE_CALENDAR: {total}"


def seed_fact_line_product_throughput(session):
    truncate_table(session, 'FACT_LINE_PRODUCT_THROUGHPUT')
    product_count = 50
    rows = []
    lp_id = 1

    line_type_to_families = {
        'retort': ['wet_retort'],
        'can': ['wet_can', 'wet_retort'],
        'pouch': ['wet_pouch', 'treat'],
    }

    for line in LINES:
        lt = line[4]
        compatible_families = line_type_to_families.get(lt, ['wet_retort'])
        compatible_forms = [f[0] for f in FORMULATIONS if f[4] in compatible_families]
        form_to_products = {}
        for pid in range(1, product_count + 1):
            fid = FORMULATIONS[min(pid - 1, len(FORMULATIONS) - 1) % len(FORMULATIONS)][0]
            if fid not in form_to_products:
                form_to_products[fid] = []
            form_to_products[fid].append(pid)

        for fid in compatible_forms:
            prods = form_to_products.get(fid, [])
            for prod_id in prods:
                rate = round(random.uniform(100, 800), 1)
                min_run = round(random.uniform(1.0, 3.0), 1)
                max_run = round(random.uniform(6.0, 8.0), 1)
                rows.append(
                    f"SELECT {lp_id}, {line[0]}, {prod_id}, {rate}, {min_run}, {max_run}"
                )
                lp_id += 1

    sql = f"INSERT INTO PRODUCT_WHEEL_OPT.ATOMIC.FACT_LINE_PRODUCT_THROUGHPUT {' UNION ALL '.join(rows)}"
    session.sql(sql).collect()
    return f"FACT_LINE_PRODUCT_THROUGHPUT: {lp_id - 1}"


def seed_fact_line_product_changeover(session):
    truncate_table(session, 'FACT_LINE_PRODUCT_CHANGEOVER')
    rows = []
    co_id = 1

    allergen_classes = {f[0]: f[3] for f in FORMULATIONS}

    throughput_df = session.sql(
        "SELECT DISTINCT LINE_ID, PRODUCT_ID FROM PRODUCT_WHEEL_OPT.ATOMIC.FACT_LINE_PRODUCT_THROUGHPUT"
    ).collect()

    line_products = {}
    for row in throughput_df:
        lid = row['LINE_ID']
        pid = row['PRODUCT_ID']
        if lid not in line_products:
            line_products[lid] = []
        line_products[lid].append(pid)

    for lid, prod_list in line_products.items():
        sample_size = min(len(prod_list), 10)
        sampled = random.sample(prod_list, sample_size) if len(prod_list) > 10 else prod_list
        for from_pid in sampled:
            for to_pid in sampled:
                if from_pid == to_pid:
                    continue
                from_form = (from_pid - 1) % len(FORMULATIONS)
                to_form = (to_pid - 1) % len(FORMULATIONS)
                from_allergen = FORMULATIONS[from_form][3]
                to_allergen = FORMULATIONS[to_form][3]

                base_time = round(random.uniform(0.5, 2.0), 2)
                if from_allergen != to_allergen:
                    base_time += round(random.uniform(1.0, 3.0), 2)
                if 'grain-free' in to_allergen or 'novel protein' in to_allergen:
                    base_time += round(random.uniform(0.5, 1.5), 2)

                cost = round(base_time * random.uniform(150, 300), 2)
                rows.append(
                    f"SELECT {co_id}, {lid}, {from_pid}, {to_pid}, {base_time}, {cost}"
                )
                co_id += 1

    batch_size = 500
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        sql = f"INSERT INTO PRODUCT_WHEEL_OPT.ATOMIC.FACT_LINE_PRODUCT_CHANGEOVER {' UNION ALL '.join(batch)}"
        session.sql(sql).collect()
        total += len(batch)

    return f"FACT_LINE_PRODUCT_CHANGEOVER: {total}"


def seed_fact_inventory_position(session):
    truncate_table(session, 'FACT_INVENTORY_POSITION')
    product_count = 50
    base_date = datetime(2026, 3, 30)
    days = 28
    rows = []
    snap_id = 1

    for plant in PLANTS:
        for d in range(days):
            snap_time = base_date + timedelta(days=d, hours=23, minutes=59)
            snap_str = snap_time.strftime('%Y-%m-%d %H:%M:%S')
            num_products = random.randint(15, 30)
            sampled_prods = random.sample(range(1, product_count + 1), num_products)
            for prod_id in sampled_prods:
                on_hand = round(random.uniform(0, 15000), 0)
                on_order = round(random.uniform(0, 5000), 0)
                safety = round(random.uniform(500, 3000), 0)
                rows.append(
                    f"SELECT {snap_id}, {prod_id}, {plant[0]}, '{snap_str}'::TIMESTAMP_NTZ, {on_hand}, {on_order}, {safety}"
                )
                snap_id += 1

    batch_size = 500
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        sql = f"INSERT INTO PRODUCT_WHEEL_OPT.ATOMIC.FACT_INVENTORY_POSITION {' UNION ALL '.join(batch)}"
        session.sql(sql).collect()
        total += len(batch)

    return f"FACT_INVENTORY_POSITION: {total}"


def seed_fact_production_order(session):
    truncate_table(session, 'FACT_PRODUCTION_ORDER')
    product_count = 50
    base_date = datetime(2026, 3, 2)
    rows = []
    order_id = 1
    statuses = ['completed', 'completed', 'completed', 'released', 'planned']

    for _ in range(500):
        plant = random.choice(PLANTS)
        plant_lines = [l for l in LINES if l[1] == plant[0]]
        line = random.choice(plant_lines)
        prod_id = random.randint(1, product_count)
        day_offset = random.randint(0, 55)
        start = base_date + timedelta(days=day_offset, hours=random.randint(0, 16))
        duration_hours = random.uniform(4, 24)
        end = start + timedelta(hours=duration_hours)
        qty = round(random.uniform(500, 10000), 0)
        status = random.choice(statuses)
        start_str = start.strftime('%Y-%m-%d %H:%M:%S')
        end_str = end.strftime('%Y-%m-%d %H:%M:%S')
        rows.append(
            f"SELECT {order_id}, {plant[0]}, {line[0]}, {prod_id}, "
            f"'{start_str}'::TIMESTAMP_NTZ, '{end_str}'::TIMESTAMP_NTZ, {qty}, '{status}', 'MES'"
        )
        order_id += 1

    sql = f"INSERT INTO PRODUCT_WHEEL_OPT.ATOMIC.FACT_PRODUCTION_ORDER {' UNION ALL '.join(rows)}"
    session.sql(sql).collect()
    return f"FACT_PRODUCTION_ORDER: {order_id - 1}"


def seed_fact_production_event(session):
    truncate_table(session, 'FACT_PRODUCTION_EVENT')
    completed_orders = session.sql(
        "SELECT PROD_ORDER_ID, LINE_ID, PRODUCT_ID, PLANNED_START_TIME, PLANNED_END_TIME, PLANNED_QTY "
        "FROM PRODUCT_WHEEL_OPT.ATOMIC.FACT_PRODUCTION_ORDER WHERE ORDER_STATUS = 'completed'"
    ).collect()

    rows = []
    evt_id = 1
    for row in completed_orders:
        actual_qty = round(float(row['PLANNED_QTY']) * random.uniform(0.90, 1.05), 0)
        scrap = round(float(row['PLANNED_QTY']) * random.uniform(0.005, 0.03), 0)
        start_str = str(row['PLANNED_START_TIME'])
        end_str = str(row['PLANNED_END_TIME'])
        rows.append(
            f"SELECT {evt_id}, {row['PROD_ORDER_ID']}, {row['LINE_ID']}, {row['PRODUCT_ID']}, "
            f"'{start_str}'::TIMESTAMP_NTZ, '{end_str}'::TIMESTAMP_NTZ, {actual_qty}, {scrap}"
        )
        evt_id += 1

    if rows:
        batch_size = 500
        total = 0
        for i in range(0, len(rows), batch_size):
            batch = rows[i:i+batch_size]
            sql = f"INSERT INTO PRODUCT_WHEEL_OPT.ATOMIC.FACT_PRODUCTION_EVENT {' UNION ALL '.join(batch)}"
            session.sql(sql).collect()
            total += len(batch)
        return f"FACT_PRODUCTION_EVENT: {total}"
    return "FACT_PRODUCTION_EVENT: 0"


def seed_fact_product_costing(session):
    truncate_table(session, 'FACT_PRODUCT_COSTING')
    product_count = 50
    rows = []
    cost_id = 1

    for prod_id in range(1, product_count + 1):
        for plant in PLANTS:
            mat = round(random.uniform(0.30, 2.50), 2)
            conv = round(random.uniform(0.20, 1.00), 2)
            pkg = round(random.uniform(0.10, 0.60), 2)
            ovh = round(random.uniform(0.05, 0.40), 2)
            margin = round(random.uniform(0.50, 3.00), 2)
            rows.append(
                f"SELECT {cost_id}, {prod_id}, 'FY2026', {plant[0]}, {mat}, {conv}, {pkg}, {ovh}, {margin}"
            )
            cost_id += 1

    sql = f"INSERT INTO PRODUCT_WHEEL_OPT.ATOMIC.FACT_PRODUCT_COSTING {' UNION ALL '.join(rows)}"
    session.sql(sql).collect()
    return f"FACT_PRODUCT_COSTING: {cost_id - 1}"


def generate_ai_descriptions(session):
    try:
        result = session.sql("""
            SELECT SNOWFLAKE.CORTEX.AI_COMPLETE(
                'llama3.1-8b',
                'Generate a single short product description (max 15 words) for a premium chicken and rice wet dog food in a 13oz can. Return only the description text, nothing else.'
            ) AS TEST_DESC
        """).collect()

        products = session.sql(
            "SELECT PRODUCT_ID, PRODUCT_DESCRIPTION, PACKAGE_SIZE_UOM, PRODUCT_FAMILY "
            "FROM PRODUCT_WHEEL_OPT.ATOMIC.DIM_PRODUCT ORDER BY PRODUCT_ID"
        ).collect()

        batch_size = 10
        updated = 0
        for i in range(0, len(products), batch_size):
            batch = products[i:i+batch_size]
            for row in batch:
                pid = row['PRODUCT_ID']
                pkg = row['PACKAGE_SIZE_UOM']
                family = row['PRODUCT_FAMILY']
                old_desc = row['PRODUCT_DESCRIPTION']

                prompt = (
                    f"Generate a realistic product description (max 20 words) for a pet food product. "
                    f"Category: {family}. Package: {pkg}. Base recipe: {old_desc}. "
                    f"Return only the description, no quotes or extra text."
                )
                prompt_escaped = prompt.replace("'", "''")

                session.sql(f"""
                    UPDATE PRODUCT_WHEEL_OPT.ATOMIC.DIM_PRODUCT
                    SET PRODUCT_DESCRIPTION = TRIM(SNOWFLAKE.CORTEX.AI_COMPLETE('llama3.1-8b', '{prompt_escaped}'))
                    WHERE PRODUCT_ID = {pid}
                """).collect()
                updated += 1

        formulations = session.sql(
            "SELECT FORMULATION_ID, FORMULATION_CODE, ALLERGEN_CLASS, PROCESSING_FAMILY "
            "FROM PRODUCT_WHEEL_OPT.ATOMIC.DIM_FORMULATION ORDER BY FORMULATION_ID"
        ).collect()

        for row in formulations:
            fid = row['FORMULATION_ID']
            code = row['FORMULATION_CODE']
            allergen = row['ALLERGEN_CLASS']
            proc_fam = row['PROCESSING_FAMILY']
            prompt = (
                f"Generate a realistic formulation description (max 25 words) for a pet food recipe. "
                f"Code: {code}. Allergen class: {allergen}. Processing: {proc_fam}. "
                f"Return only the description, no quotes."
            )
            prompt_escaped = prompt.replace("'", "''")
            session.sql(f"""
                UPDATE PRODUCT_WHEEL_OPT.ATOMIC.DIM_FORMULATION
                SET FORMULATION_DESCRIPTION = TRIM(SNOWFLAKE.CORTEX.AI_COMPLETE('llama3.1-8b', '{prompt_escaped}'))
                WHERE FORMULATION_ID = {fid}
            """).collect()

        return f"AI_DESCRIPTIONS: {updated} products + {len(formulations)} formulations enriched"

    except Exception as e:
        return f"AI_DESCRIPTIONS: skipped ({str(e)[:100]})"
$$;
