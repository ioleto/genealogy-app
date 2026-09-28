from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, schemas
from app.database import get_db
from app.deps import get_current_user, require_editor

router = APIRouter(prefix="/api/sources", tags=["sources"])
citations_router = APIRouter(prefix="/api/citations", tags=["citations"])


@router.get("", response_model=list[schemas.SourceOut])
async def list_sources(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return await crud.list_sources(db)


@router.post("", response_model=schemas.SourceOut, status_code=status.HTTP_201_CREATED)
async def create_source(data: schemas.SourceCreate, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    return await crud.create_source(db, data)


@router.patch("/{source_id}", response_model=schemas.SourceOut)
async def update_source(
    source_id: str, data: schemas.SourceUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_editor)
):
    source = await crud.get_source(db, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source introuvable")
    return await crud.update_source(db, source, data)


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(source_id: str, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    source = await crud.get_source(db, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source introuvable")
    await crud.delete_source(db, source)


@citations_router.get("", response_model=list[schemas.CitationOut])
async def list_citations(
    person_id: str | None = None,
    union_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    if person_id:
        return await crud.list_citations_for_person(db, person_id)
    if union_id:
        return await crud.list_citations_for_union(db, union_id)
    raise HTTPException(status_code=400, detail="Précisez person_id ou union_id")


@citations_router.post("", response_model=schemas.CitationOut, status_code=status.HTTP_201_CREATED)
async def create_citation(data: schemas.CitationCreate, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    if not data.person_id and not data.union_id:
        raise HTTPException(status_code=400, detail="Une citation doit être rattachée à une fiche ou une union")
    source = await crud.get_source(db, data.source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source introuvable")
    return await crud.create_citation(db, data)


@citations_router.delete("/{citation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_citation(citation_id: str, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    citation = await crud.get_citation(db, citation_id)
    if not citation:
        raise HTTPException(status_code=404, detail="Citation introuvable")
    await crud.delete_citation(db, citation)
