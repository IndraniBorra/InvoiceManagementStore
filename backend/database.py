from sqlmodel import SQLModel, create_engine, Session

# sqlite_file_name = "database.db"
# sqlite_url = f"sqlite:///{sqlite_file_name}"


postgres_url = "postgresql://1bfc85d008b0720bce3a7c5d1ad4af68144e9d12fe2671104496e8c082f6dd16:sk_AVzi1er3NSeMQX6pqGDji@db.prisma.io:5432/?sslmode=require"

engine = create_engine(postgres_url, echo=True)

def create_db_and_tables():

    SQLModel.metadata.create_all(engine, checkfirst=True)


def get_session():
    with Session(engine) as session:
        yield session
