import { KinshipGraphLayoutEngine } from "@naviary-sanctuary/kinship-graph/layout";
import type {
  KinshipGraphData,
  KinshipGraphEdge,
  KinshipGraphNode,
} from "@naviary-sanctuary/kinship-graph";
import type { Filiation, Person, TreeGraph, UnionRecord } from "../api/types";

/**
 * A genealogical chart is not a person tree: a union is a first-class node
 * between its partners and its children. The dedicated layout engine below
 * works on that family graph, keeping actual couples together and siblings
 * grouped without post-layout nudges.
 */
export interface PersonNodePos {
  occurrenceId: string;
  personId: string;
  x: number;
  y: number;
  isBlood: boolean;
  isFocus: boolean;
}

export interface TreeSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TreeLayout {
  nodes: PersonNodePos[];
  segments: TreeSegment[];
  width: number;
  height: number;
}

const MAX_DEPTH = 12;
const CARD_WIDTH = 188;
const CARD_HEIGHT = 74;

const layoutEngine = new KinshipGraphLayoutEngine({
  nodeWidth: CARD_WIDTH,
  nodeHeight: CARD_HEIGHT,
  horizontalGap: 28,
  generationGap: 72,
  componentGap: 96,
  padding: 72,
});

type PartnerRole = "male" | "female";

function personNodeId(personId: string): string {
  return `person:${personId}`;
}

function familyNodeId(unionId: string): string {
  return `family:${unionId}`;
}

/**
 * Adapts Person / Union / Filiation records to the family-graph schema. A
 * person can have one biological parent family in this projection; biological
 * parentage wins when several filiations exist.
 */
type SourceFamily = {
  union: UnionRecord;
  partnerIds: readonly string[];
};

type ProjectedFamily = {
  id: string;
  source: SourceFamily;
  childIds: readonly string[];
};

function toKinshipGraph(graph: TreeGraph): KinshipGraphData {
  const personById = new Map<string, Person>(graph.persons.map((person) => [person.id, person]));
  const comparePeople = (leftId: string, rightId: string) => {
    const left = personById.get(leftId);
    const right = personById.get(rightId);
    return (left?.birth_date ?? "9999-99-99").localeCompare(right?.birth_date ?? "9999-99-99")
      || (left?.last_name ?? "").localeCompare(right?.last_name ?? "")
      || (left?.first_name ?? "").localeCompare(right?.first_name ?? "")
      || leftId.localeCompare(rightId);
  };
  const roleFromSex = (personId: string): PartnerRole | undefined => {
    const sex = personById.get(personId)?.sex;
    return sex === "M" ? "male" : sex === "F" ? "female" : undefined;
  };

  // The engine represents a pair using a left and a right role. Seed normal
  // couples from the recorded sex, while keeping a deterministic fallback for
  // historic records with unknown sex or same-sex partners.
  const roleByPerson = new Map<string, PartnerRole>();
  const usablePairs: SourceFamily[] = [];
  const completeUnions = graph.unions
    .filter((union) => (
      !!union.partner2_id
      && union.partner1_id !== union.partner2_id
      && personById.has(union.partner1_id)
      && personById.has(union.partner2_id)
    ))
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const union of completeUnions) {
    const partner2Id = union.partner2_id!;
    const role1 = roleByPerson.get(union.partner1_id);
    const role2 = roleByPerson.get(partner2Id);
    if (role1 && role2 && role1 === role2) continue;
    if (!role1 && !role2) {
      const sexRole1 = roleFromSex(union.partner1_id);
      const sexRole2 = roleFromSex(partner2Id);
      if (sexRole1 && sexRole2 && sexRole1 !== sexRole2) {
        roleByPerson.set(union.partner1_id, sexRole1);
        roleByPerson.set(partner2Id, sexRole2);
      } else if (sexRole1 && !sexRole2) {
        roleByPerson.set(union.partner1_id, sexRole1);
        roleByPerson.set(partner2Id, sexRole1 === "male" ? "female" : "male");
      } else if (!sexRole1 && sexRole2) {
        roleByPerson.set(union.partner1_id, sexRole2 === "male" ? "female" : "male");
        roleByPerson.set(partner2Id, sexRole2);
      } else {
        roleByPerson.set(union.partner1_id, "male");
        roleByPerson.set(partner2Id, "female");
      }
    } else if (role1) {
      roleByPerson.set(partner2Id, role1 === "male" ? "female" : "male");
    } else if (role2) {
      roleByPerson.set(union.partner1_id, role2 === "male" ? "female" : "male");
    }
    usablePairs.push({ union, partnerIds: [union.partner1_id, partner2Id] });
  }

  // A missing second parent is valid in our data model. The strict layout
  // schema allows one child per single-parent family, so such a union is
  // projected once per child below instead of silently dropping that branch.
  const singleParentFamilies: SourceFamily[] = graph.unions
    .filter((union) => (
      personById.has(union.partner1_id)
      && (!union.partner2_id || union.partner1_id === union.partner2_id || !personById.has(union.partner2_id))
    ))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((union) => ({ union, partnerIds: [union.partner1_id] }));
  const sourceFamilyByUnionId = new Map<string, SourceFamily>([
    ...usablePairs,
    ...singleParentFamilies,
  ].map((family) => [family.union.id, family]));

  const parentCandidates = new Map<string, Filiation[]>();
  for (const filiation of graph.filiations) {
    if (!personById.has(filiation.child_id) || !sourceFamilyByUnionId.has(filiation.union_id)) continue;
    if (!parentCandidates.has(filiation.child_id)) parentCandidates.set(filiation.child_id, []);
    parentCandidates.get(filiation.child_id)!.push(filiation);
  }

  // A child can appear in several relations (biological, adoptive, foster …).
  // Select one visual parent family, preferring biological parentage, and
  // reject only a candidate that would introduce a cycle in the projection.
  const selectedParentUnionByChild = new Map<string, string>();
  function reachesPerson(fromId: string, targetId: string, visited = new Set<string>()): boolean {
    if (fromId === targetId) return true;
    if (visited.has(fromId)) return false;
    visited.add(fromId);
    const parentUnionId = selectedParentUnionByChild.get(fromId);
    const parentFamily = parentUnionId ? sourceFamilyByUnionId.get(parentUnionId) : undefined;
    return !!parentFamily && parentFamily.partnerIds.some((parentId) => reachesPerson(parentId, targetId, visited));
  }
  for (const childId of Array.from(parentCandidates.keys()).sort(comparePeople)) {
    const candidates = parentCandidates.get(childId)!;
    candidates.sort((left, right) => {
      const leftPriority = left.relation_type === "biological" ? 0 : 1;
      const rightPriority = right.relation_type === "biological" ? 0 : 1;
      return leftPriority - rightPriority || left.union_id.localeCompare(right.union_id) || left.id.localeCompare(right.id);
    });
    const usableCandidate = candidates.find((candidate) => {
      const sourceFamily = sourceFamilyByUnionId.get(candidate.union_id)!;
      return !sourceFamily.partnerIds.some((parentId) => reachesPerson(parentId, childId));
    });
    if (usableCandidate) selectedParentUnionByChild.set(childId, usableCandidate.union_id);
  }

  const childrenBySourceUnion = new Map<string, string[]>();
  for (const [childId, unionId] of selectedParentUnionByChild) {
    if (!childrenBySourceUnion.has(unionId)) childrenBySourceUnion.set(unionId, []);
    childrenBySourceUnion.get(unionId)!.push(childId);
  }
  for (const children of childrenBySourceUnion.values()) children.sort(comparePeople);

  const projectedFamilies: ProjectedFamily[] = [];
  const selectedParentFamilyByChild = new Map<string, string>();
  for (const source of Array.from(sourceFamilyByUnionId.values()).sort((left, right) => left.union.id.localeCompare(right.union.id))) {
    const childIds = childrenBySourceUnion.get(source.union.id) ?? [];
    if (source.partnerIds.length === 2) {
      const id = familyNodeId(source.union.id);
      projectedFamilies.push({ id, source, childIds });
      for (const childId of childIds) selectedParentFamilyByChild.set(childId, id);
    } else {
      for (const childId of childIds) {
        const id = `${familyNodeId(source.union.id)}:child:${childId}`;
        projectedFamilies.push({ id, source, childIds: [childId] });
        selectedParentFamilyByChild.set(childId, id);
      }
    }
  }
  const projectedFamilyById = new Map(projectedFamilies.map((family) => [family.id, family]));

  const depthByPerson = new Map<string, number>();
  const resolving = new Set<string>();
  function lineageDepth(personId: string): number {
    const known = depthByPerson.get(personId);
    if (known !== undefined) return known;
    if (resolving.has(personId)) {
      throw new Error("Cycle de filiation non résolue lors de la préparation de l'arbre.");
    }
    resolving.add(personId);
    const parentFamilyId = selectedParentFamilyByChild.get(personId);
    const parentFamily = parentFamilyId ? projectedFamilyById.get(parentFamilyId) : undefined;
    const depth = parentFamily
      ? Math.max(...parentFamily.source.partnerIds.map((parentId) => lineageDepth(parentId))) + 1
      : 0;
    resolving.delete(personId);
    depthByPerson.set(personId, depth);
    return depth;
  }
  for (const person of graph.persons) lineageDepth(person.id);

  const nodes: KinshipGraphNode[] = graph.persons
    .slice()
    .sort((left, right) => comparePeople(left.id, right.id))
    .map((person) => ({
      id: personNodeId(person.id),
      kind: "individual",
      individualId: person.id,
      resolution: "resolved",
      gender: person.sex === "M" ? "male" : person.sex === "F" ? "female" : "unknown",
      lineageDepth: depthByPerson.get(person.id) ?? 0,
    }));

  for (const family of projectedFamilies) {
    const isPair = family.source.partnerIds.length === 2;
    const singleParentRole = roleByPerson.get(family.source.partnerIds[0]) ?? roleFromSex(family.source.partnerIds[0]) ?? "male";
    nodes.push({
      id: family.id,
      kind: "family",
      pairIds: isPair ? [family.source.union.id] : [],
      origin: isPair ? (family.childIds.length > 0 ? "both" : "pair") : "parentage",
      missingParentRoles: isPair ? [] : [singleParentRole === "male" ? "mother" : "father"],
      lineageDepth: Math.max(...family.source.partnerIds.map((partnerId) => depthByPerson.get(partnerId) ?? 0)),
    });
  }

  const edges: KinshipGraphEdge[] = [];
  for (const family of projectedFamilies) {
    const isPair = family.source.partnerIds.length === 2;
    for (const partnerId of family.source.partnerIds) {
      const role = isPair
        ? roleByPerson.get(partnerId)!
        : roleByPerson.get(partnerId) ?? roleFromSex(partnerId) ?? "male";
      edges.push({
        id: `partner:${family.id}:${partnerId}`,
        kind: "partner",
        sourceNodeId: personNodeId(partnerId),
        targetNodeId: family.id,
        role,
      });
    }
    for (const childId of family.childIds) {
      edges.push({
        id: `child:${family.id}:${childId}`,
        kind: "child",
        sourceNodeId: family.id,
        targetNodeId: personNodeId(childId),
      });
    }
  }

  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    adjacency.get(edge.targetNodeId)?.push(edge.sourceNodeId);
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const assignedNodeIds = new Set<string>();
  const components = [];
  for (const start of nodes) {
    if (assignedNodeIds.has(start.id)) continue;
    const pending = [start.id];
    const nodeIds: string[] = [];
    while (pending.length > 0) {
      const nodeId = pending.pop()!;
      if (assignedNodeIds.has(nodeId)) continue;
      assignedNodeIds.add(nodeId);
      nodeIds.push(nodeId);
      for (const neighbourId of adjacency.get(nodeId) ?? []) {
        if (!assignedNodeIds.has(neighbourId)) pending.push(neighbourId);
      }
    }
    nodeIds.sort();
    const componentNodes = nodeIds.map((nodeId) => nodeById.get(nodeId)!);
    const rootNodeIds = componentNodes
      .filter((node) => node.kind === "individual" && !selectedParentFamilyByChild.has(node.individualId))
      .map((node) => node.id)
      .sort();
    const depths = componentNodes.map((node) => node.lineageDepth);
    components.push({
      id: `component:${components.length + 1}`,
      nodeIds,
      rootNodeIds,
      minLineageDepth: Math.min(...depths),
      maxLineageDepth: Math.max(...depths),
    });
  }

  return { schemaVersion: 1, nodes, edges, components };
}

function toSegments(points: readonly { x: number; y: number }[]): TreeSegment[] {
  const segments: TreeSegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from.x === to.x && from.y === to.y) continue;
    segments.push({ id: "", x1: from.x, y1: from.y, x2: to.x, y2: to.y });
  }
  return segments;
}

export function computeTreeLayout(graph: TreeGraph, rootId: string): TreeLayout {
  const kinshipGraph = toKinshipGraph(graph);
  const layout = layoutEngine.layout({
    graph: kinshipGraph,
    focusId: rootId,
    depth: MAX_DEPTH,
    includePartners: true,
    includeSiblings: true,
  });

  const segmentsByKey = new Map<string, TreeSegment>();
  for (const edge of layout.edges) {
    for (const segment of toSegments(edge.points)) {
      const forward = `${segment.x1.toFixed(2)}:${segment.y1.toFixed(2)}:${segment.x2.toFixed(2)}:${segment.y2.toFixed(2)}`;
      const reverse = `${segment.x2.toFixed(2)}:${segment.y2.toFixed(2)}:${segment.x1.toFixed(2)}:${segment.y1.toFixed(2)}`;
      const key = forward < reverse ? forward : reverse;
      if (!segmentsByKey.has(key)) segmentsByKey.set(key, { ...segment, id: `segment:${segmentsByKey.size}` });
    }
  }

  return {
    nodes: layout.individuals.map((node) => ({
      occurrenceId: node.occurrenceId,
      personId: node.node.individualId,
      x: node.x,
      y: node.y,
      isBlood: node.relation !== "partner",
      isFocus: node.focused,
    })),
    segments: Array.from(segmentsByKey.values()),
    width: layout.width,
    height: layout.height,
  };
}
