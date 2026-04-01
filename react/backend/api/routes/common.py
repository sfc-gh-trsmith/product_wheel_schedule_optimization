from fastapi import APIRouter
from ..database import query, ATOMIC

router = APIRouter()


@router.get("/plants")
def get_plants():
    return query(f"SELECT * FROM {ATOMIC}.DIM_PLANT ORDER BY PLANT_NAME")


@router.get("/lines")
def get_lines(plant_name: str | None = None):
    sql = f"""
    SELECT l.*, p.PLANT_NAME
    FROM {ATOMIC}.DIM_PRODUCTION_LINE l
    JOIN {ATOMIC}.DIM_PLANT p ON l.PLANT_ID = p.PLANT_ID
    ORDER BY p.PLANT_NAME, l.LINE_CODE
    """
    rows = query(sql)
    if plant_name:
        plants = [p.strip() for p in plant_name.split(",")]
        rows = [r for r in rows if r["plant_name"] in plants]
    return rows


@router.get("/families")
def get_families():
    return query(f"SELECT DISTINCT PRODUCT_FAMILY FROM {ATOMIC}.DIM_PRODUCT ORDER BY PRODUCT_FAMILY")
