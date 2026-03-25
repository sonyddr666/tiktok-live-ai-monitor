"""
Intercepta requests HTTP reais feitos pelo aiohttp para o host da Euler Stream.
Usa monkey-patch no aiohttp.ClientSession._request para contar cada chamada real.
"""
import time
import aiohttp

EULER_HOST = "eulerstream.com"

# Estado global do contador
_count: int = 0
_window_start: float = time.time()
_original_request = None
_patched: bool = False


def get_stats() -> dict:
    global _count, _window_start
    now = time.time()
    elapsed = now - _window_start
    if elapsed >= 60:
        _count = 0
        _window_start = now
        elapsed = 0
    return {
        "count": _count,
        "window_sec": int(elapsed),
        "remaining": max(0, 60 - int(elapsed)),
    }


def _tick():
    global _count, _window_start
    now = time.time()
    if now - _window_start >= 60:
        _count = 0
        _window_start = now
    _count += 1


def patch():
    """Aplica o monkey-patch no aiohttp uma unica vez."""
    global _patched, _original_request
    if _patched:
        return
    _original_request = aiohttp.ClientSession._request

    async def _patched_request(self, method, str_or_url, **kwargs):
        url = str(str_or_url)
        if EULER_HOST in url:
            _tick()
        return await _original_request(self, method, str_or_url, **kwargs)

    aiohttp.ClientSession._request = _patched_request
    _patched = True
