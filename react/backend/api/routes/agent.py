import logging
import json
import os
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from ..database import get_connection, DB

log = logging.getLogger(__name__)
router = APIRouter()

AGENT_DB = DB
AGENT_SCHEMA = "DATA_MART"
AGENT_NAME = "PRODUCT_WHEEL_AGENT"

AGENT_ENDPOINT = f"/api/v2/databases/{AGENT_DB}/schemas/{AGENT_SCHEMA}/agents/{AGENT_NAME}:run"


async def _stream_agent(message: str, page_context: str | None = None):
    conn = get_connection()
    rest = conn.rest

    context_prefix = f"[User is on the {page_context} page] " if page_context else ""
    full_message = context_prefix + message

    payload = {
        "model": "claude-3-5-sonnet",
        "messages": [{"role": "user", "content": [{"type": "text", "text": full_message}]}],
        "stream": True,
        "tools": [],
    }

    try:
        resp = rest.request(
            url=AGENT_ENDPOINT,
            method="post",
            body=payload,
            timeout=120,
            _include_retry_params=False,
        )

        if hasattr(resp, "iter_lines"):
            for line in resp.iter_lines():
                if not line:
                    continue
                line_str = line.decode("utf-8") if isinstance(line, bytes) else line
                if line_str.startswith("data:"):
                    data_str = line_str[5:].strip()
                    if data_str == "[DONE]":
                        yield f"data: {json.dumps({'type': 'done'})}\n\n"
                        break
                    try:
                        event = json.loads(data_str)
                        parsed = _parse_agent_event(event)
                        if parsed:
                            yield f"data: {json.dumps(parsed)}\n\n"
                    except json.JSONDecodeError:
                        continue
        elif isinstance(resp, dict):
            if "choices" in resp:
                for choice in resp.get("choices", []):
                    delta = choice.get("delta", {})
                    content = delta.get("content", "")
                    if content:
                        yield f"data: {json.dumps({'type': 'text_delta', 'text': content})}\n\n"
            elif "messages" in resp:
                for msg in resp.get("messages", []):
                    if msg.get("role") == "assistant":
                        for part in msg.get("content", []):
                            if part.get("type") == "text":
                                yield f"data: {json.dumps({'type': 'text_delta', 'text': part['text']})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        else:
            text = str(resp) if resp else "No response from agent."
            yield f"data: {json.dumps({'type': 'text_delta', 'text': text})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except Exception as e:
        log.exception("Agent streaming error")
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"


def _parse_agent_event(event: dict) -> dict | None:
    delta = event.get("delta", {})
    event_type = delta.get("type", event.get("type", ""))

    if event_type == "content.delta" or "content" in delta:
        content = delta.get("content", "")
        if isinstance(content, list):
            texts = [c.get("text", "") for c in content if c.get("type") == "text"]
            content = "".join(texts)
        if content:
            return {"type": "text_delta", "text": content}

    if "tool_use" in delta or event_type == "tool_use":
        tool_data = delta.get("tool_use", delta)
        return {
            "type": "tool_start",
            "tool_name": tool_data.get("name", "unknown"),
            "tool_use_id": tool_data.get("id", ""),
            "tool_type": tool_data.get("type", ""),
            "input": tool_data.get("input"),
        }

    if "tool_results" in delta or event_type == "tool_results":
        tool_result = delta.get("tool_results", delta)
        if isinstance(tool_result, list):
            for tr in tool_result:
                return {
                    "type": "tool_end",
                    "tool_use_id": tr.get("tool_use_id", ""),
                    "status": "complete",
                    "result": tr.get("content", ""),
                    "sql": tr.get("sql"),
                }
        return {
            "type": "tool_end",
            "tool_use_id": tool_result.get("tool_use_id", ""),
            "status": "complete",
            "result": tool_result.get("content", ""),
        }

    if "text" in delta:
        return {"type": "text_delta", "text": delta["text"]}

    return None


@router.post("/run")
async def run_agent(request: Request):
    body = await request.json()
    message = body.get("message", "")
    page_context = body.get("page_context")

    if not message.strip():
        return {"error": "Empty message"}

    return StreamingResponse(
        _stream_agent(message, page_context),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
