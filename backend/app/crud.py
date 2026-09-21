from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import models, schemas
from app.security import hash_password


# ---------- Users ----------

async def get_user_by_email(db: AsyncSession, email: str) -> models.User | None:
    result = await db.execute(select(models.User).where(models.User.email == email))
    return result.scalar_one_or_none()


async def count_users(db: AsyncSession) -> int:
    result = await db.execute(select(models.User))
    return len(result.scalars().all())


async def create_user(db: AsyncSession, data: schemas.UserCreate) -> models.User:
    user = models.User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def list_users(db: AsyncSession) -> list[models.User]:
    result = await db.execute(select(models.User).order_by(models.User.full_name))
    return list(result.scalars().all())


async def update_user(db: AsyncSession, user: models.User, data: schemas.UserUpdate) -> models.User:
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.role is not None:
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.password:
        user.hashed_password = hash_password(data.password)
    await db.commit()
    await db.refresh(user)
    return user


async def update_theme(db: AsyncSession, user: models.User, data: schemas.ThemeUpdate) -> models.User:
    if data.theme_primary_color is not None:
        user.theme_primary_color = data.theme_primary_color
    if data.theme_secondary_color is not None:
        user.theme_secondary_color = data.theme_secondary_color
    await db.commit()
    await db.refresh(user)
    return user


# ---------- Persons ----------

async def create_person(db: AsyncSession, data: schemas.PersonCreate, created_by: str) -> models.Person:
    person = models.Person(**data.model_dump(), created_by=created_by)
    db.add(person)
    await db.commit()
    await db.refresh(person)
    return person


async def get_person(db: AsyncSession, person_id: str) -> models.Person | None:
    result = await db.execute(select(models.Person).where(models.Person.id == person_id))
    return result.scalar_one_or_none()


async def list_persons(db: AsyncSession, search: str | None = None) -> list[models.Person]:
    stmt = select(models.Person)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            or_(
                models.Person.first_name.ilike(like),
                models.Person.last_name.ilike(like),
                models.Person.birth_last_name.ilike(like),
            )
        )
    stmt = stmt.order_by(models.Person.last_name, models.Person.first_name)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_person(db: AsyncSession, person: models.Person, data: schemas.PersonUpdate) -> models.Person:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(person, field, value)
    await db.commit()
    await db.refresh(person)
    return person


async def delete_person(db: AsyncSession, person: models.Person) -> None:
    await db.delete(person)
    await db.commit()


# ---------- Unions ----------

async def create_union(db: AsyncSession, data: schemas.UnionCreate) -> models.Union:
    union = models.Union(**data.model_dump())
    db.add(union)
    await db.commit()
    await db.refresh(union)
    return union


async def get_union(db: AsyncSession, union_id: str) -> models.Union | None:
    result = await db.execute(select(models.Union).where(models.Union.id == union_id))
    return result.scalar_one_or_none()


async def update_union(db: AsyncSession, union: models.Union, data: schemas.UnionUpdate) -> models.Union:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(union, field, value)
    await db.commit()
    await db.refresh(union)
    return union


async def delete_union(db: AsyncSession, union: models.Union) -> None:
    await db.delete(union)
    await db.commit()


# ---------- Filiations ----------

async def create_filiation(db: AsyncSession, data: schemas.FiliationCreate) -> models.Filiation:
    filiation = models.Filiation(**data.model_dump())
    db.add(filiation)
    await db.commit()
    await db.refresh(filiation)
    return filiation


async def delete_filiation(db: AsyncSession, filiation: models.Filiation) -> None:
    await db.delete(filiation)
    await db.commit()


async def get_filiation(db: AsyncSession, filiation_id: str) -> models.Filiation | None:
    result = await db.execute(select(models.Filiation).where(models.Filiation.id == filiation_id))
    return result.scalar_one_or_none()


# ---------- Full graph (for tree rendering) ----------

async def get_full_graph(db: AsyncSession) -> tuple[list[models.Person], list[models.Union], list[models.Filiation]]:
    persons = (await db.execute(select(models.Person))).scalars().all()
    unions = (await db.execute(select(models.Union))).scalars().all()
    filiations = (await db.execute(select(models.Filiation))).scalars().all()
    return list(persons), list(unions), list(filiations)
