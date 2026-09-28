from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, schemas
from app.database import get_db
from app.deps import get_current_user, require_editor

router = APIRouter(prefix="/api/research-notes", tags=["research-notes"])


class _CreateBody(BaseModel):
    text: str


@router.get("", response_model=list[schemas.ResearchNoteOut])
async def list_notes(person_id: str, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return await crud.list_research_notes(db, person_id)


@router.post("", response_model=schemas.ResearchNoteOut, status_code=status.HTTP_201_CREATED)
async def create_note(
    person_id: str, data: _CreateBody, db: AsyncSession = Depends(get_db), _=Depends(require_editor)
):
    person = await crud.get_person(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Fiche introuvable")
    return await crud.create_research_note(db, person_id, data.text)


@router.patch("/{note_id}", response_model=schemas.ResearchNoteOut)
async def update_note(
    note_id: str, data: schemas.ResearchNoteUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_editor)
):
    note = await crud.get_research_note(db, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note introuvable")
    return await crud.update_research_note(db, note, data)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(note_id: str, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    note = await crud.get_research_note(db, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note introuvable")
    await crud.delete_research_note(db, note)
