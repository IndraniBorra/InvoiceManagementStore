import os
from sqlmodel import SQLModel, create_engine, Session

DATABASE_URL = os.getenv("DATABASE_URL", "")

if DATABASE_URL:
    # Production: PostgreSQL on RDS
    # Requires: DATABASE_URL=postgresql://user:pass@host:5432/dbname?sslmode=require
    connect_args = {"sslmode": "require"} if "postgresql" in DATABASE_URL else {}
    engine = create_engine(DATABASE_URL, connect_args=connect_args, echo=False)
else:
    # Local development: SQLite fallback
    engine = create_engine("sqlite:///database.db", echo=False)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine, checkfirst=True)


def get_session():
    with Session(engine) as session:
        yield session
