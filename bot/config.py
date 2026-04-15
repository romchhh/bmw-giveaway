from os import getenv
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

# Завжди завантажуємо .env з папки проєкту (не залежить від cwd)
_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path)

token = getenv('TOKEN')

administrators = [int(id) for id in getenv('ADMINISTRATORS')[1:-1].split(',')]


def _optional_channel_id(key: str) -> Optional[int]:
    raw = (getenv(key) or "").strip()
    if not raw:
        return None
    return int(raw)


# ID каналів / супергруп (наприклад -1001234567890). Назва та посилання підтягуються через API.
channel_1_id = _optional_channel_id('CHANNEL_1_ID')
channel_2_id = _optional_channel_id('CHANNEL_2_ID')

giveaway_post_url = getenv('GIVEAWAY_POST_URL', 'https://t.me/your_channel/123')
mini_app_url = getenv('MINI_APP_URL', 'https://t.me/your_bot/app')


def _positive_int_env(key: str, default: int) -> int:
    raw = (getenv(key) or "").strip()
    if not raw:
        return default
    try:
        v = int(raw)
        return v if v > 0 else default
    except ValueError:
        return default


# Загальний пул квитків (як у мінідодатку / GIVEAWAY_TOTAL_TICKETS)
giveaway_total_tickets = _positive_int_env("GIVEAWAY_TOTAL_TICKETS", 777)


def _positive_float_env(key: str, default: float) -> float:
    raw = (getenv(key) or "").strip()
    if not raw:
        return default
    try:
        v = float(raw.replace(",", "."))
        return v if v > 0 else default
    except ValueError:
        return default


# /start і inline-кнопки — спільний скользячий ліміт (за замовч. 5 дій за 60 с)
bot_flood_max_actions = _positive_int_env("BOT_FLOOD_MAX_ACTIONS", 5)
bot_flood_window_sec = _positive_float_env("BOT_FLOOD_WINDOW_SEC", 60.0)
