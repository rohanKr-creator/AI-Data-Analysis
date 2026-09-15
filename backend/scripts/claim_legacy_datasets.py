"""Utility script to inspect and backfill user_id on legacy datasets.

Usage:
    python scripts/claim_legacy_datasets.py --list
    python scripts/claim_legacy_datasets.py --claim --user-id <SUPABASE_USER_UUID>
"""

import argparse
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.dataset import Dataset


def list_unowned_datasets():
    """List all datasets that have user_id = NULL."""
    session = SessionLocal()
    try:
        datasets = session.query(Dataset).filter(Dataset.user_id.is_(None)).all()
        print(f"\nFound {len(datasets)} unowned legacy dataset(s):")
        for d in datasets:
            print(f"  - ID: {d.id} | Filename: {d.original_filename} | Rows: {d.row_count} | Uploaded: {d.created_at}")
        print()
    finally:
        session.close()


def claim_datasets(target_user_id: str):
    """Assign all unowned datasets (user_id IS NULL) to target_user_id."""
    session = SessionLocal()
    try:
        unowned_count = session.query(Dataset).filter(Dataset.user_id.is_(None)).count()
        if unowned_count == 0:
            print("\nNo unowned datasets found. All datasets are already assigned to users.")
            return

        updated = (
            session.query(Dataset)
            .filter(Dataset.user_id.is_(None))
            .update({Dataset.user_id: target_user_id}, synchronize_session=False)
        )
        session.commit()
        print(f"\nSuccessfully assigned {updated} legacy dataset(s) to user '{target_user_id}'.\n")
    except Exception as e:
        session.rollback()
        print(f"\nError claiming datasets: {e}")
    finally:
        session.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inspect and claim unowned legacy datasets.")
    parser.add_argument("--list", action="store_true", help="List all datasets where user_id IS NULL")
    parser.add_argument("--claim", action="store_true", help="Assign unowned datasets to a user")
    parser.add_argument("--user-id", type=str, help="Target Supabase User UUID to assign legacy datasets to")

    args = parser.parse_args()

    if args.claim:
        if not args.user_id:
            print("Error: --user-id <UUID> is required when --claim is specified.")
            sys.exit(1)
        claim_datasets(args.user_id.strip())
    else:
        list_unowned_datasets()
