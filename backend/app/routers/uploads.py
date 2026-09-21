import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile

from app.deps import require_editor

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

UPLOAD_DIR = "uploads"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_SIZE_BYTES = 8 * 1024 * 1024  # 8 Mo


@router.post("")
async def upload_photo(file: UploadFile, _=Depends(require_editor)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Format d'image non supporté (jpg, png, webp)")

    contents = await file.read()
    if len(contents) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="Image trop volumineuse (8 Mo maximum)")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    filename = f"{uuid.uuid4()}{ext}"
    path = os.path.join(UPLOAD_DIR, filename)
    with open(path, "wb") as f:
        f.write(contents)

    return {"url": f"/uploads/{filename}"}
