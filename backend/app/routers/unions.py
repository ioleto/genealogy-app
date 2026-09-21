from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, schemas
from app.database import get_db
from app.deps import get_current_user, require_editor

router = APIRouter(prefix="/api/unions", tags=["unions"])


@router.post("", response_model=schemas.UnionOut, status_code=status.HTTP_201_CREATED)
async def create_union(data: schemas.UnionCreate, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    if data.partner1_id == data.partner2_id:
        raise HTTPException(status_code=400, detail="Les deux partenaires doivent être différents")
    return await crud.create_union(db, data)


@router.patch("/{union_id}", response_model=schemas.UnionOut)
async def update_union(
    union_id: str, data: schemas.UnionUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_editor)
):
    union = await crud.get_union(db, union_id)
    if not union:
        raise HTTPException(status_code=404, detail="Union introuvable")
    return await crud.update_union(db, union, data)


@router.delete("/{union_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_union(union_id: str, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    union = await crud.get_union(db, union_id)
    if not union:
        raise HTTPException(status_code=404, detail="Union introuvable")
    await crud.delete_union(db, union)


@router.post("/{union_id}/children", response_model=schemas.FiliationOut, status_code=status.HTTP_201_CREATED)
async def add_child(
    union_id: str, data: schemas.FiliationCreate, db: AsyncSession = Depends(get_db), _=Depends(require_editor)
):
    if data.union_id != union_id:
        raise HTTPException(status_code=400, detail="union_id incohérent")
    union = await crud.get_union(db, union_id)
    if not union:
        raise HTTPException(status_code=404, detail="Union introuvable")
    return await crud.create_filiation(db, data)


@router.delete("/filiations/{filiation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_child(filiation_id: str, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    filiation = await crud.get_filiation(db, filiation_id)
    if not filiation:
        raise HTTPException(status_code=404, detail="Filiation introuvable")
    await crud.delete_filiation(db, filiation)
