from __future__ import annotations

import html
import re
from typing import Final, Optional

from aiogram import F, Router, types
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from database_functions.client_db import get_username_by_user_id
from keyboards.admin_keyboards import admin_keyboard
from main import bot
from states.admin_states import DirectMessage
from utils.filters import IsAdmin

router = Router()

# Кнопки адмін-клавіатури — не сприймаємо їх як ID або текст листа
_ADMIN_REPLY_NAV: Final[frozenset[str]] = frozenset(
    {
        "Головне меню",
        "👨‍💻 Адмін панель",
        "Адмін панель 💻",
        "/admin",
        "Статистика",
        "Розсилка",
        "Адміністратори",
        "Посилання",
        "🎫 Квитки",
        "➕ Нарахувати квитки",
        "✉ Написати за ID",
        "Скасувати",
    }
)


def _confirm_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ Надіслати", callback_data="dm_do_send"),
                InlineKeyboardButton(text="❌ Скасувати", callback_data="dm_do_cancel"),
            ],
        ]
    )


def _confirm_kb_with_user_link(user_id: int, username: Optional[str]) -> InlineKeyboardMarkup:
    """Підтвердження + посилання на користувача (як на кроці введення тексту)."""
    user_rows = _open_user_chat_kb(user_id, username).inline_keyboard
    action_rows = _confirm_kb().inline_keyboard
    return InlineKeyboardMarkup(inline_keyboard=[*user_rows, *action_rows])


def _open_user_chat_kb(user_id: int, username: Optional[str]) -> InlineKeyboardMarkup:
    """Посилання на чат/профіль: за ID (tg://) і за @username, якщо є."""
    rows: list[list[InlineKeyboardButton]] = [
        [
            InlineKeyboardButton(
                text="👤 Відкрити за ID (Telegram)",
                url=f"tg://user?id={user_id}",
            )
        ]
    ]
    u = (username or "").strip()
    if u:
        rows.append(
            [InlineKeyboardButton(text=f"@{u} у Telegram", url=f"https://t.me/{u}")]
        )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _parse_telegram_user_id(raw: str) -> Optional[int]:
    t = raw.strip()
    if not re.fullmatch(r"[0-9]{1,15}", t):
        return None
    uid = int(t)
    return uid if uid > 0 else None


@router.message(IsAdmin(), F.text == "✉ Написати за ID")
async def dm_start(message: types.Message, state: FSMContext):
    await state.clear()
    await state.set_state(DirectMessage.waiting_user_id)
    await message.answer(
        "Надішли <b>числовий Telegram ID</b> користувача (той самий, що в повідомленнях про оплату в групі).\n\n"
        "Повідомлення отримає лише той, хто хоч раз натиснув <b>/start</b> у цьому боті. "
        "Без username це все одно можливо — якщо людина відкривала бота.\n\n"
        "Скасувати: /cancel",
        parse_mode="HTML",
    )


@router.message(IsAdmin(), DirectMessage.waiting_user_id, F.text, ~F.text.in_(_ADMIN_REPLY_NAV))
async def dm_got_user_id(message: types.Message, state: FSMContext):
    raw = (message.text or "").strip()
    if raw.lower() in ("/cancel", "скасувати", "відміна"):
        await state.clear()
        await message.answer("Скасовано.", reply_markup=admin_keyboard())
        return

    uid = _parse_telegram_user_id(raw)
    if uid is None:
        await message.answer(
            "Потрібен лише <b>числовий ID</b> (без літер і без @). Спробуй ще раз або /cancel.",
            parse_mode="HTML",
        )
        return

    uname = get_username_by_user_id(str(uid))
    hint = f"@{uname}" if uname else "без username в базі"

    await state.update_data(target_user_id=uid, target_username=uname)
    await state.set_state(DirectMessage.waiting_text)
    await message.answer(
        f"Отримувач: <code>{uid}</code> ({html.escape(hint)})\n\n"
        "Тепер надішли <b>текст повідомлення</b> одним повідомленням (можна кілька рядків). "
        "Форматування Telegram не підтримується — звичайний текст.\n\n"
        "/cancel — скасувати.",
        parse_mode="HTML",
        reply_markup=_open_user_chat_kb(uid, uname),
    )


@router.message(IsAdmin(), DirectMessage.waiting_text, F.text, ~F.text.in_(_ADMIN_REPLY_NAV))
async def dm_got_text(message: types.Message, state: FSMContext):
    raw = (message.text or "").strip()
    if raw.lower() in ("/cancel", "скасувати", "відміна"):
        await state.clear()
        await message.answer("Скасовано.", reply_markup=admin_keyboard())
        return

    if not raw:
        await message.answer("Текст порожній. Надішли повідомлення або /cancel.")
        return

    data = await state.get_data()
    uid = data.get("target_user_id")
    if not isinstance(uid, int):
        await state.clear()
        await message.answer("Сесія прострочена. Почни знову: «✉ Написати за ID».", reply_markup=admin_keyboard())
        return

    await state.update_data(draft_text=raw)
    await state.set_state(DirectMessage.confirm_send)

    preview = raw if len(raw) <= 3200 else raw[:3200] + "\n…"
    preview_esc = html.escape(preview)
    uname = data.get("target_username")
    uname_s = uname if isinstance(uname, str) else None
    await message.answer(
        "Перевір перед відправкою:\n\n"
        f"👤 Отримувач: <code>{uid}</code>\n\n"
        f"📝 Текст:\n<pre>{preview_esc}</pre>\n\n"
        "Надіслати?",
        parse_mode="HTML",
        reply_markup=_confirm_kb_with_user_link(uid, uname_s),
    )


@router.callback_query(IsAdmin(), StateFilter(DirectMessage.confirm_send), F.data == "dm_do_cancel")
async def dm_cancel_confirm(callback: types.CallbackQuery, state: FSMContext):
    await state.clear()
    await callback.answer("Скасовано")
    try:
        await callback.message.edit_text("Скасовано.")
    except TelegramBadRequest:
        pass
    await callback.message.answer("Готово.", reply_markup=admin_keyboard())


@router.callback_query(IsAdmin(), StateFilter(DirectMessage.confirm_send), F.data == "dm_do_send")
async def dm_do_send(callback: types.CallbackQuery, state: FSMContext):
    data = await state.get_data()
    uid = data.get("target_user_id")
    text = data.get("draft_text")
    if not isinstance(uid, int) or not isinstance(text, str) or not text.strip():
        await state.clear()
        await callback.answer("Дані втрачені", show_alert=True)
        return

    await callback.answer()
    try:
        await callback.message.edit_reply_markup(reply_markup=None)
    except TelegramBadRequest:
        pass

    await state.clear()

    try:
        await bot.send_message(uid, text.strip())
    except TelegramBadRequest as e:
        err = (str(e) or "").lower()
        if "blocked" in err or "deactivated" in err or "user is deactivated" in err:
            hint = (
                "Не вдалося надіслати: користувач <b>заблокував бота</b> або акаунт недоступний. "
                "Без діалогу з ботом написати за ID неможливо."
            )
        elif "chat not found" in err or "not found" in err:
            hint = (
                "Не вдалося надіслати: користувач <b>не відкривав бота</b> (не натискав /start). "
                "Попроси його один раз відкрити бота — після цього можна повторити."
            )
        else:
            hint = f"Telegram відхилив відправку: <code>{html.escape(str(e)[:400])}</code>"

        await callback.message.answer(hint, parse_mode="HTML", reply_markup=admin_keyboard())
        return

    await callback.message.answer(
        f"✅ Повідомлення надіслано користувачу <code>{uid}</code>.",
        parse_mode="HTML",
        reply_markup=admin_keyboard(),
    )
