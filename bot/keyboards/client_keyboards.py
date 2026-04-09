from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from database_functions.admin_db import get_all_administrators
from config import mini_app_url
from utils.channels_resolver import get_giveaway_channels, channel_button_text


def get_enter_giveaway_keyboard() -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(text="Взяти участь", callback_data="giveaway_start")]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_subscribe_keyboard() -> InlineKeyboardMarkup:
    c1, c2 = get_giveaway_channels()
    keyboard = [
        [InlineKeyboardButton(text=channel_button_text(c1.title), url=c1.url)],
        [InlineKeyboardButton(text=channel_button_text(c2.title), url=c2.url)],
        [InlineKeyboardButton(text="Перевірити підписки", callback_data="check_subscription")],
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_mini_app_keyboard() -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(text="Додаток", web_app=WebAppInfo(url=mini_app_url))]
    ]
    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def get_start_keyboard(user_id: int) -> InlineKeyboardMarkup:
    keyboard = []
    all_admins = get_all_administrators()
    if user_id in all_admins:
        keyboard.append([InlineKeyboardButton(text="⚙ Адмін панель", callback_data="open_admin_panel")])
    return InlineKeyboardMarkup(inline_keyboard=keyboard) if keyboard else None
