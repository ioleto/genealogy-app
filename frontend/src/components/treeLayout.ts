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
  const ancestorPositions = new Map<string, number>();
  const ancestorInProgress = new Set<string>();
  let ancestorRootX = 0;

  function layoutAncestor(personId: string, generation: number, incomingUnionId?: string): number {
    const positionKey = `${personId}:${generation}`;
    const knownPosition = ancestorPositions.get(positionKey);
    if (knownPosition !== undefined) return knownPosition;
    if (generation < -MAX_DEPTH) return ancestorLeafX++;
    if (ancestorInProgress.has(positionKey)) {
      // Protection de cycle exceptionnelle (cousins apparentés, import
      // GEDCOM atypique) : ne jamais inventer une deuxième position pour une
      // personne déjà en cours de calcul.
      return ancestorLeafX++;
    }
    ancestorInProgress.add(positionKey);

    const unionId = parentUnionByChild.get(personId);
    const union = unionId ? unionsById.get(unionId) : undefined;

    let personX: number;

    if (!union) {
      personX = ancestorLeafX++;
    } else {
      const parentIds = [union.partner1_id, union.partner2_id].filter((p): p is string => !!p);
      const parentCenters = parentIds.map((pid) => layoutAncestor(pid, generation - 1, union.id));
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
    ancestorPositions.set(positionKey, personX);

    // Un ancêtre peut avoir eu plusieurs unions (remariage) — celle qui a
    // produit l'enfant qu'on remonte n'est qu'une partie de l'histoire. Sans
    // ceci, tout conjoint « secondaire » d'un ancêtre — et donc TOUTE sa
    // propre lignée, même connue dans la base — disparaissait silencieusement
    // dès qu'on remontait plus haut que lui. Le root est exclu : ses propres
    // unions sont déjà traitées en entier par la branche descendante.
    if (personId !== rootId) {
      const ownUnions = (unionsByPartner.get(personId) ?? []).filter((u) => unionsById.has(u.id));
      for (const u of ownUnions) {
        // Cette union est justement celle par laquelle on est arrivé à cette
        // personne : ne pas parcourir son/sa co-parent comme un "nouveau"
        // conjoint avant que le couple parental ait été positionné.
        if (u.id === incomingUnionId) continue;
        const spouseId = u.partner1_id === personId ? u.partner2_id : u.partner1_id;
        if (!spouseId) continue;
        layoutAncestor(spouseId, generation, u.id);
      }
    }

    ancestorInProgress.delete(positionKey);
    return personX;
  }

  layoutAncestor(rootId, 0);
  const delta = rootX - ancestorRootX;

  for (const n of ancestorNodes) nodes.push({ ...n, x: n.x + delta });
  for (const e of ancestorFamilyEdges)
    familyEdges.push({ ...e, unionMidX: e.unionMidX + delta, childrenX: e.childrenX.map((x) => x + delta) });

  // Les placements initiaux sont utiles pour connaître l'ordre des branches,
  // mais ne constituent pas des coordonnées définitives. On compacte d'abord
  // chaque génération, puis on résout ensemble deux règles simples :
  // - les fiches d'une même ligne ne se recouvrent jamais ;
  // - le milieu d'un couple est aligné sur le milieu de ses enfants.
  // Ceci évite les corrections successives qui pouvaient étirer l'arbre ou
  // déplacer une personne sans son/sa conjoint·e.
  const uniqueNodes = Array.from(
    new Map(nodes.map((node) => [`${node.personId}:${node.generation}`, node])).values()
  );
  nodes.splice(0, nodes.length, ...uniqueNodes);
  const nodeAt = new Map(nodes.map((node) => [`${node.personId}:${node.generation}`, node]));
  const rows = new Map<number, PersonNodePos[]>();
  for (const node of nodes) {
    if (!rows.has(node.generation)) rows.set(node.generation, []);
    rows.get(node.generation)!.push(node);
  }
  for (const [generation, row] of rows) {
    row.sort((a, b) => a.x - b.x);
    const originalOrder = new Map(row.map((node, index) => [node.personId, index]));
    const rowByPersonId = new Map(row.map((node) => [node.personId, node]));
    const visited = new Set<string>();
    const components: Array<{ nodes: PersonNodePos[]; targetX: number; order: number }> = [];

    // Chaque union visible forme un bloc indissociable pour l'ordre d'une
    // ligne. Sans cela, deux branches ancestrales peuvent s'intercaler entre
    // les époux et donner l'illusion de faux couples.
    for (const start of row) {
      if (visited.has(start.personId)) continue;
      const pending = [start.personId];
      const component: PersonNodePos[] = [];
      while (pending.length > 0) {
        const personId = pending.pop()!;
        if (visited.has(personId)) continue;
        visited.add(personId);
        const node = rowByPersonId.get(personId);
        if (!node) continue;
        component.push(node);
        for (const union of unionsByPartner.get(personId) ?? []) {
          const partnerId = union.partner1_id === personId ? union.partner2_id : union.partner1_id;
          if (partnerId && rowByPersonId.has(partnerId)) pending.push(partnerId);
        }
      }

      const childXs: number[] = [];
      for (const node of component) {
        for (const union of unionsByPartner.get(node.personId) ?? []) {
          for (const childId of childrenByUnion.get(union.id) ?? []) {
            const child = nodeAt.get(`${childId}:${generation + 1}`);
            if (child) childXs.push(child.x);
          }
        }
      }
      components.push({
        nodes: component.sort((a, b) => (originalOrder.get(a.personId)! - originalOrder.get(b.personId)!)),
        targetX: childXs.length > 0 ? average(childXs) : average(component.map((node) => node.x)),
        order: Math.min(...component.map((node) => originalOrder.get(node.personId)!)),
      });
    }

    components.sort((a, b) => a.targetX - b.targetX || a.order - b.order);
    row.splice(0, row.length, ...components.flatMap((component) => component.nodes));
    row.forEach((node, index) => {
      node.x = index - (row.length - 1) / 2;
    });
  }

  const SLOT_GAP = 1.05; // 216 px pour des cartes de 188 px : 28 px d'air
  const parentAlignedNodes = new Set<string>();
  for (const union of graph.unions) {
    for (const generation of rows.keys()) {
      const partner1 = nodeAt.get(`${union.partner1_id}:${generation}`);
      const partner2 = union.partner2_id ? nodeAt.get(`${union.partner2_id}:${generation}`) : undefined;
      if (!partner1 && !partner2) continue;
      const children = (childrenByUnion.get(union.id) ?? [])
        .map((childId) => nodeAt.get(`${childId}:${generation + 1}`))
        .filter((node): node is PersonNodePos => !!node);
      if (children.length === 1) parentAlignedNodes.add(`${children[0].personId}:${children[0].generation}`);
    }
  }

  function moveChildAndFreePartners(personId: string, generation: number, delta: number) {
    const pending = [personId];
    const moved = new Set<string>();
    while (pending.length > 0) {
      const currentId = pending.pop()!;
      if (moved.has(currentId)) continue;
      moved.add(currentId);

      const node = nodeAt.get(`${currentId}:${generation}`);
      if (!node) continue;
      node.x += delta;

      for (const relatedUnion of unionsByPartner.get(currentId) ?? []) {
        const partnerId = relatedUnion.partner1_id === currentId
          ? relatedUnion.partner2_id
          : relatedUnion.partner1_id;
        if (!partnerId || !nodeAt.has(`${partnerId}:${generation}`)) continue;
        // Un conjoint lui-même ancré sous ses parents ne doit pas être
        // déplacé avec le bloc : sa ligne de couple peut alors s'allonger.
        if (!parentAlignedNodes.has(`${partnerId}:${generation}`)) pending.push(partnerId);
      }
    }
  }

  for (let iteration = 0; iteration < 24; iteration += 1) {
    const targets = new Map<PersonNodePos, number[]>();
    const addTarget = (node: PersonNodePos | undefined, x: number) => {
      if (!node) return;
      if (!targets.has(node)) targets.set(node, []);
      targets.get(node)!.push(x);
    };
    const isParentAnchored = (node: PersonNodePos) => parentAlignedNodes.has(`${node.personId}:${node.generation}`);
    const addCoupleTargets = (partner1: PersonNodePos | undefined, partner2: PersonNodePos | undefined, center: number) => {
      if (!partner1 || !partner2) {
        addTarget(partner1 ?? partner2, center);
        return;
      }
      const direction = partner2.x >= partner1.x ? 1 : -1;
      const partner1Anchored = isParentAnchored(partner1);
      const partner2Anchored = isParentAnchored(partner2);

      const forceAncestorCouple = partner1.generation < 0;
      if (partner1Anchored && !partner2Anchored) {
        addTarget(partner2, partner1.x + direction * SLOT_GAP);
      } else if (partner2Anchored && !partner1Anchored) {
        addTarget(partner1, partner2.x - direction * SLOT_GAP);
      } else if (!partner1Anchored && !partner2Anchored || forceAncestorCouple) {
        // Dans les générations ancestrales, le couple est un bloc prioritaire
        // même si les deux partenaires ont leurs propres parents visibles.
        // On donne un poids supérieur à cette contrainte pour éviter qu'une
        // autre branche ne s'insère entre les deux fiches.
        const repetitions = forceAncestorCouple ? 3 : 1;
        for (let index = 0; index < repetitions; index += 1) {
          addTarget(partner1, center - direction * SLOT_GAP / 2);
          addTarget(partner2, center + direction * SLOT_GAP / 2);
        }
      }
      // Si les deux partenaires sont déjà ancrés sous leurs propres parents,
      // on respecte ces deux aplombs : leur ligne de couple peut s'allonger.
    };

    for (const union of graph.unions) {
      for (const generation of rows.keys()) {
        const partner1 = nodeAt.get(`${union.partner1_id}:${generation}`);
        const partner2 = union.partner2_id ? nodeAt.get(`${union.partner2_id}:${generation}`) : undefined;
        if (!partner1 && !partner2) continue;

        const children = (childrenByUnion.get(union.id) ?? [])
          .map((childId) => nodeAt.get(`${childId}:${generation + 1}`))
          .filter((node): node is PersonNodePos => !!node);
        const coupleCenter = ((partner1?.x ?? partner2!.x) + (partner2?.x ?? partner1!.x)) / 2;

        if (children.length === 1) {
          // Un enfant unique reste à l'aplomb de SES parents. Cela permet à
          // deux conjoints issus de branches différentes de s'écarter chacun
          // sous leur propre couple parental, au lieu d'être artificiellement
          // rapprochés par leur foyer commun.
          addTarget(children[0], coupleCenter);
          addCoupleTargets(partner1, partner2, children[0].x);
        } else if (children.length > 1) {
          // Pour une fratrie, le couple se place naturellement au-dessus du
          // milieu de la rangée d'enfants.
          const center = (Math.min(...children.map((child) => child.x)) + Math.max(...children.map((child) => child.x))) / 2;
          addCoupleTargets(partner1, partner2, center);
        } else if (partner1 && partner2) {
          // Une union sans enfant visible conserve une distance lisible entre
          // les deux fiches sans imposer de déplacement aux autres branches.
          addCoupleTargets(partner1, partner2, coupleCenter);
        }
      }
    }

    for (const [node, values] of targets) {
      const target = average(values);
      node.x = (node.x + target) / 2;
    }

    for (const row of rows.values()) {
      row.sort((a, b) => a.x - b.x);
      for (let index = 1; index < row.length; index += 1) {
        const left = row[index - 1];
        const right = row[index];
        const minimumRight = left.x + SLOT_GAP;
        if (right.x >= minimumRight) continue;

        const leftIsAnchored = parentAlignedNodes.has(`${left.personId}:${left.generation}`);
        const rightIsAnchored = parentAlignedNodes.has(`${right.personId}:${right.generation}`);
        // Un enfant relié à ses propres parents garde son aplomb. Une fiche
        // libre (souvent son/sa conjoint·e) s'écarte à sa place.
        if (rightIsAnchored && !leftIsAnchored) left.x = right.x - SLOT_GAP;
        else right.x = minimumRight;
      }
    }
  }

  // L'itération et l'évitement des collisions donnent une disposition
  // compacte, mais peuvent laisser un léger écart résiduel. Cette dernière
  // passe rend l'aplomb parent-enfant exact pour chaque enfant unique.
  for (const edge of [...familyEdges].sort((a, b) => a.unionGeneration - b.unionGeneration)) {
    const union = unionsById.get(edge.unionId);
    const childIds = union ? childrenByUnion.get(union.id) ?? [] : [];
    if (!union || childIds.length !== 1 || edge.childGeneration < 0) continue;

    const partner1 = nodeAt.get(`${union.partner1_id}:${edge.unionGeneration}`);
    const partner2 = union.partner2_id ? nodeAt.get(`${union.partner2_id}:${edge.unionGeneration}`) : undefined;
    const child = nodeAt.get(`${childIds[0]}:${edge.childGeneration}`);
    if (!child || (!partner1 && !partner2)) continue;

    const parentCenter = ((partner1?.x ?? partner2!.x) + (partner2?.x ?? partner1!.x)) / 2;
    moveChildAndFreePartners(child.personId, edge.childGeneration, parentCenter - child.x);
  }

  // Après l'alignement strict, on écarte seulement les fiches non ancrées
  // qui viendraient encore empiéter sur une fiche reliée à ses parents.
  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x);
    for (let index = 1; index < row.length; index += 1) {
      const left = row[index - 1];
      const right = row[index];
      if (right.x >= left.x + SLOT_GAP) continue;
      const leftIsAnchored = parentAlignedNodes.has(`${left.personId}:${left.generation}`);
      const rightIsAnchored = parentAlignedNodes.has(`${right.personId}:${right.generation}`);
      if (rightIsAnchored && !leftIsAnchored) left.x = right.x - SLOT_GAP;
      else if (leftIsAnchored && !rightIsAnchored) right.x = left.x + SLOT_GAP;
      else right.x = left.x + SLOT_GAP;
    }
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
