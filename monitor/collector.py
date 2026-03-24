"""Captura eventos do TikTokLive e emite para os handlers registrados."""
import asyncio
from typing import Callable, List
from TikTokLive import TikTokLiveClient
from TikTokLive.events import (
    ConnectEvent, DisconnectEvent, LiveEndEvent,
    CommentEvent, GiftEvent, LikeEvent, JoinEvent,
    FollowEvent, ShareEvent, RoomUserSeqEvent
)


class LiveCollector:
    def __init__(self, username: str):
        self.username = username
        self.client = TikTokLiveClient(unique_id=username)
        self._handlers: List[Callable] = []
        self._viewer_count = 0
        self._setup_events()

    def on_event(self, handler: Callable):
        """Registra um handler que recebe dict de evento."""
        self._handlers.append(handler)

    def _emit(self, event_data: dict):
        for handler in self._handlers:
            asyncio.create_task(handler(event_data))

    def _setup_events(self):
        client = self.client

        @client.on(ConnectEvent)
        async def on_connect(event):
            self._emit({"type": "connect", "username": self.username})

        @client.on(DisconnectEvent)
        async def on_disconnect(event):
            self._emit({"type": "disconnect"})

        @client.on(LiveEndEvent)
        async def on_end(event):
            self._emit({"type": "live_end"})

        @client.on(CommentEvent)
        async def on_comment(event: CommentEvent):
            self._emit({
                "type": "comment",
                "user": event.user.unique_id,
                "nickname": event.user.nickname,
                "avatar": getattr(event.user.avatar, 'url', ''),
                "text": event.comment,
            })

        @client.on(GiftEvent)
        async def on_gift(event: GiftEvent):
            if event.gift.streakable and event.streaking:
                return  # aguarda fim do streak
            self._emit({
                "type": "gift",
                "user": event.user.unique_id,
                "nickname": event.user.nickname,
                "avatar": getattr(event.user.avatar, 'url', ''),
                "gift_name": event.gift.name,
                "gift_count": event.repeat_count,
                "coin_value": getattr(event.gift, 'diamond_count', 0),
            })

        @client.on(LikeEvent)
        async def on_like(event: LikeEvent):
            self._emit({
                "type": "like",
                "user": event.user.unique_id,
                "nickname": event.user.nickname,
            })

        @client.on(JoinEvent)
        async def on_join(event: JoinEvent):
            self._emit({
                "type": "join",
                "user": event.user.unique_id,
                "nickname": event.user.nickname,
                "avatar": getattr(event.user.avatar, 'url', ''),
            })

        @client.on(FollowEvent)
        async def on_follow(event: FollowEvent):
            self._emit({
                "type": "follow",
                "user": event.user.unique_id,
                "nickname": event.user.nickname,
            })

        @client.on(ShareEvent)
        async def on_share(event: ShareEvent):
            self._emit({
                "type": "share",
                "user": event.user.unique_id,
                "nickname": event.user.nickname,
            })

        @client.on(RoomUserSeqEvent)
        async def on_viewers(event: RoomUserSeqEvent):
            count = getattr(event, 'viewer_count', 0)
            if count != self._viewer_count:
                self._viewer_count = count
                self._emit({"type": "viewers", "count": count})

    async def start(self):
        """Inicia a conexão sem bloquear."""
        await self.client.start()

    async def stop(self):
        await self.client.disconnect()
