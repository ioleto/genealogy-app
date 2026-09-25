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


async def list_persons(db: AsyncSession, search: str | None = None, family_id: str | None = None) -> list[models.Person]:
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
    if family_id:
        stmt = stmt.where(models.Person.family_id == family_id)
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
    """Supprime une fiche en détachant proprement ses liens familiaux plutôt
    que de laisser la contrainte de clé étrangère bloquer la suppression :
    - ses propres filiations (son lien en tant qu'enfant) sont supprimées ;
    - les unions où elle est partenaire sont préservées quand l'autre
      partenaire est connu (elle est simplement retirée de l'union, qui
      garde ses enfants), et supprimées seulement si elle en était l'unique
      partenaire connu.
    """
    result = await db.execute(select(models.Filiation).where(models.Filiation.child_id == person.id))
    for filiation in result.scalars().all():
        await db.delete(filiation)

    result = await db.execute(
        select(models.Union).where(
            or_(models.Union.partner1_id == person.id, models.Union.partner2_id == person.id)
        )
    )
    for union in result.scalars().all():
        if union.partner1_id == person.id:
            if union.partner2_id is not None:
                union.partner1_id = union.partner2_id
                union.partner2_id = None
            else:
                await db.delete(union)
        elif union.partner2_id == person.id:
            union.partner2_id = None

    await db.flush()
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


# ---------- Documents ----------

async def create_document(
    db: AsyncSession,
    person_id: str,
    filename: str,
    stored_path: str,
    content_type: str | None,
    size_bytes: int,
    uploaded_by: str | None,
) -> models.Document:
    doc = models.Document(
        person_id=person_id,
        filename=filename,
        stored_path=stored_path,
        content_type=content_type,
        size_bytes=size_bytes,
        uploaded_by=uploaded_by,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


async def list_documents(db: AsyncSession, person_id: str) -> list[models.Document]:
    result = await db.execute(
        select(models.Document).where(models.Document.person_id == person_id).order_by(models.Document.created_at)
    )
    return list(result.scalars().all())


async def get_document(db: AsyncSession, document_id: str) -> models.Document | None:
    result = await db.execute(select(models.Document).where(models.Document.id == document_id))
    return result.scalar_one_or_none()


async def delete_document(db: AsyncSession, doc: models.Document) -> None:
    await db.delete(doc)
    await db.commit()


# ---------- Families ----------

async def list_families(db: AsyncSession) -> list[models.Family]:
    result = await db.execute(select(models.Family).order_by(models.Family.name))
    return list(result.scalars().all())


async def get_family(db: AsyncSession, family_id: str) -> models.Family | None:
    result = await db.execute(select(models.Family).where(models.Family.id == family_id))
    return result.scalar_one_or_none()


async def get_family_by_name(db: AsyncSession, name: str) -> models.Family | None:
    result = await db.execute(select(models.Family).where(models.Family.name == name))
    return result.scalar_one_or_none()


async def create_family(db: AsyncSession, name: str) -> models.Family:
    family = models.Family(name=name)
    db.add(family)
    await db.commit()
    await db.refresh(family)
    return family


async def rename_family(db: AsyncSession, family: models.Family, name: str) -> models.Family:
    family.name = name
    await db.commit()
    await db.refresh(family)
    return family


async def delete_family(db: AsyncSession, family: models.Family) -> None:
    # Les fiches de cette famille ne sont pas supprimées : la contrainte
    # ON DELETE SET NULL les détache simplement de la famille.
    await db.delete(family)
    await db.commit()
