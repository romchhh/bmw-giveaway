from aiogram import F, Router, types
from aiogram.types import FSInputFile
from main import bot
from utils.filters import IsAdmin
from aiogram.fsm.context import FSMContext
from keyboards.admin_keyboards import (
    admin_keyboard,
    get_export_database_keyboard,
    get_tickets_export_keyboard,
)
from utils.admin_functions import (
    format_statistics_message,
    format_tickets_statistics_message,
    generate_database_export,
    generate_tickets_export,
)
from datetime import datetime
import os


router = Router()


@router.message(IsAdmin(), F.text.in_(["👨‍💻 Адмін панель", "Адмін панель 💻", "/admin"]))
async def admin_panel(message: types.Message):
    await message.answer("Вітаю в адмін панелі.", reply_markup=admin_keyboard())


@router.message(IsAdmin(), F.text.in_(["Головне меню"]))
async def go_home(message: types.Message, state: FSMContext):
    await state.clear()
    from Content.texts import get_welcome_text
    from keyboards.client_keyboards import get_enter_giveaway_keyboard
    await message.answer(get_welcome_text(), parse_mode="HTML", reply_markup=get_enter_giveaway_keyboard())


@router.message(IsAdmin(), F.text.in_(["Статистика"]))
async def statistic_handler(message: types.Message):
    response_message = format_statistics_message()
    await message.answer(response_message, parse_mode="HTML", reply_markup=get_export_database_keyboard())


@router.message(IsAdmin(), F.text.in_(["🎫 Квитки", "Квитки"]))
async def tickets_statistics_handler(message: types.Message):
    text = format_tickets_statistics_message()
    await message.answer(text, parse_mode="HTML", reply_markup=get_tickets_export_keyboard())


@router.callback_query(IsAdmin(), F.data == "export_database")
async def export_database(callback: types.CallbackQuery):
    await callback.answer()
    await callback.message.answer(
        "<b>Формуємо Excel-файл...</b>",
        parse_mode="HTML"
    )

    filename, users_count, links_count = generate_database_export()

    file = FSInputFile(filename)
    await bot.send_document(
        callback.message.chat.id,
        document=file,
        caption=(
            f"◼ База даних\n\n"
            f"Користувачів: {users_count}\n"
            f"Посилань: {links_count}\n"
            f"Дата: {datetime.now().strftime('%d.%m.%Y %H:%M')}"
        )
    )

    if os.path.exists(filename):
        os.remove(filename)


@router.callback_query(IsAdmin(), F.data.startswith("export_tickets_"))
async def export_tickets(callback: types.CallbackQuery):
    fmt = callback.data.replace("export_tickets_", "")
    if fmt not in ("txt", "csv", "xlsx"):
        await callback.answer("Невідомий формат", show_alert=True)
        return
    await callback.answer()
    await callback.message.answer("<b>Формуємо файл...</b>", parse_mode="HTML")

    try:
        filepath, count = generate_tickets_export(fmt)
    except Exception:
        await callback.message.answer("❌ Не вдалося сформувати файл. Перевір БД та залежності.")
        return

    ext = {"txt": "txt", "csv": "csv", "xlsx": "xlsx"}[fmt]
    nice_name = f"kvitky_{datetime.now().strftime('%d%m%Y_%H%M')}.{ext}"
    file = FSInputFile(filepath, filename=nice_name)
    fmt_label = {"txt": "TXT", "csv": "CSV", "xlsx": "Excel"}[fmt]
    await bot.send_document(
        callback.message.chat.id,
        document=file,
        caption=(
            f"<b>🎫 Квитки</b> · {fmt_label}\n"
            f"Рядків: <b>{count}</b>\n"
            f"Дата: {datetime.now().strftime('%d.%m.%Y %H:%M')}"
        ),
        parse_mode="HTML",
    )

    if os.path.exists(filepath):
        os.remove(filepath)
