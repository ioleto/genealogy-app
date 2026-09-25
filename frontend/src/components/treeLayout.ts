import type { Person, TreeGraph, UnionRecord } from "../api/types";

export interface PersonNodePos {
  personId: string;
  x: number; // abstract slot unit, converted to pixels by the renderer
  generation: number; // 0 = root; negative = ancestors; positive = descendants
  isBlood: boolean; // true = direct lineage to root, false = married-in spouse
}

export interface SpouseLine {
  x1: number;
  x2: number;
  generation: number;
}

export interface FamilyEdge {
  unionMidX: number;
  unionGeneration: number;
  childrenX: number[];
  childGeneration: number;
}

export interface TreeLayout {
  nodes: PersonNodePos[];
  spouseLines: SpouseLine[];
  familyEdges: FamilyEdge[];
}

const MAX_DEPTH = 12;

export function computeTreeLayout(graph: TreeGraph, rootId: string): TreeLayout {
  const personById = new Map<string, Person>(graph.persons.map((p) => [p.id, p]));
  const unionsByPartner = new Map<string, UnionRecord[]>();
  for (const u of graph.unions) {
    for (const pid of [u.partner1_id, u.partner2_id]) {
      if (!pid) continue;
      if (!unionsByPartner.has(pid)) unionsByPartner.set(pid, []);
      unionsByPartner.get(pid)!.push(u);
    }
  }
  const childrenByUnion = new Map<string, string[]>();
  for (const f of graph.filiations) {
    if (!childrenByUnion.has(f.union_id)) childrenByUnion.set(f.union_id, []);
    childrenByUnion.get(f.union_id)!.push(f.child_id);
  }
  const parentUnionByChild = new Map<string, string>();
  for (const f of graph.filiations) {
    if (!parentUnionByChild.has(f.child_id)) parentUnionByChild.set(f.child_id, f.union_id);
  }
  const unionsById = new Map<string, UnionRecord>(graph.unions.map((u) => [u.id, u]));

  const nodes: PersonNodePos[] = [];
  const spouseLines: SpouseLine[] = [];
  const familyEdges: FamilyEdge[] = [];

  // ---------- Descendant side (generation >= 0) ----------
  let nextLeafX = 0;
  const descendantVisited = new Set<string>();

  function layoutDescendant(personId: string, generation: number): number {
    if (!personById.has(personId)) return nextLeafX++;
    if (descendantVisited.has(personId)) {
      // Déjà positionné ailleurs (ex. un enfant rattaché à deux unions —
      // parents biologiques et adoptifs). On réutilise sa position réelle
      // plutôt que d'en générer une nouvelle "fantôme" et déconnectée.
      const existing = nodes.find((n) => n.personId === personId);
      return existing ? existing.x : nextLeafX++;
    }
    if (generation > MAX_DEPTH) {
      return nextLeafX++;
    }
    descendantVisited.add(personId);

    const unions = (unionsByPartner.get(personId) ?? []).filter((u) => unionsById.has(u.id));
    const attachPoints: number[] = [];

    for (const union of unions) {
      const spouseId = union.partner1_id === personId ? union.partner2_id : union.partner1_id;
      const childIds = childrenByUnion.get(union.id) ?? [];

      if (childIds.length === 0) {
        if (spouseId && !descendantVisited.has(spouseId)) {
          descendantVisited.add(spouseId);
          const spouseX = nextLeafX++;
          nodes.push({ personId: spouseId, x: spouseX, generation, isBlood: false });
          attachPoints.push(spouseX);
        }
        continue;
      }

      const childCenters = childIds.map((cid) => layoutDescendant(cid, generation + 1));
      const unionMidX = (Math.min(...childCenters) + Math.max(...childCenters)) / 2;
      familyEdges.push({
        unionMidX,
        unionGeneration: generation,
        childrenX: childCenters,
        childGeneration: generation + 1,
      });

      if (spouseId && !descendantVisited.has(spouseId)) {
        descendantVisited.add(spouseId);
        nodes.push({ personId: spouseId, x: unionMidX, generation, isBlood: false });
        attachPoints.push(unionMidX);
      } else {
        attachPoints.push(unionMidX);
      }
    }

    const personX = attachPoints.length > 0 ? average(attachPoints) : nextLeafX++;
    nodes.push({ personId, x: personX, generation, isBlood: true });
    for (const ax of attachPoints) {
      spouseLines.push({ x1: personX, x2: ax, generation });
    }
    return personX;
  }

  const rootX = layoutDescendant(rootId, 0);

  // ---------- Ancestor side (generation < 0), laid out independently then aligned to rootX ----------
  const ancestorNodes: PersonNodePos[] = [];
  const ancestorSpouseLines: SpouseLine[] = [];
  const ancestorFamilyEdges: FamilyEdge[] = [];
  let ancestorLeafX = 0;
  const ancestorVisited = new Set<string>();
  let ancestorRootX = 0;

  function layoutAncestor(personId: string, generation: number): number {
    if (ancestorVisited.has(personId) || generation < -MAX_DEPTH) {
      return ancestorLeafX++;
    }
    ancestorVisited.add(personId);

    const unionId = parentUnionByChild.get(personId);
    const union = unionId ? unionsById.get(unionId) : undefined;

    let personX: number;

    if (!union) {
      personX = ancestorLeafX++;
    } else {
      const parentIds = [union.partner1_id, union.partner2_id].filter((p): p is string => !!p);
      const parentCenters = parentIds.map((pid) => layoutAncestor(pid, generation - 1));
      personX = parentCenters.length > 0 ? average(parentCenters) : ancestorLeafX++;

      if (parentCenters.length === 2) {
        ancestorSpouseLines.push({ x1: parentCenters[0], x2: parentCenters[1], generation: generation - 1 });
      }
      ancestorFamilyEdges.push({
        unionMidX: average(parentCenters.length > 0 ? parentCenters : [personX]),
        unionGeneration: generation - 1,
        childrenX: [personX],
        childGeneration: generation,
      });
    }

    if (personId !== rootId) {
      ancestorNodes.push({ personId, x: personX, generation, isBlood: true });
    } else {
      ancestorRootX = personX;
    }

    // Un ancêtre peut avoir eu plusieurs unions (remariage) — celle qui a
    // produit l'enfant qu'on remonte n'est qu'une partie de l'histoire. Sans
    // ceci, tout conjoint « secondaire » d'un ancêtre — et donc TOUTE sa
    // propre lignée, même connue dans la base — disparaissait silencieusement
    // dès qu'on remontait plus haut que lui. Le root est exclu : ses propres
    // unions sont déjà traitées en entier par la branche descendante.
    if (personId !== rootId) {
      const ownUnions = (unionsByPartner.get(personId) ?? []).filter((u) => unionsById.has(u.id));
      for (const u of ownUnions) {
        const spouseId = u.partner1_id === personId ? u.partner2_id : u.partner1_id;
        if (!spouseId || ancestorVisited.has(spouseId)) continue;
        const spouseX = layoutAncestor(spouseId, generation);
        ancestorSpouseLines.push({ x1: personX, x2: spouseX, generation });
      }
    }

    return personX;
  }

  layoutAncestor(rootId, 0);
  const delta = rootX - ancestorRootX;

  for (const n of ancestorNodes) nodes.push({ ...n, x: n.x + delta });
  for (const l of ancestorSpouseLines) spouseLines.push({ ...l, x1: l.x1 + delta, x2: l.x2 + delta });
  for (const e of ancestorFamilyEdges)
    familyEdges.push({ ...e, unionMidX: e.unionMidX + delta, childrenX: e.childrenX.map((x) => x + delta) });

  return { nodes, spouseLines, familyEdges };
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
