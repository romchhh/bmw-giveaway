import html
import secrets
import time
from typing import List

from aiogram import F, Router, types
from aiogram.filters import StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from config import giveaway_post_url, mini_app_url
from database_functions.client_db import get_username_by_user_id, resolve_telegram_user_identifier
from database_functions.giveaway_tickets_db import admin_fulfill_tickets
from keyboards.admin_keyboards import admin_keyboard
from main import bot
from states.admin_states import GrantTickets
from utils.filters import IsAdmin
from utils.notify_payments_group import notify_payments_chat_manual_grant

router = Router()


def _grant_qty_keyboard() -> InlineKeyboardMarkup:
    row1 = [
        InlineKeyboardButton(text=str(i), callback_data=f"grant_qty_{i}")
        for i in range(1, 6)
    ]
    row2 = [
        InlineKeyboardButton(text=str(i), callback_data=f"grant_qty_{i}")
        for i in range(6, 11)
    ]
    return InlineKeyboardMarkup(
        inline_keyboard=[
            row1,
            row2,
            [InlineKeyboardButton(text="❌ Скасувати", callback_data="grant_abort")],
        ]
    )


def _grant_flow_cancel_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="❌ Скасувати", callback_data="grant_abort")],
        ]
    )


def _confirm_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ Так, нарахувати", callback_data="grant_apply"
                )
            ],
            [
                InlineKeyboardButton(
                    text="◀️ Змінити кількість", callback_data="grant_restart_qty"
                )
            ],
            [InlineKeyboardButton(text="❌ Скасувати", callback_data="grant_abort")],
        ]
    )


def _ticket_word(n: int) -> str:
    a = abs(n) % 10
    b = abs(n) % 100
    if a == 1 and b != 11:
        return "квиток"
    if 2 <= a <= 4 and (b < 12 or b > 14):
        return "квитки"
    return "квитків"


def _notify_grant_keyboard() -> InlineKeyboardMarkup | None:
    rows: List[List[InlineKeyboardButton]] = []
    if mini_app_url and mini_app_url.strip():
        rows.append(
            [
                InlineKeyboardButton(
                    text="🎟 Відкрити мінідодаток",
                    web_app=WebAppInfo(url=mini_app_url.strip()),
                )
            ]
        )
    gu = (giveaway_post_url or "").strip()
    if gu:
        rows.append([InlineKeyboardButton(text="Зробити репост", url=gu)])
    return InlineKeyboardMarkup(inline_keyboard=rows) if rows else None


async def _send_user_grant_message(user_id: int, codes: List[str]) -> None:
    n = len(codes)
    tw = _ticket_word(n)
    codes_block = "  ".join(f"<code>{html.escape(c)}</code>" for c in codes)
    text = (
        "🎉 <b>Тобі нараховано квитки!</b>\n\n"
        f"Ти отримав {n} {tw} на розіграш <b>BMW M4</b>.\n\n"
        f"🎟 Тво{'й код' if n == 1 else 'ї коди'}:\n{codes_block}\n\n"
        "📢 <b>Репост анонсу</b>\n"
        "Зроби репост посту про розіграш — це частина умов участі. "
        "Після репосту відкрий мінідодаток і натисни «Репост зробив», щоб ми це зафіксували.\n\n"
        "Очікуй на розіграш — ми повідомимо переможця особисто. Удачі! 🍀"
    )
    kb = _notify_grant_keyboard()
    try:
        await bot.send_message(
            user_id,
            text,
            parse_mode="HTML",
            disable_web_page_preview=True,
            reply_markup=kb,
        )
    except Exception:
        pass


@router.message(IsAdmin(), F.text == "➕ Нарахувати квитки")
async def grant_start(message: types.Message, state: FSMContext):
    await state.clear()
    await message.answer(
        "Нарахування квитків учаснику.\n"
        "Обери кількість (від 1 до 10) — як у мінідодатку:",
        reply_markup=_grant_qty_keyboard(),
    )


@router.callback_query(IsAdmin(), F.data == "grant_restart_qty")
async def grant_restart_qty(callback: types.CallbackQuery, state: FSMContext):
    await state.clear()
    await callback.answer()
    await callback.message.edit_text(
        "Обери кількість квитків (1–10):",
        reply_markup=_grant_qty_keyboard(),
    )


@router.callback_query(IsAdmin(), F.data.startswith("grant_qty_"))
async def grant_qty_chosen(callback: types.CallbackQuery, state: FSMContext):
    try:
        q = int(callback.data.split("_")[-1])
    except (ValueError, IndexError):
        await callback.answer("Помилка", show_alert=True)
        return
    if q < 1 or q > 10:
        await callback.answer("Некоректна кількість", show_alert=True)
        return
    await state.set_state(GrantTickets.waiting_identifier)
    await state.update_data(quantity=q)
    await callback.answer()
    await callback.message.edit_text(
        f"Обрано: <b>{q}</b> {_ticket_word(q)}.\n\n"
        "Надішли <b>@username</b> учасника або його <b>числовий Telegram ID</b> "
        "(для username без @ теж ок; за ніком шукаємо лише тих, хто вже натискав /start).",
        parse_mode="HTML",
        reply_markup=_grant_flow_cancel_kb(),
    )


@router.callback_query(IsAdmin(), F.data == "grant_abort")
async def grant_abort(callback: types.CallbackQuery, state: FSMContext):
    await state.clear()
    await callback.answer("Скасовано")
    try:
        await callback.message.edit_text("Нарахування скасовано.")
    except Exception:
        await callback.message.answer("Нарахування скасовано.")


@router.message(IsAdmin(), GrantTickets.waiting_identifier, F.text)
async def grant_identifier(message: types.Message, state: FSMContext):
    raw = message.text.strip()
    if raw.lower() in ("/cancel", "скасувати", "відміна"):
        await state.clear()
        await message.answer("Скасовано.", reply_markup=admin_keyboard())
        return

    uid, err = resolve_telegram_user_identifier(raw)
    if err or uid is None:
        await message.answer(f"❌ {err or 'Не вдалося визначити користувача.'}")
        return

    data = await state.get_data()
    qty = int(data.get("quantity") or 0)
    if qty < 1:
        await state.clear()
        await message.answer("Сесія прострочена. Почни знову: «➕ Нарахувати квитки».", reply_markup=admin_keyboard())
        return

    uname = get_username_by_user_id(str(uid))
    if uname:
        label = f"@{html.escape(str(uname))}"
    else:
        label = f"id <code>{uid}</code>"

    await state.update_data(target_user_id=uid)
    await state.set_state(GrantTickets.confirm_pending)
    await message.answer(
        "Перевір дані:\n"
        f"• Кількість: <b>{qty}</b> {_ticket_word(qty)}\n"
        f"• Користувач: {label}\n"
        f"• Telegram ID: <code>{uid}</code>\n\n"
        "Усе вірно?",
        parse_mode="HTML",
        reply_markup=_confirm_kb(),
    )


@router.message(IsAdmin(), GrantTickets.confirm_pending, F.text)
async def grant_confirm_ignore_text(message: types.Message, state: FSMContext):
    raw = message.text.strip().lower()
    if raw in ("/cancel", "скасувати", "відміна"):
        await state.clear()
        await message.answer("Скасовано.", reply_markup=admin_keyboard())
        return
    await message.answer(
        "Підтверди нарахування кнопками на повідомленні вище або натисни «Скасувати» там."
    )


@router.callback_query(IsAdmin(), GrantTickets.confirm_pending, F.data == "grant_apply")
async def grant_apply(callback: types.CallbackQuery, state: FSMContext):
    data = await state.get_data()
    qty = data.get("quantity")
    uid = data.get("target_user_id")
    if not isinstance(qty, int) or not isinstance(uid, int):
        await callback.answer("Спочатку надішли username або ID.", show_alert=True)
        return

    await callback.answer()
    try:
        await callback.message.edit_reply_markup(reply_markup=None)
    except Exception:
        pass

    order_ref = f"ADM-{int(time.time())}-{secrets.token_hex(4)}"
    result = admin_fulfill_tickets(uid, qty, order_ref)
    await state.clear()

    if not result.get("ok"):
        err = result.get("error", "server")
        human = {
            "user_cap": "У цього користувача вже максимум квитків (ліміт як у мінідодатку).",
            "pool_exhausted": "У пулі розіграшу не залишилося стільки вільних квитків.",
            "bad_quantity": "Некоректна кількість.",
            "server": "Помилка БД при генерації кодів.",
        }.get(err, "Невідома помилка.")
        await callback.message.answer(f"❌ {human}", reply_markup=admin_keyboard())
        return

    codes = result.get("codes") or []
    if not result.get("idempotent"):
        await _send_user_grant_message(uid, codes)
        await notify_payments_chat_manual_grant(
            bot,
            target_user_id=uid,
            quantity=len(codes),
            codes=codes,
            order_reference=order_ref,
            admin_from=callback.from_user,
        )

    codes_line = ", ".join(codes)
    await callback.message.answer(
        "✅ Готово.\n"
        f"Користувачу <code>{uid}</code> нараховано <b>{len(codes)}</b> {_ticket_word(len(codes))}.\n"
        f"Коди: <code>{html.escape(codes_line)}</code>\n"
        f"order_reference: <code>{html.escape(order_ref)}</code>",
        parse_mode="HTML",
        reply_markup=admin_keyboard(),
    )
