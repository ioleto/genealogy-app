from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, schemas
from app.database import get_db
from app.deps import get_current_user, require_editor

router = APIRouter(prefix="/api/persons", tags=["persons"])


@router.get("", response_model=list[schemas.PersonSummary])
async def list_persons(
    search: str | None = None,
    family_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    return await crud.list_persons(db, search, family_id)


@router.post("", response_model=schemas.PersonOut, status_code=status.HTTP_201_CREATED)
async def create_person(data: schemas.PersonCreate, db: AsyncSession = Depends(get_db), user=Depends(require_editor)):
    return await crud.create_person(db, data, created_by=user.id)


@router.get("/{person_id}", response_model=schemas.PersonOut)
async def get_person(person_id: str, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    person = await crud.get_person(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Fiche introuvable")
    return person


@router.patch("/{person_id}", response_model=schemas.PersonOut)
async def update_person(
    person_id: str, data: schemas.PersonUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_editor)
):
    person = await crud.get_person(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Fiche introuvable")
    return await crud.update_person(db, person, data)


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_person(person_id: str, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    person = await crud.get_person(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Fiche introuvable")
    try:
        await crud.delete_person(db, person)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Suppression impossible : cette fiche est encore liée à d'autres données.",
        )
