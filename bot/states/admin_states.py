from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
    
class Mailing(StatesGroup):
    content = State()
    media = State()
    description = State()
    url_buttons = State()


class LinkStates(StatesGroup):
    waiting_for_name = State()
    waiting_for_edit_name = State()


class AdminManagement(StatesGroup):
    waiting_for_admin_username = State()
    waiting_for_admin_id = State()
    waiting_for_admin_removal = State()


class MenuEdit(StatesGroup):
    content = State()
    media = State()
    description = State()
    url_buttons = State()


class GrantTickets(StatesGroup):
    waiting_identifier = State()
    confirm_pending = State()


class DirectMessage(StatesGroup):
    """Повідомлення користувачу за Telegram ID (наприклад, після повернення WayForPay)."""
    waiting_user_id = State()
    waiting_text = State()
    confirm_send = State()
    