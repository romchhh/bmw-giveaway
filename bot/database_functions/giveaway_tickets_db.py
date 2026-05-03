import secrets
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

from database_functions.db_path import DATABASE_PATH

MAX_TICKETS_PER_USER = 10


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


def _giveaway_total_cap() -> int:
    from config import giveaway_total_tickets

    return int(giveaway_total_tickets)


def _random_six_digit_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def admin_fulfill_tickets(
    target_user_id: int,
    quantity: int,
    order_reference: str,
) -> Dict[str, Any]:
    """
    Нарахувати квитки як у мінідодатку (6-значні коди, order_reference, ліміти пулу та на юзера).
    Ідемпотентно за order_reference.
    """
    if not isinstance(quantity, int) or quantity < 1 or quantity > MAX_TICKETS_PER_USER:
        return {"ok": False, "error": "bad_quantity"}

    conn = sqlite3.connect(DATABASE_PATH)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT code FROM giveaway_tickets WHERE order_reference = ? ORDER BY id ASC",
            (order_reference,),
        )
        existing = [r[0] for r in cur.fetchall()]
        if existing:
            return {"ok": True, "codes": existing, "idempotent": True}

        cur.execute("SELECT COUNT(*) FROM giveaway_tickets")
        sold = int(cur.fetchone()[0])
        cur.execute(
            "SELECT COUNT(*) FROM giveaway_tickets WHERE user_id = ?",
            (target_user_id,),
        )
        user_cnt = int(cur.fetchone()[0])
        cap = _giveaway_total_cap()

        if user_cnt + quantity > MAX_TICKETS_PER_USER:
            return {"ok": False, "error": "user_cap"}
        if sold + quantity > cap:
            return {"ok": False, "error": "pool_exhausted"}

        created_at = (
            datetime.now(timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z")
        )
        codes: List[str] = []

        cur.execute("BEGIN IMMEDIATE")
        try:
            for _ in range(quantity):
                inserted = False
                for _attempt in range(100):
                    code = _random_six_digit_code()
                    try:
                        cur.execute(
                            """
                            INSERT INTO giveaway_tickets (user_id, code, created_at, order_reference)
                            VALUES (?, ?, ?, ?)
                            """,
                            (target_user_id, code, created_at, order_reference),
                        )
                        codes.append(code)
                        inserted = True
                        break
                    except sqlite3.IntegrityError:
                        continue
                if not inserted:
                    cur.execute("ROLLBACK")
                    return {"ok": False, "error": "server"}
            cur.execute("COMMIT")
        except Exception:
            cur.execute("ROLLBACK")
            raise

        return {"ok": True, "codes": codes, "idempotent": False}
    finally:
        conn.close()
