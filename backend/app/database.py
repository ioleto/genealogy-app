from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(settings.database_url, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


def add_missing_columns(sync_conn) -> None:
    """Ajoute les colonnes de modèles ORM qui n'existent pas encore dans une
    base déjà créée par un déploiement précédent.

    L'application ne repose pas sur Alembic (délibérément, pour rester
    simple à déployer) : ``Base.metadata.create_all`` crée les NOUVELLES
    tables au démarrage, mais ne touche jamais aux tables déjà existantes.
    Sans ce filet, ajouter une colonne à un modèle (ex. Person.family_id)
    fait planter toute requête sur cette table dans une base plus ancienne,
    tant qu'une commande SQL manuelle n'a pas été appliquée. Cette fonction
    comble cet écart automatiquement, une fois pour toutes, à chaque
    démarrage — sans dépendance supplémentaire ni fichier de migration.
    """
    inspector = inspect(sync_conn)
    existing_tables = set(inspector.get_table_names())

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue  # table entièrement nouvelle : déjà créée par create_all
        existing_columns = {col["name"] for col in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in existing_columns:
                continue
            ddl_type = column.type.compile(dialect=sync_conn.dialect)
            sync_conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {ddl_type}'))
