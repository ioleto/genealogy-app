import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, schemas
from app.database import get_db
from app.deps import get_current_user, require_editor
from app.routers.uploads import UPLOAD_DIR

router = APIRouter(prefix="/api/documents", tags=["documents"])

DOCS_SUBDIR = "documents"
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx", ".txt"}
MAX_SIZE_BYTES = 20 * 1024 * 1024  # 20 Mo


@router.get("", response_model=list[schemas.DocumentOut])
async def list_documents(person_id: str, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return await crud.list_documents(db, person_id)


@router.post("", response_model=schemas.DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    person_id: str, file: UploadFile, db: AsyncSession = Depends(get_db), user=Depends(require_editor)
):
    person = await crud.get_person(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Fiche introuvable")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Format non supporté (PDF, image, Word ou texte)")

    contents = await file.read()
    if len(contents) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (20 Mo maximum)")

    full_dir = os.path.join(UPLOAD_DIR, DOCS_SUBDIR)
    os.makedirs(full_dir, exist_ok=True)
    stored_name = f"{uuid.uuid4()}{ext}"
    with open(os.path.join(full_dir, stored_name), "wb") as f:
        f.write(contents)

    return await crud.create_document(
        db,
        person_id=person_id,
        filename=file.filename or stored_name,
        stored_path=f"{DOCS_SUBDIR}/{stored_name}",
        content_type=file.content_type,
        size_bytes=len(contents),
        uploaded_by=user.id,
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: str, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    doc = await crud.get_document(db, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    full_path = os.path.join(UPLOAD_DIR, doc.stored_path)
    await crud.delete_document(db, doc)
    if os.path.exists(full_path):
        os.remove(full_path)
