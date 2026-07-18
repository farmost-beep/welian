#!/usr/bin/env python3
"""Migrate existing JSON data files to SQLite.

Usage:
    python3 scripts/migrate_json_to_sqlite.py [--data-dir ~/.welian/data]

Reads contacts.json, timeline.json, todos.json, usage.json from the
specified data directory and imports them into welian.db (SQLite).
Existing SQLite data is replaced.

After migration, the JSON files are kept as backup (renamed to .json.bak).
"""
import argparse
import json
import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from welian.datastore import DataStore


def migrate(data_dir: str, dry_run: bool = False):
    data_path = Path(data_dir)
    if not data_path.exists():
        print(f"❌ Data directory not found: {data_path}")
        return 1

    json_files = {
        "contacts": data_path / "contacts.json",
        "timeline": data_path / "timeline.json",
        "todos": data_path / "todos.json",
        "usage": data_path / "usage.json",
    }

    # Check which files exist
    found = {name: path for name, path in json_files.items() if path.exists()}
    if not found:
        print(f"ℹ️  No JSON files found in {data_path} — nothing to migrate.")
        return 0

    print(f"📂 Data directory: {data_path}")
    for name, path in found.items():
        size = path.stat().st_size
        print(f"   {name}.json: {size:,} bytes")

    if dry_run:
        print("\n🔍 Dry run — no changes will be made.")
        for name, path in found.items():
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            count = len(data) if isinstance(data, (list, dict)) else 0
            print(f"   {name}: {count} records")
        return 0

    # Create DataStore (creates welian.db)
    store = DataStore(data_path)
    db = store.db

    # Migrate contacts
    if "contacts" in found:
        with open(found["contacts"], "r", encoding="utf-8") as f:
            contacts = json.load(f)
        store.save_contacts(contacts)
        print(f"✅ contacts: {db.count('contacts')} records → SQLite")

    # Migrate timeline
    if "timeline" in found:
        with open(found["timeline"], "r", encoding="utf-8") as f:
            timeline = json.load(f)
        store.save_timeline(timeline)
        print(f"✅ timeline: {db.count('timeline')} records → SQLite")

    # Migrate todos
    if "todos" in found:
        with open(found["todos"], "r", encoding="utf-8") as f:
            todos = json.load(f)
        store.save_todos(todos)
        print(f"✅ todos: {db.count('todos')} records → SQLite")

    # Migrate usage
    if "usage" in found:
        with open(found["usage"], "r", encoding="utf-8") as f:
            usage = json.load(f)
        if isinstance(usage, list):
            usage = {}
        store.save_usage(usage)
        print(f"✅ usage: {db.count('usage')} records → SQLite")

    # Backup JSON files
    for name, path in found.items():
        bak = path.with_suffix(".json.bak")
        path.rename(bak)
        print(f"📦 Backed up: {path.name} → {bak.name}")

    db_path = data_path / "welian.db"
    print(f"\n🎉 Migration complete: {db_path} ({db_path.stat().st_size:,} bytes)")
    return 0


def main():
    parser = argparse.ArgumentParser(description="Migrate JSON data to SQLite")
    parser.add_argument(
        "--data-dir",
        default=str(Path.home() / ".welian" / "data"),
        help="Data directory containing JSON files (default: ~/.welian/data)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be migrated without making changes",
    )
    args = parser.parse_args()
    sys.exit(migrate(args.data_dir, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
