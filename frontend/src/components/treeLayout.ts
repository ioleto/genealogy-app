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
  unionId: string;
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
  let spouseLines: SpouseLine[] = [];
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
    const attachments: Array<{ anchorX: number }> = [];
    const familyEdgesForPerson: Array<{ edge: FamilyEdge; spouseX?: number }> = [];

    for (const union of unions) {
      const spouseId = union.partner1_id === personId ? union.partner2_id : union.partner1_id;
      const childIds = childrenByUnion.get(union.id) ?? [];

      if (childIds.length === 0) {
        if (spouseId && !descendantVisited.has(spouseId)) {
          descendantVisited.add(spouseId);
          const spouseX = nextLeafX++;
          nodes.push({ personId: spouseId, x: spouseX, generation, isBlood: false });
          attachments.push({ anchorX: spouseX - 0.5 });
        }
        continue;
      }

      const childCenters = childIds.map((cid) => layoutDescendant(cid, generation + 1));
      const unionMidX = (Math.min(...childCenters) + Math.max(...childCenters)) / 2;
      const edge: FamilyEdge = {
        unionId: union.id,
        unionMidX,
        unionGeneration: generation,
        childrenX: childCenters,
        childGeneration: generation + 1,
      };
      familyEdges.push(edge);

      if (spouseId && !descendantVisited.has(spouseId)) {
        descendantVisited.add(spouseId);
        const spouseX = unionMidX + 0.5;
        nodes.push({ personId: spouseId, x: spouseX, generation, isBlood: false });
        // Une carte occupe presque un slot complet : les centres doivent être
        // distants d'un slot (et non d'un demi-slot), sinon les époux se
        // recouvrent dès que l'arbre est recentré sur un ancêtre.
        attachments.push({ anchorX: unionMidX - 0.5 });
        familyEdgesForPerson.push({ edge, spouseX });
      } else {
        attachments.push({ anchorX: unionMidX });
        familyEdgesForPerson.push({ edge });
      }
    }

    const personX = attachments.length > 0 ? average(attachments.map((attachment) => attachment.anchorX)) : nextLeafX++;
    nodes.push({ personId, x: personX, generation, isBlood: true });
    for (const { edge, spouseX } of familyEdgesForPerson) {
      // La descente part toujours du milieu géométrique du couple, pas du
      // milieu de la fratrie. Le trait vertical est donc centré entre les
      // deux fiches, y compris lorsque les enfants sont répartis d'un côté.
      edge.unionMidX = spouseX === undefined ? personX : (personX + spouseX) / 2;
    }
    return personX;
  }

  const rootX = layoutDescendant(rootId, 0);

  // ---------- Ancestor side (generation < 0), laid out independently then aligned to rootX ----------
  const ancestorNodes: PersonNodePos[] = [];
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

      ancestorFamilyEdges.push({
        unionId: union.id,
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
      }
    }

    return personX;
  }

  layoutAncestor(rootId, 0);
  const delta = rootX - ancestorRootX;

  for (const n of ancestorNodes) nodes.push({ ...n, x: n.x + delta });
  for (const e of ancestorFamilyEdges)
    familyEdges.push({ ...e, unionMidX: e.unionMidX + delta, childrenX: e.childrenX.map((x) => x + delta) });

  // Les traits sont dérivés des fiches effectivement affichées. Ne jamais
  // réutiliser une ancienne ancre de mise en page : elle peut être déplacée
  // par une autre union et produisait les prolongements visibles à droite.
  const nodeAt = new Map(nodes.map((node) => [`${node.personId}:${node.generation}`, node]));

  function moveMaritalUnit(personId: string, generation: number, delta: number) {
    // Une personne et tous ses conjoints déjà visibles à cette génération
    // forment un bloc : les dissocier lors d'un réalignement crée des fiches
    // superposées. Les enfants ne sont pas déplacés ici ; leurs propres
    // unions seront réalignées à leur tour dans la génération suivante.
    const pending = [personId];
    const moved = new Set<string>();
    while (pending.length > 0) {
      const currentId = pending.pop()!;
      if (moved.has(currentId)) continue;
      moved.add(currentId);

      const node = nodeAt.get(`${currentId}:${generation}`);
      if (!node) continue;
      node.x += delta;

      for (const union of unionsByPartner.get(currentId) ?? []) {
        const partnerId = union.partner1_id === currentId ? union.partner2_id : union.partner1_id;
        if (partnerId && nodeAt.has(`${partnerId}:${generation}`)) pending.push(partnerId);
      }
    }
  }

  // Avec un seul enfant, la convention de lecture est sans ambiguïté : sa
  // fiche doit tomber à l'aplomb du milieu du couple. On traite les unions
  // des générations les plus anciennes vers les plus récentes pour que cet
  // ajustement se propage naturellement à toute la branche.
  for (const edge of [...familyEdges].sort((a, b) => a.unionGeneration - b.unionGeneration)) {
    const union = unionsById.get(edge.unionId);
    if (!union) continue;
    const childIds = childrenByUnion.get(union.id) ?? [];
    if (childIds.length !== 1) continue;

    const partner1 = nodeAt.get(`${union.partner1_id}:${edge.unionGeneration}`);
    const partner2 = union.partner2_id ? nodeAt.get(`${union.partner2_id}:${edge.unionGeneration}`) : undefined;
    const child = nodeAt.get(`${childIds[0]}:${edge.childGeneration}`);
    if (!child || (!partner1 && !partner2)) continue;

    const unionMidX = partner1 && partner2 ? (partner1.x + partner2.x) / 2 : (partner1 ?? partner2)!.x;
    moveMaritalUnit(childIds[0], edge.childGeneration, unionMidX - child.x);
  }

  spouseLines = [];
  for (const union of graph.unions) {
    if (!union.partner2_id) continue;
    for (const generation of new Set(nodes.map((node) => node.generation))) {
      const partner1 = nodeAt.get(`${union.partner1_id}:${generation}`);
      const partner2 = nodeAt.get(`${union.partner2_id}:${generation}`);
      if (partner1 && partner2) {
        spouseLines.push({ x1: partner1.x, x2: partner2.x, generation });
      }
    }
  }
  for (const edge of familyEdges) {
    const union = unionsById.get(edge.unionId);
    if (!union) continue;
    const partner1 = nodeAt.get(`${union.partner1_id}:${edge.unionGeneration}`);
    const partner2 = union.partner2_id ? nodeAt.get(`${union.partner2_id}:${edge.unionGeneration}`) : undefined;
    if (partner1 && partner2) edge.unionMidX = (partner1.x + partner2.x) / 2;
    else if (partner1) edge.unionMidX = partner1.x;
    else if (partner2) edge.unionMidX = partner2.x;
    edge.childrenX = (childrenByUnion.get(union.id) ?? [])
      .map((childId) => nodeAt.get(`${childId}:${edge.childGeneration}`)?.x)
      .filter((x): x is number => x !== undefined);
  }

  return { nodes, spouseLines, familyEdges };
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
