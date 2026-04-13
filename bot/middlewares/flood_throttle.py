import time
from collections import deque
from collections.abc import Awaitable, Callable
from typing import Any, Literal

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, TelegramObject

FLOOD_REPLY_TEXT = "Не поспішай і чекай"


def _is_start_command(message: Message) -> bool:
    if not message.text:
        return False
    parts = message.text.split()
    if not parts:
        return False
    cmd = parts[0]
    base = cmd.split("@", 1)[0]
    return base == "/start"


class ActionRateLimiter:
    """Скользяче вікно: не більше max_actions подій за window_sec для user_id."""

    def __init__(self, max_actions: int, window_sec: float) -> None:
        self._max = max(1, max_actions)
        self._window = max(0.1, window_sec)
        self._hits: dict[int, deque[float]] = {}
        self._prune_every = 0

    def hit(self, user_id: int) -> bool:
        """True — можна обробити (подія врахована); False — ліміт перевищено."""
        now = time.monotonic()
        q = self._hits.setdefault(user_id, deque())
        while q and q[0] < now - self._window:
            q.popleft()
        if len(q) >= self._max:
            return False
        q.append(now)
        self._prune_every += 1
        if self._prune_every >= 3000:
            self._prune_every = 0
            cutoff = now - self._window - 5.0
            for uid in list(self._hits.keys()):
                dq = self._hits[uid]
                while dq and dq[0] < cutoff:
                    dq.popleft()
                if not dq:
                    del self._hits[uid]
        return True


class FloodThrottleMiddleware(BaseMiddleware):
    """Ліміт на /start (message) або на inline-кнопки (callback); один спільний лімітер."""

    def __init__(
        self,
        limiter: ActionRateLimiter,
        kind: Literal["start", "callback"],
    ) -> None:
        self._limiter = limiter
        self._kind = kind

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        if self._kind == "start":
            if not isinstance(event, Message):
                return await handler(event, data)
            if not _is_start_command(event):
                return await handler(event, data)
            user_id = event.from_user.id if event.from_user else 0
        else:
            if not isinstance(event, CallbackQuery):
                return await handler(event, data)
            user_id = event.from_user.id if event.from_user else 0

        if user_id <= 0:
            return await handler(event, data)

        if not self._limiter.hit(user_id):
            if self._kind == "callback":
                try:
                    await event.answer(FLOOD_REPLY_TEXT, show_alert=True)
                except Exception:
                    pass
            else:
                try:
                    await event.answer(FLOOD_REPLY_TEXT)
                except Exception:
                    pass
            return None

        return await handler(event, data)
