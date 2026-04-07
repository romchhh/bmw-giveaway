from pathlib import Path

# Корінь проєкту /database/data.db — не залежить від cwd при запуску бота
_ROOT = Path(__file__).resolve().parent.parent.parent
DATABASE_PATH = _ROOT / "database" / "data.db"
DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
