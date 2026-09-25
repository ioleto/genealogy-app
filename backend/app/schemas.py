from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, EmailStr, ConfigDict

from app.models import FiliationType, Sex, UnionType, UserRole


# ---------- Auth / Users ----------

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole = UserRole.viewer


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None
    password: str | None = None


class ThemeUpdate(BaseModel):
    theme_primary_color: str | None = None
    theme_secondary_color: str | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool
    theme_primary_color: str | None = None
    theme_secondary_color: str | None = None
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------- Document ----------

class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    person_id: str
    filename: str
    url: str
    content_type: str | None = None
    size_bytes: int
    created_at: datetime


# ---------- Family ----------

class FamilyCreate(BaseModel):
    name: str


class FamilyUpdate(BaseModel):
    name: str


class FamilyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime


# ---------- Person ----------

class PersonBase(BaseModel):
    first_name: str
    last_name: str
    birth_last_name: str | None = None
    sex: Sex = Sex.unknown
    birth_date: date | None = None
    birth_date_approx: bool = False
    birth_place: str | None = None
    death_date: date | None = None
    death_date_approx: bool = False
    death_place: str | None = None
    occupation: str | None = None
    biography: str | None = None
    photo_url: str | None = None
    family_id: str | None = None


class PersonCreate(PersonBase):
    pass


class PersonUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    birth_last_name: str | None = None
    sex: Sex | None = None
    birth_date: date | None = None
    birth_date_approx: bool | None = None
    birth_place: str | None = None
    death_date: date | None = None
    death_date_approx: bool | None = None
    death_place: str | None = None
    occupation: str | None = None
    biography: str | None = None
    photo_url: str | None = None
    family_id: str | None = None


class PersonOut(PersonBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime


class PersonSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    first_name: str
    last_name: str
    birth_date: date | None = None
    death_date: date | None = None
    sex: Sex
    family_id: str | None = None


# ---------- Union / Filiation ----------

class UnionCreate(BaseModel):
    partner1_id: str
    partner2_id: str | None = None
    union_type: UnionType = UnionType.unknown
    union_date: date | None = None
    union_date_approx: bool = False
    union_place: str | None = None
    end_date: date | None = None
    end_reason: str | None = None
    notes: str | None = None


class UnionUpdate(BaseModel):
    union_type: UnionType | None = None
    union_date: date | None = None
    union_date_approx: bool | None = None
    union_place: str | None = None
    end_date: date | None = None
    end_reason: str | None = None
    notes: str | None = None


class UnionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    partner1_id: str
    partner2_id: str | None = None
    union_type: UnionType
    union_date: date | None = None
    union_date_approx: bool = False
    union_place: str | None = None
    end_date: date | None = None
    end_reason: str | None = None
    notes: str | None = None


class FiliationCreate(BaseModel):
    child_id: str
    union_id: str
    relation_type: FiliationType = FiliationType.biological


class FiliationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    child_id: str
    union_id: str
    relation_type: FiliationType


# ---------- Tree graph ----------

class TreeGraph(BaseModel):
    persons: list[PersonOut]
    unions: list[UnionOut]
    filiations: list[FiliationOut]
