"""One-time CLI entry point for creating the synthetic preview ledger."""

from app.database import engine
from app.demo_seed import seed_large_ledger_if_empty


if __name__ == "__main__":
    seed_large_ledger_if_empty(engine)
