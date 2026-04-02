from fastapi import APIRouter, Query
from pydantic import BaseModel
from ..database import query, execute, DATA_MART

router = APIRouter()


class NoteCreate(BaseModel):
    page_context: str
    entity_type: str = "page"
    entity_id: str = ""
    note_text: str
    note_type: str = "comment"


@router.get("")
def list_notes(
    page: str = Query(None),
    entity_type: str = Query(None),
    entity_id: str = Query(None),
    limit: int = Query(50),
):
    conditions = ["1=1"]
    if page:
        conditions.append(f"PAGE_CONTEXT = '{page}'")
    if entity_type:
        conditions.append(f"ENTITY_TYPE = '{entity_type}'")
    if entity_id:
        conditions.append(f"ENTITY_ID = '{entity_id}'")

    where = " AND ".join(conditions)
    return query(
        f"""
        SELECT NOTE_ID, CREATED_AT, CREATED_BY, PAGE_CONTEXT,
               ENTITY_TYPE, ENTITY_ID, NOTE_TEXT, NOTE_TYPE,
               IS_RESOLVED, RESOLVED_AT, RESOLVED_BY
        FROM {DATA_MART}.USER_NOTES
        WHERE {where}
        ORDER BY CREATED_AT DESC
        LIMIT {limit}
        """
    )


@router.post("")
def create_note(note: NoteCreate):
    safe_text = note.note_text.replace("'", "''")
    safe_entity_id = note.entity_id.replace("'", "''")
    execute(
        f"""
        INSERT INTO {DATA_MART}.USER_NOTES
            (PAGE_CONTEXT, ENTITY_TYPE, ENTITY_ID, NOTE_TEXT, NOTE_TYPE)
        VALUES
            ('{note.page_context}', '{note.entity_type}', '{safe_entity_id}',
             '{safe_text}', '{note.note_type}')
        """
    )
    return {"status": "ok"}


@router.patch("/{note_id}/resolve")
def resolve_note(note_id: int):
    execute(
        f"""
        UPDATE {DATA_MART}.USER_NOTES
        SET IS_RESOLVED = TRUE,
            RESOLVED_AT = CURRENT_TIMESTAMP(),
            RESOLVED_BY = CURRENT_USER()
        WHERE NOTE_ID = {note_id}
        """
    )
    return {"status": "ok"}
