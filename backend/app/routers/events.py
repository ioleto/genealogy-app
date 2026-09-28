from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, schemas
from app.database import get_db
from app.deps import get_current_user, require_editor

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=list[schemas.EventOut])
async def list_events(person_id: str, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return await crud.list_events(db, person_id)


@router.post("", response_model=schemas.EventOut, status_code=status.HTTP_201_CREATED)
async def create_event(
    person_id: str, data: schemas.EventCreate, db: AsyncSession = Depends(get_db), _=Depends(require_editor)
):
    person = await crud.get_person(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Fiche introuvable")
    return await crud.create_event(db, person_id, data)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(event_id: str, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    event = await crud.get_event(db, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Événement introuvable")
    await crud.delete_event(db, event)


@router.post(
    "/{event_id}/participants", response_model=schemas.EventParticipantOut, status_code=status.HTTP_201_CREATED
)
async def add_participant(
    event_id: str,
    data: schemas.EventParticipantCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_editor),
):
    event = await crud.get_event(db, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Événement introuvable")
    return await crud.add_event_participant(db, event_id, data)


@router.delete("/participants/{participant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_participant(participant_id: str, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    participant = await crud.get_event_participant(db, participant_id)
    if not participant:
        raise HTTPException(status_code=404, detail="Participant introuvable")
    await crud.remove_event_participant(db, participant)
