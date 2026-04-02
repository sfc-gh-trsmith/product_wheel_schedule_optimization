/*
  06_cortex_search.sql
  Sets up Cortex Search for process documentation:
    1. Stage for document uploads
    2. Chunk table
    3. Chunking procedure
    4. Cortex Search Service
*/

USE DATABASE PRODUCT_WHEEL_OPT;
USE SCHEMA RAW;
USE WAREHOUSE PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_WH;

CREATE STAGE IF NOT EXISTS PROCESS_DOCS
  DIRECTORY = (ENABLE = TRUE)
  ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE');

CREATE TABLE IF NOT EXISTS DOC_CHUNKS (
    chunk_id      NUMBER AUTOINCREMENT PRIMARY KEY,
    doc_name      VARCHAR,
    section_title VARCHAR,
    chunk_text    VARCHAR(16000),
    chunk_index   NUMBER,
    metadata      VARIANT,
    created_at    TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE OR REPLACE PROCEDURE CHUNK_PROCESS_DOCS()
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'run'
EXECUTE AS CALLER
AS
$$
import re

def run(session):
    files = session.sql("""
        SELECT RELATIVE_PATH as name,
               BUILD_SCOPED_FILE_URL(@RAW.PROCESS_DOCS, RELATIVE_PATH) as url
        FROM DIRECTORY(@RAW.PROCESS_DOCS)
        WHERE RELATIVE_PATH LIKE '%.md'
    """).collect()

    session.sql("DELETE FROM RAW.DOC_CHUNKS").collect()

    total = 0
    for f in files:
        fname = f['NAME']
        try:
            content_rows = session.sql(f"""
                SELECT TO_VARCHAR(
                    SNOWFLAKE.CORTEX.PARSE_DOCUMENT(
                        @RAW.PROCESS_DOCS,
                        '{fname}',
                        {{'mode': 'LAYOUT'}}
                    ):content
                ) AS content
            """).collect()
            content = content_rows[0]['CONTENT'] if content_rows else ''
        except Exception:
            raw_rows = session.sql(f"""
                SELECT $1::VARCHAR as content
                FROM @RAW.PROCESS_DOCS/{fname}
            """).collect()
            content = raw_rows[0]['CONTENT'] if raw_rows else ''

        if not content:
            continue

        sections = re.split(r'\n(?=#{1,3} )', content)
        chunk_idx = 0
        for section in sections:
            lines = section.strip().split('\n')
            title_match = re.match(r'^(#{1,3})\s+(.+)', lines[0]) if lines else None
            section_title = title_match.group(2) if title_match else fname

            text = section.strip()
            max_chunk = 1500
            if len(text) <= max_chunk:
                chunks = [text]
            else:
                chunks = []
                words = text.split()
                current = []
                current_len = 0
                for w in words:
                    if current_len + len(w) + 1 > max_chunk and current:
                        chunks.append(' '.join(current))
                        current = [w]
                        current_len = len(w)
                    else:
                        current.append(w)
                        current_len += len(w) + 1
                if current:
                    chunks.append(' '.join(current))

            for chunk in chunks:
                if len(chunk.strip()) < 20:
                    continue
                safe_chunk = chunk.replace("'", "''")
                safe_title = section_title.replace("'", "''")
                safe_fname = fname.replace("'", "''")
                session.sql(f"""
                    INSERT INTO RAW.DOC_CHUNKS (doc_name, section_title, chunk_text, chunk_index, metadata)
                    VALUES (
                        '{safe_fname}',
                        '{safe_title}',
                        '{safe_chunk}',
                        {chunk_idx},
                        OBJECT_CONSTRUCT('source', '{safe_fname}', 'section', '{safe_title}')
                    )
                """).collect()
                chunk_idx += 1
                total += 1

    return f"Chunked {len(files)} documents into {total} chunks"
$$;

CREATE CORTEX SEARCH SERVICE IF NOT EXISTS CONTRACT_MFG_SEARCH_SERVICE
  ON chunk_text
  ATTRIBUTES section_title, doc_name
  WAREHOUSE = PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_WH
  TARGET_LAG = '1 day'
  AS (
    SELECT
      chunk_text,
      section_title,
      doc_name,
      chunk_index,
      metadata
    FROM RAW.DOC_CHUNKS
  );
