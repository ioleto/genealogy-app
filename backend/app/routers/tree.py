from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, relationship, schemas
from app.database import get_db
from app.deps import get_current_user

router = APIRouter(prefix="/api/tree", tags=["tree"])


@router.get("/graph", response_model=schemas.TreeGraph)
async def get_graph(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    """Retourne le graphe complet (fiches, unions, filiations).

    La mise en page de l'arbre (générations, positionnement) est calculée
    côté frontend afin de garder le backend simple et la donnée réutilisable
    (export GEDCOM futur, autres vues, etc.).
    """
    persons, unions, filiations = await crud.get_full_graph(db)
    return schemas.TreeGraph(persons=persons, unions=unions, filiations=filiations)


@router.get("/relationship", response_model=schemas.RelationshipResult)
async def get_relationship(
    person1_id: str, person2_id: str, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)
):
    """Calcule le lien de parenté entre deux fiches (cousin, oncle, etc.)."""
    persons, unions, filiations = await crud.get_full_graph(db)
    known_ids = {p.id for p in persons}
    if person1_id not in known_ids or person2_id not in known_ids:
        raise HTTPException(status_code=404, detail="Fiche introuvable")
    label, description = relationship.compute_relationship(person1_id, person2_id, filiations, unions)
    return schemas.RelationshipResult(label=label, path_description=description)
