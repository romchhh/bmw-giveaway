import time
from collections.abc import Awaitable, Callable
from typing import Any

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, TelegramObject


class CallbackFloodMiddleware(BaseMiddleware):
    """Обмежує частоту натискань inline-кнопок для кожного користувача."""

    def __init__(self, min_interval_sec: float) -> None:
        self._min_interval = min_interval_sec
        self._last_click: dict[int, float] = {}
        self._prune_counter = 0

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        if not isinstance(event, CallbackQuery):
            return await handler(event, data)

        user_id = event.from_user.id
        now = time.monotonic()
        last = self._last_click.get(user_id, 0.0)

        if now - last < self._min_interval:
            try:
                await event.answer(
                    "Не натискайте кнопки так часто. Зачекайте трохи.",
                    show_alert=False,
                )
            except Exception:
                pass
            return None

        self._last_click[user_id] = now
        self._prune_counter += 1
        if self._prune_counter >= 2000:
            self._prune_counter = 0
            cutoff = now - 3600.0
            self._last_click = {k: v for k, v in self._last_click.items() if v > cutoff}

        return await handler(event, data)
