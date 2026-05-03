"""Сповіщення в Telegram-групу про оплати / ручні нарахування (як у site/lib/notify-admins-payment.ts)."""

import html
import sqlite3
from datetime import datetime
from os import getenv
from typing import List, Tuple

from aiogram import Bot

from database_functions.db_path import DATABASE_PATH

try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None  # type: ignore[misc, assignment]


DEFAULT_PAYMENTS_NOTIFY_CHAT_ID = -1003622191100


def _payments_notify_chat_id() -> int:
    raw = (getenv("PAYMENTS_NOTIFY_CHAT_ID") or "").strip()
    if not raw:
        return DEFAULT_PAYMENTS_NOTIFY_CHAT_ID
    try:
        return int(raw)
    except ValueError:
        return DEFAULT_PAYMENTS_NOTIFY_CHAT_ID


def _kyiv_line() -> str:
    if ZoneInfo is not None:
        try:
            return datetime.now(ZoneInfo("Europe/Kyiv")).strftime("%d.%m.%Y %H:%M:%S")
        except Exception:
            pass
    return datetime.utcnow().strftime("%d.%m.%Y %H:%M:%S UTC")


def _buyer_block(user_id: int) -> Tuple[str, str, str, str, str]:
    """Повертає (full_name_line, username_line, phone_line, language_line, safe_id)."""
    conn = sqlite3.connect(DATABASE_PATH)
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT user_name, user_first_name, user_last_name, user_phone, language
               FROM users WHERE user_id = ? LIMIT 1""",
            (str(user_id),),
        )
        row = cur.fetchone()
    finally:
        conn.close()

    if not row:
        return (
            "Ім'я: <i>немає в базі</i>\n",
            "Юзернейм: <i>немає в базі</i>\n",
            "",
            "",
            str(user_id),
        )

    uname, first, last, phone, lang = row
    parts = [first or "", last or ""]
    full = " ".join(p for p in parts if str(p).strip())
    name_line = f"Ім'я: {html.escape(full)}\n" if full else "Ім'я: <i>немає в базі</i>\n"
    u = (uname or "").strip()
    user_line = f"Юзернейм: @{html.escape(u)}\n" if u else "Юзернейм: <i>немає в базі</i>\n"
    ph = (phone or "").strip()
    phone_line = f"Телефон: <code>{html.escape(ph)}</code>\n" if ph else ""
    lg = (lang or "").strip()
    lang_line = f"Мова: {html.escape(lg)}\n" if lg else ""
    return name_line, user_line, phone_line, lang_line, str(user_id)


def _admin_label(from_user) -> str:
    if from_user is None:
        return "<i>невідомо</i>"
    if getattr(from_user, "username", None):
        return f"@{html.escape(from_user.username)}"
    parts = [getattr(from_user, "first_name", None) or "", getattr(from_user, "last_name", None) or ""]
    name = " ".join(p for p in parts if p).strip()
    if name:
        return f"{html.escape(name)} <code>{from_user.id}</code>"
    return f"<code>{from_user.id}</code>"


async def notify_payments_chat_manual_grant(
    bot: Bot,
    *,
    target_user_id: int,
    quantity: int,
    codes: List[str],
    order_reference: str,
    admin_from,
) -> None:
    """Повідомлення в групу про нарахування квитків через адмінку (аналог «Нова оплата»)."""
    chat_id = _payments_notify_chat_id()
    name_l, user_l, phone_l, lang_l, uid_s = _buyer_block(target_user_id)
    codes_block = "\n".join(f"<code>{html.escape(c.strip())}</code>" for c in codes if c)
    if not codes_block:
        codes_block = "<i>немає в БД</i>"

    admin_line = _admin_label(admin_from)

    text = (
        "🛠 <b>Квитки нараховано вручну</b> (адмін-панель бота)\n\n"
        f"Час (Київ): {html.escape(_kyiv_line())}\n"
        f"Адмін: {admin_line}\n\n"
        "👤 <b>Клієнт</b>\n"
        f"ID: <code>{html.escape(uid_s)}</code>\n"
        f"{name_l}"
        f"{user_l}"
        f"{phone_l}"
        f"{lang_l}"
        "\n"
        f"Спосіб: <b>ручне нарахування</b>\n"
        f"Кількість квитків: <b>{quantity}</b>\n"
        f"Замовлення: <code>{html.escape(order_reference)}</code>\n\n"
        f"🎫 <b>Номери квитків</b>\n{codes_block}"
    )

    try:
        await bot.send_message(
            chat_id,
            text,
            parse_mode="HTML",
            disable_web_page_preview=True,
        )
    except Exception:
        pass
