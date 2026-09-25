from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.config import get_settings
from app.database import AsyncSessionLocal, Base, add_missing_columns, engine
from app.models import User, UserRole
from app.routers import auth, documents, families, gedcom, persons, tree, unions, uploads, users
from app.security import hash_password

settings = get_settings()


async def ensure_schema_and_admin() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(add_missing_columns)

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User))
        if result.first() is None:
            admin = User(
                email=settings.admin_email,
                hashed_password=hash_password(settings.admin_password),
                full_name=settings.admin_full_name,
                role=UserRole.admin,
            )
            db.add(admin)
            await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_schema_and_admin()
    yield


app = FastAPI(title="Arbre Généalogique", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(persons.router)
app.include_router(unions.router)
app.include_router(families.router)
app.include_router(documents.router)
app.include_router(tree.router)
app.include_router(uploads.router)
app.include_router(gedcom.router)

os.makedirs(uploads.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads.UPLOAD_DIR), name="uploads")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
