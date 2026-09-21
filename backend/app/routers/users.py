from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, models, schemas
from app.database import get_db
from app.deps import get_current_user, require_admin

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[schemas.UserOut])
async def list_users(db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    return await crud.list_users(db)


@router.post("", response_model=schemas.UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(data: schemas.UserCreate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    existing = await crud.get_user_by_email(db, data.email)
    if existing:
        raise HTTPException(status_code=400, detail="Un compte existe déjà avec cet email")
    return await crud.create_user(db, data)


@router.patch("/{user_id}", response_model=schemas.UserOut)
async def update_user(
    user_id: str, data: schemas.UserUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_admin)
):
    user = await db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    return await crud.update_user(db, user, data)


@router.patch("/me/theme", response_model=schemas.UserOut)
async def update_my_theme(
    data: schemas.ThemeUpdate, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)
):
    return await crud.update_theme(db, current_user, data)
