from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, schemas
from app.database import get_db
from app.deps import get_current_user, require_editor

router = APIRouter(prefix="/api/families", tags=["families"])


@router.get("", response_model=list[schemas.FamilyOut])
async def list_families(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return await crud.list_families(db)


@router.post("", response_model=schemas.FamilyOut, status_code=status.HTTP_201_CREATED)
async def create_family(data: schemas.FamilyCreate, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Le nom de la famille ne peut pas être vide")
    if await crud.get_family_by_name(db, name):
        raise HTTPException(status_code=400, detail="Une famille porte déjà ce nom")
    return await crud.create_family(db, name)


@router.patch("/{family_id}", response_model=schemas.FamilyOut)
async def rename_family(
    family_id: str, data: schemas.FamilyUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_editor)
):
    family = await crud.get_family(db, family_id)
    if not family:
        raise HTTPException(status_code=404, detail="Famille introuvable")
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Le nom de la famille ne peut pas être vide")
    return await crud.rename_family(db, family, name)


@router.delete("/{family_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_family(family_id: str, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    family = await crud.get_family(db, family_id)
    if not family:
        raise HTTPException(status_code=404, detail="Famille introuvable")
    await crud.delete_family(db, family)
