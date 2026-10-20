"""
Event memory: a small SQLite store answering "what changed?" and "where was X?".

Events are append-only and cheap; the assistant's object-finding and daily
briefing features read from here rather than from raw camera data, which is
also the privacy story - no frames are retained, only textual sightings.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from datetime import datetime, timedelta, timezone

_DB_PATH = os.environ.get(
    "AURA_DB",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "aura.db"),
)
_lock = threading.RLock()
_conn: sqlite3.Connection | None = None

_SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        TEXT    NOT NULL,
    kind      TEXT    NOT NULL,
    device_id TEXT,
    room      TEXT,
    source    TEXT    NOT NULL DEFAULT 'system',
    detail    TEXT    NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events (ts);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events (kind);
"""


def _db() -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is None:
            os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
            _conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
            _conn.row_factory = sqlite3.Row
            _conn.executescript(_SCHEMA)
        return _conn


def record_event(kind: str, device_id: str | None = None, room: str | None = None,
                 source: str = "system", detail: dict | None = None) -> dict:
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    payload = json.dumps(detail or {})
    with _lock:
        cur = _db().execute(
            "INSERT INTO events (ts, kind, device_id, room, source, detail) VALUES (?, ?, ?, ?, ?, ?)",
            (ts, kind, device_id, room, source, payload),
        )
        _conn.commit()
        event_id = cur.lastrowid
    return {"id": event_id, "ts": ts, "kind": kind, "device_id": device_id, "room": room, "source": source, "detail": detail or {}}


def query_events(since_minutes: int = 480, room: str | None = None,
                 kind: str | None = None, limit: int = 100) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(minutes=since_minutes)).isoformat(timespec="seconds")
    sql = "SELECT * FROM events WHERE ts >= ?"
    params: list = [since]
    if room:
        sql += " AND room = ?"
        params.append(room)
    if kind:
        sql += " AND kind = ?"
        params.append(kind)
    sql += " ORDER BY id DESC LIMIT ?"
    params.append(limit)
    with _lock:
        rows = _db().execute(sql, params).fetchall()
    return [
        {"id": r["id"], "ts": r["ts"], "kind": r["kind"], "device_id": r["device_id"],
         "room": r["room"], "source": r["source"], "detail": json.loads(r["detail"])}
        for r in rows
    ]


def record_object_sighting(object_name: str, location: str, room: str,
                            confidence: float, camera_id: str) -> dict:
    """A VLM-derived sighting - what 'find your keys' actually searches."""
    return record_event(
        kind="object_sighting",
        room=room,
        source=f"camera:{camera_id}",
        detail={"object": object_name, "location": location, "confidence": round(confidence, 2)},
    )


def find_object(object_name: str, since_minutes: int = 10080) -> list[dict]:
    """Most recent sightings of `object_name` (case-insensitive substring)."""
    since = (datetime.now(timezone.utc) - timedelta(minutes=since_minutes)).isoformat(timespec="seconds")
    with _lock:
        rows = _db().execute(
            "SELECT * FROM events WHERE kind = 'object_sighting' AND ts >= ? ORDER BY id DESC LIMIT 200",
            (since,),
        ).fetchall()
    needle = object_name.strip().lower()
    hits = []
    for r in rows:
        detail = json.loads(r["detail"])
        if needle in str(detail.get("object", "")).lower():
            hits.append({"ts": r["ts"], "room": r["room"], **detail})
    return hits
