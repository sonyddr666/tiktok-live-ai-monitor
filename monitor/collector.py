"""Captura eventos do TikTokLive e emite para os handlers registrados."""
import asyncio
import os
from typing import Callable, List
from TikTokLive import TikTokLiveClient
from TikTokLive.client.web.web_settings import WebDefaults
from TikTokLive.events import (
    ConnectEvent, DisconnectEvent, LiveEndEvent,
    CommentEvent, GiftEvent, LikeEvent, JoinEvent,
    FollowEvent, ShareEvent, RoomUserSeqEvent
)
from monitor.euler_counter import patch as patch_euler, get_stats

patch_euler()


def _apply_euler_key():
    key = os.getenv("EULER_API_KEY", "").strip()
    if key:
        WebDefaults.tiktok_sign_api_key = key


def safe_avatar(user) -> str:
    if user is None:
        return ''
    for attr in ('avatar_thumb', 'avatar_larger', 'avatar_medium'):
        obj = getattr(user, attr, None)
        if obj is None:
            continue
        url_list = getattr(obj, 'url_list', None)
        if url_list:
            return url_list[0] if isinstance(url_list, (list, tuple)) else str(url_list)
        url = getattr(obj, 'url', None)
        if url:
            return str(url)
    avatar = getattr(user, 'avatar', None)
    if avatar is not None:
        url = getattr(avatar, 'url', None)
        if url:
            return str(url)
        url_list = getattr(avatar, 'url_list', None)
        if url_list:
            return url_list[0] if isinstance(url_list, (list, tuple)) else str(url_list)
    return ''


def safe_str(user, attr: str, default='') -> str:
    try:
        val = getattr(user, attr, default)
        return str(val) if val else default
    except Exception:
        return default


class LiveCollector:
    def __init__(self, username: str):
        _apply_euler_key()
        self.username = username
        self.client = TikTokLiveClient(unique_id=username)
        self._handlers: List[Callable] = []
        self._viewer_count = 0
        self._setup_events()

    def on_event(self, handler: Callable):
        self._handlers.append(handler)

    def _emit(self, event_data: dict):
        """Emite evento de forma segura mesmo durante shutdown."""
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return  # sem loop ativo, ignora silenciosamente
        for handler in self._handlers:
            loop.create_task(handler(event_data))

    def _emit_euler(self):
        """Emite stats da Euler apos cada request interceptado."""
        stats = get_stats()
        self._emit({"type": "euler_stats", "count": stats["count"], "remaining": stats["remaining"]})

    def _setup_events(self):
        client = self.client

        @client.on(ConnectEvent)
        async def on_connect(event):
            self._emit({"type": "connect", "username": self.username})
            self._emit_euler()

        @client.on(DisconnectEvent)
        async def on_disconnect(event):
            self._emit({"type": "disconnect"})

        @client.on(LiveEndEvent)
        async def on_end(event):
            self._emit({"type": "live_end"})

        @client.on(CommentEvent)
        async def on_comment(event: CommentEvent):
            try:
                self._emit({
                    "type": "comment",
                    "user": safe_str(event.user, 'unique_id'),
                    "nickname": safe_str(event.user, 'nickname'),
                    "avatar": safe_avatar(event.user),
                    "text": getattr(event, 'comment', ''),
                })
            except Exception:
                pass

        @client.on(GiftEvent)
        async def on_gift(event: GiftEvent):
            try:
                streakable = getattr(getattr(event, 'gift', None), 'streakable', False)
                streaking = getattr(event, 'streaking', False)
                if streakable and streaking:
                    return
                gift = getattr(event, 'gift', None)
                self._emit({
                    "type": "gift",
                    "user": safe_str(event.user, 'unique_id'),
                    "nickname": safe_str(event.user, 'nickname'),
                    "avatar": safe_avatar(event.user),
                    "gift_name": getattr(gift, 'name', 'Gift') if gift else 'Gift',
                    "gift_count": getattr(event, 'repeat_count', 1) or 1,
                    "coin_value": getattr(gift, 'diamond_count', 0) if gift else 0,
                })
                self._emit_euler()
            except Exception:
                pass

        @client.on(LikeEvent)
        async def on_like(event: LikeEvent):
            try:
                self._emit({
                    "type": "like",
                    "user": safe_str(event.user, 'unique_id'),
                    "nickname": safe_str(event.user, 'nickname'),
                })
            except Exception:
                pass

        @client.on(JoinEvent)
        async def on_join(event: JoinEvent):
            try:
                self._emit({
                    "type": "join",
                    "user": safe_str(event.user, 'unique_id'),
                    "nickname": safe_str(event.user, 'nickname'),
                    "avatar": safe_avatar(event.user),
                })
            except Exception:
                pass

        @client.on(FollowEvent)
        async def on_follow(event: FollowEvent):
            try:
                self._emit({
                    "type": "follow",
                    "user": safe_str(event.user, 'unique_id'),
                    "nickname": safe_str(event.user, 'nickname'),
                })
            except Exception:
                pass

        @client.on(ShareEvent)
        async def on_share(event: ShareEvent):
            try:
                self._emit({
                    "type": "share",
                    "user": safe_str(event.user, 'unique_id'),
                    "nickname": safe_str(event.user, 'nickname'),
                })
            except Exception:
                pass

        @client.on(RoomUserSeqEvent)
        async def on_viewers(event: RoomUserSeqEvent):
            try:
                count = getattr(event, 'viewer_count', 0) or 0
                if count != self._viewer_count:
                    self._viewer_count = count
                    self._emit({"type": "viewers", "count": count})
            except Exception:
                pass

    async def start(self):
        await self.client.start()

    async def stop(self):
        try:
            await self.client.disconnect()
        except Exception:
            pass
