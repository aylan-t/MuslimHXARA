import json
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_unexpired(value: Optional[str], now: Optional[datetime] = None) -> bool:
    if not value:
        return False
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed > (now or datetime.now(timezone.utc))
    except (TypeError, ValueError):
        return False


class FreightRepository:
    """Small SQLite quote bank. Connections are short-lived for request safety."""
    def __init__(self, db_path: str = "data/freight_rates.db"):
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._initialize()

    def _connect(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _initialize(self):
        with self._lock, self._connect() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS offers (
                  id TEXT PRIMARY KEY, route_id TEXT NOT NULL, origin_port TEXT NOT NULL,
                  destination_port TEXT NOT NULL, mode TEXT NOT NULL, provider TEXT NOT NULL,
                  payload TEXT NOT NULL, retrieved_at TEXT NOT NULL, valid_until TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_offer_route ON offers(route_id, valid_until);
                CREATE TABLE IF NOT EXISTS rfqs (
                  id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS provider_observations (
                  id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL,
                  route_id TEXT, status TEXT NOT NULL, observed_at TEXT NOT NULL,
                  detail TEXT
                );
            """)

    def save_offer(self, offer: Dict[str, Any], route: Dict[str, Any]) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("""
              INSERT OR REPLACE INTO offers
              (id,route_id,origin_port,destination_port,mode,provider,payload,retrieved_at,valid_until,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?)
            """, (offer["id"], route["id"], route["originPort"], route["destinationPort"],
                  route["mode"], offer["provider"], json.dumps(offer), offer["retrievedAt"],
                  offer["validUntil"], utc_now()))

    def current_offers(self, route_id: str) -> List[Dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute("SELECT payload FROM offers WHERE route_id=?", (route_id,)).fetchall()
        return [json.loads(row["payload"]) for row in rows
                if is_unexpired(json.loads(row["payload"]).get("validUntil"))]

    def all_current_offers(self) -> List[Dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute("SELECT payload FROM offers").fetchall()
        return [json.loads(row["payload"]) for row in rows
                if is_unexpired(json.loads(row["payload"]).get("validUntil"))]

    def save_rfq(self, rfq: Dict[str, Any]) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("INSERT INTO rfqs(id,payload,created_at) VALUES (?,?,?)",
                         (rfq["id"], json.dumps(rfq), rfq["createdAt"]))

    def get_rfq(self, rfq_id: str) -> Optional[Dict[str, Any]]:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT payload FROM rfqs WHERE id=?", (rfq_id,)).fetchone()
        return json.loads(row["payload"]) if row else None

    def observe(self, provider: str, status: str, route_id: Optional[str] = None,
                detail: Optional[str] = None) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("""INSERT INTO provider_observations(provider,route_id,status,observed_at,detail)
                            VALUES (?,?,?,?,?)""",
                         (provider, route_id, status, utc_now(), detail))

    def observations(self) -> List[Dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute("""SELECT provider,route_id,status,observed_at,detail
                                   FROM provider_observations ORDER BY id DESC LIMIT 100""").fetchall()
        return [dict(row) for row in rows]