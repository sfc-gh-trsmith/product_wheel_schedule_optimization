export interface KPI {
  plant_name: string;
  line_code: string;
  product_family: string;
  fill_rate: number;
  changeover_hours: number;
  total_planned_qty: number;
  total_demand_qty: number;
  objective_cost: number;
  inventory_days_of_supply: number;
}

export interface ScheduleRow {
  scenario_id: string;
  line_id: number;
  line_code: string;
  plant_name: string;
  time_slot_start: string;
  time_slot_end: string;
  product_id: number;
  product_code: string;
  product_description: string;
  product_family: string;
  planned_qty: number;
  projected_fill_rate: number;
  projected_inventory_qty: number;
  total_changeover_time_hours: number;
  objective_cost: number;
}

export interface Scenario {
  scenario_id: string;
}

export interface ScenarioParams {
  scenario_id: string;
  horizon_days: number;
  shifts_per_day: number;
  time_limit_sec: number;
  mip_gap_pct: number;
  inv_cost_multiplier: number;
  bo_cost_multiplier: number;
  co_cost_multiplier: number;
  demand_multiplier: number;
  demand_shock_family: string | null;
  demand_shock_pct: number;
  inv_multiplier: number;
  plant_filter: string;
  line_filter: string;
  max_products_per_line: number;
  solver_engine: string;
  solve_time_sec: number;
  total_objective_cost: number;
  status: string;
}

export interface Plant {
  plant_id: number;
  plant_name: string;
}

export interface Line {
  line_id: number;
  line_code: string;
  line_name: string;
  plant_name: string;
  line_type: string;
  is_allergen_dedicated_flag: boolean;
}

export interface DemandLandscape {
  customer_name: string;
  product_family: string;
  total_forecast_qty: number;
}

export interface DemandTimeseries {
  forecast_week_start: string;
  product_family: string;
  forecast_qty: number;
}

export interface LineCapability {
  line_id: number;
  line_code: string;
  line_name: string;
  line_type: string;
  is_allergen_dedicated_flag: boolean;
  plant_name: string;
  product_count: number;
  avg_run_rate: number;
  min_run_rate: number;
  max_run_rate: number;
}

export interface ChangeoverEntry {
  line_id: number;
  line_code: string;
  from_product: string;
  to_product: string;
  changeover_time_hours: number;
  changeover_cost: number;
}

export interface InventorySnapshot {
  product_id: number;
  product_code: string;
  product_family: string;
  plant_name: string;
  on_hand_qty: number;
  safety_stock_qty: number;
  on_order_qty: number;
}

export interface Contract {
  contract_id: number;
  customer_id: number;
  customer_name: string;
  customer_segment: string;
  contract_start_date: string;
  contract_end_date: string;
  service_level_target_fill_rate: number;
  max_days_of_supply_target: number;
  item_count: number;
  total_min_volume: number;
}

export interface ContractItem {
  product_code: string;
  product_family: string;
  product_description: string;
  min_annual_volume: number;
  max_annual_volume: number;
  agreed_price_per_unit: number;
  priority_tier: string;
}

export interface ContractCompliance {
  customer_id: number;
  customer_name: string;
  sla_target: number;
  max_days_of_supply_target: number;
  achieved_fill_rate: number;
  total_demand: number;
  total_planned: number;
  gap: number;
  status: string;
}

export interface FillRateByLine {
  plant_name: string;
  line_code: string;
  fill_rate: number;
}

export interface ChangeoverByPlant {
  plant_name: string;
  line_code: string;
  changeover_hours: number;
}

export interface DemandVsPlanned {
  product_family: string;
  total_demand_qty: number;
  total_planned_qty: number;
}

export interface DosByFamily {
  product_family: string;
  avg_dos: number;
}

export interface UtilizationHeatmap {
  line_code: string;
  slot_date: string;
  assigned_slots: number;
  total_slots: number;
  utilization: number;
}

export interface ThroughputDetail {
  line_code: string;
  run_rate_units_per_hour: number;
}

export interface CalendarGrid {
  line_code: string;
  slot_date: string;
  calendar_status: string;
  slot_count: number;
  status_num: number;
}

export interface DemandAgg {
  product_id: number;
  product_family: string;
  forecast_qty: number;
}

export interface SolverParams {
  horizon_days: number;
  shifts_per_day: number;
  time_limit: number;
  mip_gap: number;
  inv_cost_mult: number;
  bo_cost_mult: number;
  co_cost_mult: number;
  demand_mult: number;
  shock_family: string | null;
  shock_pct: number;
  inv_mult: number;
  plant_filter: string[];
  line_filter: string[];
  max_products_per_line: number;
}

export interface SolverProgressEvent {
  line: string;
  status: string;
  pct: number;
}

export interface SolverResult {
  scenario_id: string;
  solve_status: string;
  lines_solved: number;
  schedule_rows: number;
  solve_time_sec: number;
  total_objective_cost: number;
}
