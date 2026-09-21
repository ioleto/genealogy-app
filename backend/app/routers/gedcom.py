from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, gedcom
from app.database import get_db
from app.deps import get_current_user, require_editor

router = APIRouter(prefix="/api/gedcom", tags=["gedcom"])


@router.get("/export")
async def export_gedcom(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    persons, unions, filiations = await crud.get_full_graph(db)
    content = gedcom.export_gedcom(persons, unions, filiations)
    return Response(
        content=content.encode("utf-8"),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=arbre-genealogique.ged"},
    )


@router.post("/import")
async def import_gedcom(file: UploadFile, db: AsyncSession = Depends(get_db), user=Depends(require_editor)):
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1", errors="replace")

    try:
        parsed = gedcom.parse_gedcom(text)
    except Exception:
        raise HTTPException(status_code=400, detail="Fichier GEDCOM illisible ou mal formé")

    if not parsed.persons:
        raise HTTPException(status_code=400, detail="Aucune fiche trouvée dans ce fichier")

    return await gedcom.apply_import(db, parsed, created_by=user.id)
