from aiogram import Router, types, F
from aiogram.filters import CommandStart

from main import bot
from keyboards.client_keyboards import (
    get_enter_giveaway_keyboard,
    get_subscribe_keyboard,
    get_mini_app_keyboard,
    get_start_keyboard,
)
from Content.texts import (
    get_welcome_text,
    get_subscribe_text,
    get_subscription_fail_text,
    get_subscription_ok_text,
    get_continue_mini_app_text,
    get_access_granted_text,
    get_already_completed_text,
)
from database_functions.client_db import (
    check_user,
    add_user,
    update_user_activity,
    get_user_giveaway_status,
    set_user_subscribed,
    set_user_reposted,
    set_user_completed,
)
from database_functions.create_dbs import create_dbs
from database_functions.links_db import increment_link_count
from utils.channels_resolver import get_giveaway_channels


router = Router()


async def check_channel_subscription(user_id: int) -> bool:
    c1, c2 = get_giveaway_channels()
    for chat_id in (c1.chat_id, c2.chat_id):
        try:
            member = await bot.get_chat_member(chat_id, user_id)
            if member.status in ("left", "kicked", "banned"):
                return False
        except Exception:
            return False
    return True


@router.message(CommandStart())
async def start_command(message: types.Message):
    user = message.from_user
    user_id = user.id
    username = user.username
    args = message.text.split()

    user_exists = check_user(user_id)

    ref_link = None
    if len(args) > 1 and args[1].startswith('linktowatch_'):
        try:
            ref_link = int(args[1].split('_')[1])
            if not user_exists:
                increment_link_count(ref_link)
        except (ValueError, IndexError):
            pass

    if not user_exists:
        add_user(user_id, username, user.first_name, user.last_name, user.language_code, ref_link)

    update_user_activity(user_id)

    status = get_user_giveaway_status(user_id)

    if status['is_completed']:
        await message.answer(
            get_already_completed_text(),
            parse_mode='HTML',
            reply_markup=get_mini_app_keyboard()
        )
        return

    if status['is_subscribed'] and not status['is_completed']:
        await message.answer(
            get_continue_mini_app_text(),
            parse_mode='HTML',
            reply_markup=get_mini_app_keyboard()
        )
        return

    c1, c2 = get_giveaway_channels()
    await message.answer(
        get_welcome_text(),
        parse_mode='HTML',
        reply_markup=get_enter_giveaway_keyboard()
    )


@router.callback_query(F.data == "giveaway_start")
async def giveaway_start(callback: types.CallbackQuery):
    await callback.answer()
    c1, c2 = get_giveaway_channels()
    await callback.message.answer(
        get_subscribe_text(c1.title, c2.title),
        parse_mode='HTML',
        reply_markup=get_subscribe_keyboard()
    )


@router.callback_query(F.data == "check_subscription")
async def check_subscription(callback: types.CallbackQuery):
    user_id = callback.from_user.id
    subscribed = await check_channel_subscription(user_id)

    if not subscribed:
        await callback.answer("Перевір підписку на обидва канали", show_alert=True)
        await callback.message.answer(
            get_subscription_fail_text(),
            parse_mode='HTML',
            reply_markup=get_subscribe_keyboard()
        )
        return

    await callback.answer("Підписку підтверджено")
    set_user_subscribed(user_id)
    update_user_activity(user_id)

    await callback.message.answer(
        get_subscription_ok_text(),
        parse_mode='HTML',
        reply_markup=get_mini_app_keyboard()
    )


@router.message(F.web_app_data)
async def web_app_data_handler(message: types.Message):
    if not message.web_app_data or message.web_app_data.data != "repost_done":
        return

    user_id = message.from_user.id
    if not check_user(user_id):
        return

    status = get_user_giveaway_status(user_id)
    if status["is_completed"]:
        await message.answer(
            get_already_completed_text(),
            parse_mode="HTML",
            reply_markup=get_mini_app_keyboard(),
        )
        return

    if not status["is_subscribed"]:
        subscribed = await check_channel_subscription(user_id)
        if subscribed:
            set_user_subscribed(user_id)
        else:
            c1, c2 = get_giveaway_channels()
            await message.answer(
                get_subscribe_text(c1.title, c2.title),
                parse_mode="HTML",
                reply_markup=get_subscribe_keyboard(),
            )
            return

    set_user_reposted(user_id)
    set_user_completed(user_id)
    update_user_activity(user_id)

    await message.answer(
        get_access_granted_text(),
        parse_mode="HTML",
        reply_markup=get_mini_app_keyboard(),
    )


@router.callback_query(F.data == "open_admin_panel")
async def open_admin_panel_callback(callback: types.CallbackQuery):
    await callback.answer()
    from keyboards.admin_keyboards import admin_keyboard
    await callback.message.answer("⚙️ <b>Адмін-панель</b>", parse_mode="HTML", reply_markup=admin_keyboard())


async def on_startup(router):
    me = await bot.get_me()
    create_dbs()
    from utils.channels_resolver import load_giveaway_channels
    await load_giveaway_channels(bot)
    c1, c2 = get_giveaway_channels()
    print(f'Bot: @{me.username} запущений! Канали: «{c1.title}», «{c2.title}»')


async def on_shutdown(router):
    me = await bot.get_me()
    print(f'Bot: @{me.username} зупинений!')
