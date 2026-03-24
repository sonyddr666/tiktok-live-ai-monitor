"""Backend FastAPI com WebSocket para o dashboard."""
import asyncio
import json
import os
from pathlib import Path
from typing import Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

app = FastAPI(title="TikTok Live Monitor")

# Serve static files
static_path = Path(__file__).parent / "static"
if static_path.exists():
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

connected_clients: Set[WebSocket] = set()
collector_task = None
current_collector = None


async def broadcast(data: dict):
    """Envia evento para todos os clientes web conectados."""
    if not connected_clients:
        return
    message = json.dumps(data)
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
                    await start_monitor(username)
    except WebSocketDisconnect:
        connected_clients.discard(ws)


async def start_monitor(username: str):
    global collector_task, current_collector
    # Para monitor anterior se existir
    if current_collector:
        try:
            await current_collector.stop()
        except Exception:
            pass
    if collector_task and not collector_task.done():
        collector_task.cancel()

    # Importa aqui para evitar import circular
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from monitor.collector import LiveCollector

    collector = LiveCollector(username)
    current_collector = collector

    collector.on_event(broadcast)
    await broadcast({"type": "status", "message": f"Conectando em {username}..."})

    async def run_with_retry():
        while True:
            try:
                await collector.start()
            except Exception as e:
                await broadcast({"type": "error", "message": str(e)})
                await asyncio.sleep(10)
                await broadcast({"type": "status", "message": "Reconectando..."})

    collector_task = asyncio.create_task(run_with_retry())


if __name__ == "__main__":
    port = int(os.getenv("WEB_PORT", 8000))
    uvicorn.run("web.server:app", host="0.0.0.0", port=port, reload=False)
