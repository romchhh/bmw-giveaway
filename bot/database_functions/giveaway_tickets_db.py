import sqlite3
from typing import Any, List, Tuple

from database_functions.db_path import DATABASE_PATH


def create_giveaway_tickets_table():
    conn = sqlite3.connect(DATABASE_PATH)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS giveaway_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            code TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL
        )
    """)
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_giveaway_tickets_user_id ON giveaway_tickets(user_id)"
    )
    cur.execute("""
        CREATE TABLE IF NOT EXISTS giveaway_checkouts (
            order_reference TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            amount_usd REAL NOT NULL,
            provider TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL
        )
    """)
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_giveaway_checkouts_user ON giveaway_checkouts(user_id)"
    )
    checkout_cols = [r[1] for r in cur.execute("PRAGMA table_info(giveaway_checkouts)").fetchall()]
    if checkout_cols and "amount_usd" not in checkout_cols and "amount_uah" in checkout_cols:
        try:
            cur.execute("ALTER TABLE giveaway_checkouts ADD COLUMN amount_usd REAL")
            cur.execute(
                "UPDATE giveaway_checkouts SET amount_usd = amount_uah WHERE amount_usd IS NULL"
            )
        except sqlite3.OperationalError:
            pass
    checkout_cols2 = [r[1] for r in cur.execute("PRAGMA table_info(giveaway_checkouts)").fetchall()]
    for col_sql in (
        "ALTER TABLE giveaway_checkouts ADD COLUMN wayforpay_bridge_token TEXT",
        "ALTER TABLE giveaway_checkouts ADD COLUMN wayforpay_form_json TEXT",
    ):
        if checkout_cols2:
            try:
                cur.execute(col_sql)
            except sqlite3.OperationalError:
                pass
    cols = [r[1] for r in cur.execute("PRAGMA table_info(giveaway_tickets)").fetchall()]
    if "order_reference" not in cols:
        try:
            cur.execute("ALTER TABLE giveaway_tickets ADD COLUMN order_reference TEXT")
        except sqlite3.OperationalError:
            pass
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_giveaway_tickets_order_ref ON giveaway_tickets(order_reference)"
    )
    conn.commit()
    conn.close()


def get_tickets_sold_count() -> int:
    conn = sqlite3.connect(DATABASE_PATH)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM giveaway_tickets")
    n = cur.fetchone()[0]
    conn.close()
    return int(n)


def get_tickets_buyers_count() -> int:
    conn = sqlite3.connect(DATABASE_PATH)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(DISTINCT user_id) FROM giveaway_tickets")
    n = cur.fetchone()[0]
    conn.close()
    return int(n)


def get_tickets_top_buyers(limit: int = 5) -> List[Tuple[int, int, str]]:
    """user_id, tickets_count, username (може бути порожнім)."""
    conn = sqlite3.connect(DATABASE_PATH)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT t.user_id, COUNT(*) AS cnt,
               IFNULL(MAX(u.user_name), '') AS username
        FROM giveaway_tickets t
        LEFT JOIN users u ON u.user_id = t.user_id
        GROUP BY t.user_id
        ORDER BY cnt DESC
        LIMIT ?
        """,
        (limit,),
    )
    rows = cur.fetchall()
    conn.close()
    return [(int(r[0]), int(r[1]), str(r[2] or "")) for r in rows]


def get_all_tickets_for_export() -> Tuple[List[Tuple[Any, ...]], List[str]]:
    """Рядки для експорту: id, user_id, username, code, created_at."""
    conn = sqlite3.connect(DATABASE_PATH)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT t.id, t.user_id, IFNULL(u.user_name, ''), t.code, t.created_at
        FROM giveaway_tickets t
        LEFT JOIN users u ON u.user_id = t.user_id
        ORDER BY t.id ASC
        """
    )
    rows = cur.fetchall()
    conn.close()
    columns = ["id", "user_id", "username", "code", "created_at"]
    return rows, columns
