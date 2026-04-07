from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple

from aiogram import Bot


@dataclass(frozen=True)
class GiveawayChannel:
    chat_id: int
    title: str
    url: str


_pair: Optional[Tuple[GiveawayChannel, GiveawayChannel]] = None


def _url_for_chat(chat) -> str:
    if getattr(chat, "username", None):
        return f"https://t.me/{chat.username}"
    if getattr(chat, "invite_link", None):
        return chat.invite_link
    cid = str(chat.id)
    if cid.startswith("-100"):
        return f"https://t.me/c/{cid[4:]}"
    return f"https://t.me/c/{cid.lstrip('-')}"


def channel_button_text(title: str) -> str:
    t = (title or "Канал").strip() or "Канал"
    prefix = "↗ "
    max_len = 64
    if len(prefix + t) > max_len:
        t = t[: max_len - len(prefix) - 2] + "…"
    return prefix + t


async def load_giveaway_channels(bot: Bot) -> None:
    global _pair
    from config import channel_1_id, channel_2_id

    if channel_1_id is None or channel_2_id is None:
        raise ValueError("У .env потрібно задати CHANNEL_1_ID та CHANNEL_2_ID")

    resolved: list[GiveawayChannel] = []
    for cid in (channel_1_id, channel_2_id):
        chat = await bot.get_chat(cid)
        resolved.append(
            GiveawayChannel(
                chat_id=chat.id,
                title=(chat.title or "Канал").strip(),
                url=_url_for_chat(chat),
            )
        )
    _pair = (resolved[0], resolved[1])


def get_giveaway_channels() -> Tuple[GiveawayChannel, GiveawayChannel]:
    if _pair is None:
        raise RuntimeError("Канали ще не завантажені (load_giveaway_channels на старті)")
    return _pair
