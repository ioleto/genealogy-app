from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, schemas
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
