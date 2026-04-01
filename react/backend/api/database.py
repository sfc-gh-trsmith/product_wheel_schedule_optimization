import os
import logging
import snowflake.connector
from datetime import datetime, date
from decimal import Decimal
from pathlib import Path
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend

log = logging.getLogger(__name__)

_conn = None

DB = "PRODUCT_WHEEL_OPT"
ATOMIC = f"{DB}.ATOMIC"
DATA_MART = f"{DB}.DATA_MART"

_REAUTH_CODES = (390114, 390115)


def _serialize(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    return obj


def _load_private_key(path: str):
    with open(path, "rb") as f:
        return serialization.load_pem_private_key(f.read(), password=None, backend=default_backend())


def _create_connection():
    token_path = "/snowflake/session/token"

    if os.path.exists(token_path):
        with open(token_path) as f:
            token = f.read().strip()
        conn = snowflake.connector.connect(
            host=os.getenv("SNOWFLAKE_HOST"),
            account=os.getenv("SNOWFLAKE_ACCOUNT"),
            token=token,
            authenticator="oauth",
            database=DB,
            schema="ATOMIC",
            warehouse=os.getenv("SNOWFLAKE_WAREHOUSE", "PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_WH"),
        )
    else:
        key_path = Path("/root/.ssh/snowflake_demo_rsa_key.p8")
        if not key_path.exists():
            key_path = Path.home() / ".ssh" / "snowflake_demo_rsa_key.p8"

        if key_path.exists():
            pk = _load_private_key(str(key_path))
            conn = snowflake.connector.connect(
                account=os.getenv("SNOWFLAKE_ACCOUNT", "sfsenorthamerica-trsmith_aws1"),
                user=os.getenv("SNOWFLAKE_USER", "trsmith"),
                private_key=pk,
                database=DB,
                schema="ATOMIC",
                warehouse="PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_WH",
            )
        else:
            conn_name = os.getenv("SNOWFLAKE_CONNECTION_NAME", "demo")
            try:
                conn = snowflake.connector.connect(connection_name=conn_name)
            except Exception:
                conn = snowflake.connector.connect(
                    account=os.getenv("SNOWFLAKE_ACCOUNT", "sfsenorthamerica-trsmith_aws1"),
                    user=os.getenv("SNOWFLAKE_USER", "trsmith"),
                    authenticator="externalbrowser",
                    database=DB,
                    schema="ATOMIC",
                    warehouse="PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_WH",
                )
        conn.cursor().execute(f"USE DATABASE {DB}")
        conn.cursor().execute("USE SCHEMA ATOMIC")
    return conn


def _reset():
    global _conn
    try:
        if _conn and not _conn.is_closed():
            _conn.close()
    except Exception:
        pass
    _conn = None


def get_connection():
    global _conn
    if _conn is None or _conn.is_closed():
        _conn = _create_connection()
    return _conn


def _is_reauth(exc: Exception) -> bool:
    if isinstance(exc, snowflake.connector.errors.ProgrammingError):
        return exc.errno in _REAUTH_CODES
    return "390114" in str(exc) or "expired" in str(exc).lower()


def query(sql: str, params: dict | None = None) -> list[dict]:
    if params:
        for k, v in params.items():
            sql = sql.replace(f"{{{k}}}", str(v))
    for attempt in range(2):
        conn = get_connection()
        cur = conn.cursor()
        try:
            cur.execute(sql)
            cols = [desc[0].lower() for desc in cur.description]
            rows = []
            for row in cur.fetchall():
                rows.append({col: _serialize(val) for col, val in zip(cols, row)})
            return rows
        except Exception as exc:
            if attempt == 0 and _is_reauth(exc):
                log.warning("Token expired, reconnecting…")
                _reset()
                continue
            raise
        finally:
            cur.close()
    return []


def execute(sql: str, params: dict | None = None):
    if params:
        for k, v in params.items():
            sql = sql.replace(f"{{{k}}}", str(v))
    for attempt in range(2):
        conn = get_connection()
        cur = conn.cursor()
        try:
            cur.execute(sql)
            return
        except Exception as exc:
            if attempt == 0 and _is_reauth(exc):
                log.warning("Token expired, reconnecting…")
                _reset()
                continue
            raise
        finally:
            cur.close()
