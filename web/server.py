"""Backend FastAPI com WebSocket para o dashboard."""
import asyncio
import json
import os
from pathlib import Path
from typing import Set, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

app = FastAPI(title="TikTok Live Monitor")

static_path = Path(__file__).parent / "static"
if static_path.exists():
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

connected_clients: Set[WebSocket] = set()
collector_task: Optional[asyncio.Task] = None
current_collector = None
current_username: str = ""


async def broadcast(data: dict):
    if not connected_clients:
        return
    message = json.dumps(data, ensure_ascii=False)
    dead = set()
    for ws in connected_clients:
        try:
            await ws.send_text(message)
        except Exception:
            dead.add(ws)
    connected_clients -= dead


@app.get("/", response_class=HTMLResponse)
async def root():
    html_path = Path(__file__).parent / "static" / "index.html"
    return HTMLResponse(html_path.read_text(encoding="utf-8"))


@app.get("/api/euler-stats")
async def euler_stats():
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from monitor.euler_counter import get_stats
    return get_stats()


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connected_clients.add(ws)
    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            if msg.get("action") == "connect":
                username = msg.get("username", "").strip()
                if username:
                    await start_monitor(username, ws)
    except WebSocketDisconnect:
        connected_clients.discard(ws)
    except Exception:
        connected_clients.discard(ws)


async def _stop_current():
    global collector_task, current_collector
    if collector_task and not collector_task.done():
        collector_task.cancel()
        try:
            await asyncio.wait_for(asyncio.shield(collector_task), timeout=3.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass
    collector_task = None
    if current_collector:
        try:
            await current_collector.stop()
        except Exception:
            pass
        current_collector = None
    await asyncio.sleep(1.5)


async def start_monitor(username: str, ws: WebSocket):
    global collector_task, current_collector, current_username

    if username == current_username and current_collector is not None:
        try:
            await ws.send_text(json.dumps({"type": "status", "message": f"Ja conectado em {username}"}))
        except Exception:
            pass
        return

    await _stop_current()
    current_username = username

    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from monitor.collector import LiveCollector

    collector = LiveCollector(username)
    current_collector = collector
    collector.on_event(broadcast)

    try:
        await ws.send_text(json.dumps({"type": "status", "message": f"Conectando em {username}..."}))
    except Exception:
        pass

    async def run_with_retry():
        while True:
            try:
                await collector.start()
            except asyncio.CancelledError:
                break
            except Exception as e:
                err = str(e)
                await broadcast({"type": "error", "message": err})
                wait = 30 if "RATE_LIMIT" in err or "rate_limit" in err else 10
                await asyncio.sleep(wait)
                if current_collector is collector:
                    await broadcast({"type": "status", "message": f"Reconectando em {username}..."})

    collector_task = asyncio.create_task(run_with_retry())


if __name__ == "__main__":
    port = int(os.getenv("WEB_PORT", 8000))
    uvicorn.run("web.server:app", host="0.0.0.0", port=port, reload=False)
