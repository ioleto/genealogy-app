from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, schemas
from app.database import get_db
from app.deps import get_current_user, require_editor

router = APIRouter(prefix="/api/union-witnesses", tags=["union-witnesses"])


@router.get("", response_model=list[schemas.UnionWitnessOut])
async def list_witnesses(union_id: str, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return await crud.list_union_witnesses(db, union_id)


@router.post("", response_model=schemas.UnionWitnessOut, status_code=status.HTTP_201_CREATED)
async def add_witness(
    union_id: str, data: schemas.UnionWitnessCreate, db: AsyncSession = Depends(get_db), _=Depends(require_editor)
):
    union = await crud.get_union(db, union_id)
    if not union:
        raise HTTPException(status_code=404, detail="Union introuvable")
    return await crud.add_union_witness(db, union_id, data)


@router.delete("/{witness_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_witness(witness_id: str, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    witness = await crud.get_union_witness(db, witness_id)
    if not witness:
        raise HTTPException(status_code=404, detail="Témoin introuvable")
    await crud.remove_union_witness(db, witness)
