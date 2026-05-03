import re
import sqlite3
from datetime import datetime

from database_functions.db_path import DATABASE_PATH

conn = sqlite3.connect(DATABASE_PATH)
cursor = conn.cursor()


def create_table():
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            user_id NUMERIC,
            user_name TEXT,
            user_first_name TEXT,
            user_last_name TEXT,
            user_phone TEXT,
            language TEXT,
            join_date TEXT,
            last_activity TEXT,
            ref_link INTEGER,
            is_subscribed INTEGER DEFAULT 0,
            is_reposted INTEGER DEFAULT 0,
            is_completed INTEGER DEFAULT 0
        )
    ''')
    conn.commit()

    # Add giveaway columns to existing table if they don't exist
    for col, col_type, default in [
        ('is_subscribed', 'INTEGER', 0),
        ('is_reposted', 'INTEGER', 0),
        ('is_completed', 'INTEGER', 0),
    ]:
        try:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col} {col_type} DEFAULT {default}")
            conn.commit()
        except Exception:
            pass


def add_user(user_id: str, user_name: str, user_first_name: str, user_last_name: str, language: str, ref_link: int = None):
    cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
    existing_user = cursor.fetchone()
    if existing_user is None:
        current_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute('''
            INSERT INTO users (user_id, user_name, user_first_name, user_last_name, language, join_date, last_activity, ref_link,
                               is_subscribed, is_reposted, is_completed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)
            ''', (user_id, user_name, user_first_name, user_last_name, language, current_date, current_date, ref_link))
        conn.commit()


def check_user(user_id: str):
    cursor.execute(f'SELECT * FROM users WHERE user_id = {user_id}')
    user = cursor.fetchone()
    if user:
        return True
    return False


def update_user_activity(user_id: str):
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M")
    cursor.execute('''
        UPDATE users 
        SET last_activity = ? 
        WHERE user_id = ?
    ''', (current_time, user_id))
    conn.commit()


def get_user_id_by_username(username: str):
    cursor.execute("SELECT user_id FROM users WHERE user_name = ?", (username,))
    result = cursor.fetchone()
    return result[0] if result else None


def resolve_telegram_user_identifier(raw: str):
    """
    Повертає (user_id, None) або (None, текст_помилки).
    Числовий ID приймаємо завжди. За @username шукаємо лише в таблиці users (реєстрація /start).
    """
    t = (raw or "").strip()
    if not t:
        return None, "Порожнє повідомлення."
    if re.fullmatch(r"[0-9]{1,15}", t):
        uid = int(t)
        if uid <= 0:
            return None, "Некоректний Telegram ID."
        return uid, None
    uname = t.lstrip("@").strip()
    if not uname:
        return None, "Надішли @username або числовий Telegram ID."
    cursor.execute(
        "SELECT user_id FROM users WHERE LOWER(user_name) = LOWER(?)",
        (uname,),
    )
    row = cursor.fetchone()
    if row:
        return int(row[0]), None
    return (
        None,
        "Користувача з таким username не знайдено. Нехай спочатку натисне /start у боті.",
    )


def get_username_by_user_id(user_id: str):
    cursor.execute("SELECT user_name FROM users WHERE user_id = ?", (user_id,))
    result = cursor.fetchone()
    return result[0] if result else None


def get_user_giveaway_status(user_id: int) -> dict:
    cursor.execute(
        "SELECT is_subscribed, is_reposted, is_completed FROM users WHERE user_id = ?",
        (user_id,)
    )
    row = cursor.fetchone()
    if row:
        return {'is_subscribed': row[0], 'is_reposted': row[1], 'is_completed': row[2]}
    return {'is_subscribed': 0, 'is_reposted': 0, 'is_completed': 0}


def set_user_subscribed(user_id: int):
    cursor.execute("UPDATE users SET is_subscribed = 1 WHERE user_id = ?", (user_id,))
    conn.commit()


def set_user_reposted(user_id: int):
    cursor.execute("UPDATE users SET is_reposted = 1 WHERE user_id = ?", (user_id,))
    conn.commit()


def set_user_completed(user_id: int):
    cursor.execute("UPDATE users SET is_completed = 1 WHERE user_id = ?", (user_id,))
    conn.commit()


def get_subscribed_count() -> int:
    cursor.execute("SELECT COUNT(*) FROM users WHERE is_subscribed = 1")
    return cursor.fetchone()[0]


def get_reposted_count() -> int:
    cursor.execute("SELECT COUNT(*) FROM users WHERE is_reposted = 1")
    return cursor.fetchone()[0]


def get_completed_count() -> int:
    cursor.execute("SELECT COUNT(*) FROM users WHERE is_completed = 1")
    return cursor.fetchone()[0]
