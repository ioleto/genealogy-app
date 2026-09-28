"""Calcul du lien de parenté entre deux fiches, à partir du graphe complet.

Principe standard : on remonte les ancêtres de chaque personne (avec leur
profondeur), on cherche le plus proche ancêtre commun, puis on traduit les
deux profondeurs en une relation nommée (parent, cousin au 2e degré, etc.).
"""

from __future__ import annotations

from collections import defaultdict, deque

from app import models

FR_ORDINALS = ["", "premier", "deuxième", "troisième", "quatrième", "cinquième", "sixième", "septième"]


def _ancestor_label(n: int) -> str:
    if n == 1:
        return "Parent"
    if n == 2:
        return "Grand-parent"
    return f"{'Arrière-' * (n - 2)}grand-parent"


def _descendant_label(n: int) -> str:
    if n == 1:
        return "Enfant"
    if n == 2:
        return "Petit-enfant"
    return f"{'Arrière-' * (n - 2)}petit-enfant"


def find_ancestor_depths(
    person_id: str, filiations: list[models.Filiation], unions: list[models.Union]
) -> dict[str, int]:
    """BFS ascendant : id d'ancêtre -> nombre de générations jusqu'à person_id."""
    filiation_by_child: dict[str, list[str]] = defaultdict(list)
    for f in filiations:
        filiation_by_child[f.child_id].append(f.union_id)
    union_by_id = {u.id: u for u in unions}

    depths: dict[str, int] = {person_id: 0}
    queue: deque[tuple[str, int]] = deque([(person_id, 0)])
    while queue:
        pid, depth = queue.popleft()
        for union_id in filiation_by_child.get(pid, []):
            union = union_by_id.get(union_id)
            if not union:
                continue
            for parent_id in (union.partner1_id, union.partner2_id):
                if parent_id and parent_id not in depths:
                    depths[parent_id] = depth + 1
                    queue.append((parent_id, depth + 1))
    return depths


def describe_relationship(m: int, n: int) -> tuple[str, str]:
    """m, n = générations de la personne 1 et 2 jusqu'à leur ancêtre commun."""
    if m == 0 and n == 0:
        return "Même fiche", "Il s'agit de la même personne."
    if m == 0:
        return _descendant_label(n), f"Lignée directe : {n} génération(s) plus bas."
    if n == 0:
        return _ancestor_label(m), f"Lignée directe : {m} génération(s) plus haut."

    lo, hi = min(m, n), max(m, n)
    removed = hi - lo
    degree = lo - 1

    if degree == 0:
        if removed == 0:
            return "Frère ou sœur", "Un parent (au moins) en commun, à la génération précédente."
        which = "Oncle ou tante" if m < n else "Neveu ou nièce"
        if removed >= 2:
            prefix = "Grand-" if removed == 2 else "Arrière-grand-" * (removed - 2) + "grand-"
            which = f"{prefix}{which.lower()}"
        return which, f"Ancêtre commun à {m} et {n} générations respectivement."

    ordinal = FR_ORDINALS[degree] if degree < len(FR_ORDINALS) else f"{degree}e"
    label = f"Cousin·e au {ordinal} degré"
    if removed > 0:
        label += f", {removed} fois déplacé·e"
    return label, f"Ancêtre commun à {m} et {n} générations respectivement."


def compute_relationship(
    person1_id: str,
    person2_id: str,
    filiations: list[models.Filiation],
    unions: list[models.Union],
) -> tuple[str, str]:
    if person1_id == person2_id:
        return "Même fiche", "Il s'agit de la même personne."

    depths1 = find_ancestor_depths(person1_id, filiations, unions)
    depths2 = find_ancestor_depths(person2_id, filiations, unions)

    common = set(depths1) & set(depths2)
    if not common:
        return "Aucun lien trouvé", "Aucun ancêtre commun connu dans l'arbre actuel."

    best = min(common, key=lambda cid: depths1[cid] + depths2[cid])
    return describe_relationship(depths1[best], depths2[best])
