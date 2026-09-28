import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class UserRole(str, enum.Enum):
    admin = "admin"
    editor = "editor"
    viewer = "viewer"


class Sex(str, enum.Enum):
    male = "M"
    female = "F"
    unknown = "U"


class UnionType(str, enum.Enum):
    marriage = "marriage"
    civil_union = "civil_union"
    partnership = "partnership"
    unknown = "unknown"


class FiliationType(str, enum.Enum):
    biological = "biological"
    adoptive = "adoptive"
    foster = "foster"
    step = "step"


class EventType(str, enum.Enum):
    baptism = "baptism"
    burial = "burial"
    residence = "residence"
    military_service = "military_service"
    other = "other"


class ParticipantRole(str, enum.Enum):
    godfather = "godfather"
    godmother = "godmother"
    witness = "witness"
    other = "other"


class SourceType(str, enum.Enum):
    parish_register = "parish_register"
    civil_record = "civil_record"
    census = "census"
    correspondence = "correspondence"
    oral_testimony = "oral_testimony"
    other = "other"


class Confidence(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.viewer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    theme_primary_color: Mapped[str | None] = mapped_column(String(9), nullable=True)
    theme_secondary_color: Mapped[str | None] = mapped_column(String(9), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class Document(Base):
    """Fichier (scan, acte, photo d'époque, PDF...) rattaché à une fiche."""

    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    person_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("persons.id", ondelete="CASCADE"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_by: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    @property
    def url(self) -> str:
        return f"/uploads/{self.stored_path}"


class Family(Base):
    """Regroupement nommé de fiches (ex. « Famille Dupont », « Famille
    Martin »), pour organiser/filtrer plusieurs familles distinctes au sein
    du même arbre. Une fiche peut n'appartenir à aucune famille déclarée."""

    __tablename__ = "families"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class Person(Base):
    __tablename__ = "persons"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)

    family_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("families.id", ondelete="SET NULL"), nullable=True
    )
    first_name: Mapped[str] = mapped_column(String(150), nullable=False)
    last_name: Mapped[str] = mapped_column(String(150), nullable=False)
    birth_last_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    nickname: Mapped[str | None] = mapped_column(String(150), nullable=True)
    sex: Mapped[Sex] = mapped_column(Enum(Sex), default=Sex.unknown, nullable=False)

    # None = inconnu, True = vivant, False = décédé. Sert notamment à
    # masquer les détails des personnes vivantes lors d'un export GEDCOM
    # partagé — pratique standard de confidentialité en généalogie.
    is_living: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    birth_date_approx: Mapped[bool] = mapped_column(Boolean, default=False)
    birth_place: Mapped[str | None] = mapped_column(String(255), nullable=True)

    death_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    death_date_approx: Mapped[bool] = mapped_column(Boolean, default=False)
    death_place: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cause_of_death: Mapped[str | None] = mapped_column(String(255), nullable=True)

    occupation: Mapped[str | None] = mapped_column(String(255), nullable=True)
    biography: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_by: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    unions_as_partner1: Mapped[list["Union"]] = relationship(
        "Union", foreign_keys="Union.partner1_id", back_populates="partner1"
    )
    unions_as_partner2: Mapped[list["Union"]] = relationship(
        "Union", foreign_keys="Union.partner2_id", back_populates="partner2"
    )
    filiations: Mapped[list["Filiation"]] = relationship(
        "Filiation", foreign_keys="Filiation.child_id", back_populates="child"
    )

    @property
    def display_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


class Union(Base):
    """Represents a couple / partnership, the pivot for children (GEDCOM-style FAM record)."""

    __tablename__ = "unions"
    __table_args__ = (UniqueConstraint("partner1_id", "partner2_id", "union_date", name="uq_union_partners_date"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)

    partner1_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("persons.id"), nullable=False)
    partner2_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("persons.id"), nullable=True)

    union_type: Mapped[UnionType] = mapped_column(Enum(UnionType), default=UnionType.unknown)
    union_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    union_date_approx: Mapped[bool] = mapped_column(Boolean, default=False)
    union_place: Mapped[str | None] = mapped_column(String(255), nullable=True)

    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_reason: Mapped[str | None] = mapped_column(String(120), nullable=True)  # divorce, veuvage, séparation...

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    partner1: Mapped["Person"] = relationship("Person", foreign_keys=[partner1_id], back_populates="unions_as_partner1")
    partner2: Mapped["Person | None"] = relationship("Person", foreign_keys=[partner2_id], back_populates="unions_as_partner2")
    children: Mapped[list["Filiation"]] = relationship("Filiation", back_populates="union", cascade="all, delete-orphan")


class Filiation(Base):
    """Links a child to the union (family unit) they were born/raised into."""

    __tablename__ = "filiations"
    __table_args__ = (UniqueConstraint("child_id", "union_id", name="uq_child_union"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    child_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("persons.id"), nullable=False)
    union_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("unions.id"), nullable=False)
    relation_type: Mapped[FiliationType] = mapped_column(Enum(FiliationType), default=FiliationType.biological)

    child: Mapped["Person"] = relationship("Person", foreign_keys=[child_id], back_populates="filiations")
    union: Mapped["Union"] = relationship("Union", back_populates="children")


class Event(Base):
    """Événement de vie autre que naissance/décès (déjà des champs dédiés
    sur Person) : baptême, sépulture, résidence, service militaire, etc. —
    le modèle « événement générique » standard en généalogie (GEDCOM, Gramps)
    plutôt que d'ajouter un champ figé par type d'événement possible."""

    __tablename__ = "events"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    person_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("persons.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[EventType] = mapped_column(Enum(EventType), default=EventType.other, nullable=False)
    event_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    event_date_approx: Mapped[bool] = mapped_column(Boolean, default=False)
    place: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    participants: Mapped[list["EventParticipant"]] = relationship(
        "EventParticipant", cascade="all, delete-orphan", back_populates="event"
    )


class EventParticipant(Base):
    """Parrain/marraine d'un baptême, témoin d'une sépulture, etc. — une
    personne associée à un événement d'une autre, avec son rôle."""

    __tablename__ = "event_participants"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    event_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    person_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("persons.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[ParticipantRole] = mapped_column(Enum(ParticipantRole), default=ParticipantRole.other)

    event: Mapped["Event"] = relationship("Event", back_populates="participants")


class UnionWitness(Base):
    """Témoin d'un mariage — courant dans les actes d'état civil français,
    et une des principales pistes pour élargir un arbre (amis, voisins,
    autres membres de la famille présents ce jour-là)."""

    __tablename__ = "union_witnesses"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    union_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("unions.id", ondelete="CASCADE"), nullable=False
    )
    person_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("persons.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str | None] = mapped_column(String(120), nullable=True)


class Source(Base):
    """Référence bibliographique/archivistique réutilisable (un registre
    paroissial, un recensement...) — se cite depuis plusieurs fiches ou
    unions sans dupliquer sa description à chaque fois."""

    __tablename__ = "sources"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[SourceType] = mapped_column(Enum(SourceType), default=SourceType.other)
    author: Mapped[str | None] = mapped_column(String(255), nullable=True)
    repository: Mapped[str | None] = mapped_column(String(255), nullable=True)
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class Citation(Base):
    """Rattache une Source à une fiche ou une union précise, avec le détail
    exact (n° d'acte, page, vue...) et un niveau de confiance — ce qui
    distingue un arbre généalogique documenté d'une simple liste de noms."""

    __tablename__ = "citations"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    source_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("sources.id", ondelete="CASCADE"), nullable=False
    )
    person_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("persons.id", ondelete="CASCADE"), nullable=True
    )
    union_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("unions.id", ondelete="CASCADE"), nullable=True
    )
    detail: Mapped[str | None] = mapped_column(String(500), nullable=True)
    confidence: Mapped[Confidence] = mapped_column(Enum(Confidence), default=Confidence.medium)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    source: Mapped["Source"] = relationship("Source")


class ResearchNote(Base):
    """Piste de recherche à suivre sur une fiche (« vérifier l'acte de
    naissance aux AD de... ») — un journal de recherche par personne,
    partagé entre les contributeurs de l'arbre."""

    __tablename__ = "research_notes"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    person_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("persons.id", ondelete="CASCADE"), nullable=False
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
