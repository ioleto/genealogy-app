import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { extractErrorMessage, getTreeGraph } from "../api/client";
import type { Person, TreeGraph } from "../api/types";
import { computeTreeLayout } from "../components/treeLayout";
import PersonPicker from "../components/PersonPicker";
import { useTheme } from "../theme/ThemeContext";
import "./TreeView.css";

const SLOT_WIDTH = 200;
const ROW_HEIGHT = 168;
const CARD_WIDTH = 168;
const CARD_HEIGHT = 60;
const PHOTO_SIZE = 40;
const PHOTO_MARGIN = 10;

const INK = "#211f1c";
const INK_MUTED = "#6b6862";
const PAPER = "#f4f4f1";
const PAPER_RAISED = "#fbfbf9";
const BORDER = "rgba(33, 31, 28, 0.22)";
const MIN_SCALE = 0.25;
const MAX_SCALE = 2.4;

export default function TreeView() {
  const navigate = useNavigate();
  const { primary, secondary } = useTheme();
  const [graph, setGraph] = useState<TreeGraph | null>(null);
  const [rootId, setRootId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const panGroupRef = useRef<SVGGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view);
  const rafRef = useRef<number | null>(null);
  const dragState = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null);

  function applyTransformNow() {
    if (panGroupRef.current) {
      const v = viewRef.current;
      panGroupRef.current.setAttribute("transform", `translate(${v.x}, ${v.y}) scale(${v.scale})`);
    }
  }

  // Commits the ref'd view into React state, coalesced to at most once per
  // animation frame so dragging/zooming never triggers a full re-render of
  // every node/line on each raw pointer or wheel event (the cause of visible
  // stutter/paint glitches on larger trees).
  function scheduleStateSync() {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setView({ ...viewRef.current });
    });
  }

  function setViewNow(next: { x: number; y: number; scale: number }) {
    viewRef.current = next;
    applyTransformNow();
    setView(next);
  }

  useEffect(() => {
    getTreeGraph()
      .then((g) => {
        setGraph(g);
        if (g.persons.length > 0) setRootId(g.persons[0].id);
      })
      .catch((err) => setError(extractErrorMessage(err, "Impossible de charger l'arbre.")))
      .finally(() => setLoading(false));
  }, []);

  // Recentre la vue à chaque changement de personne centrale : sans ça, la
  // position de défilement précédente restait appliquée et la nouvelle
  // fiche centrée pouvait se retrouver hors champ, donnant l'impression que
  // le clic n'avait rien fait.
  useEffect(() => {
    setViewNow({ x: 0, y: 0, scale: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootId]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Non-passive wheel listener so we can preventDefault (zoom instead of page scroll).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const delta = -e.deltaY * 0.0015;
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, viewRef.current.scale * (1 + delta)));
      viewRef.current = { ...viewRef.current, scale: nextScale };
      applyTransformNow();
      scheduleStateSync();
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function zoomBy(factor: number) {
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, viewRef.current.scale * factor));
    setViewNow({ x: viewRef.current.x, y: viewRef.current.y, scale: nextScale });
  }

  function onPointerDown(e: React.PointerEvent) {
    dragState.current = { startX: e.clientX, startY: e.clientY, viewX: viewRef.current.x, viewY: viewRef.current.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    viewRef.current = { ...viewRef.current, x: dragState.current.viewX + dx, y: dragState.current.viewY + dy };
    applyTransformNow();
    scheduleStateSync();
  }
  function onPointerUp() {
    dragState.current = null;
  }

  const personById = useMemo(() => new Map<string, Person>((graph?.persons ?? []).map((p) => [p.id, p])), [graph]);

  const layout = useMemo(() => {
    if (!graph || !rootId) return null;
    return computeTreeLayout(graph, rootId);
  }, [graph, rootId]);

  function recenter() {
    setViewNow({ x: 0, y: 0, scale: 1 });
  }

  function yearsOf(p: Person): string {
    const b = p.birth_date ? p.birth_date.slice(0, 4) : "?";
    const d = p.death_date ? p.death_date.slice(0, 4) : "";
    return d ? `${b} – ${d}` : b;
  }

  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Remplace les références <image href="/uploads/..."> par leur contenu en
  // base64 : une fois l'arbre sérialisé en SVG autonome (data URI) pour
  // l'export, une image encore chargée depuis une URL externe au document
  // peut faire échouer canvas.toBlob/toDataURL (canvas "pollué") selon les
  // navigateurs. L'inliner rend l'export totalement autonome.
  async function inlinePhotos(root: SVGGElement): Promise<void> {
    const images = Array.from(root.querySelectorAll("image"));
    await Promise.all(
      images.map(async (img) => {
        const href = img.getAttribute("href");
        if (!href || href.startsWith("data:")) return;
        try {
          const res = await fetch(href);
          const blob = await res.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          img.setAttribute("href", dataUrl);
        } catch {
          // Une photo indisponible ne doit pas faire échouer tout l'export :
          // on la retire simplement plutôt que de laisser un lien mort.
          img.removeAttribute("href");
        }
      })
    );
  }

  async function buildExportCanvas(): Promise<HTMLCanvasElement> {
    const group = groupRef.current;
    if (!group) throw new Error("Arbre non disponible");
    const bbox = group.getBBox();
    const PADDING = 48;
    const SCALE = 2;
    const width = (bbox.width + PADDING * 2) * SCALE;
    const height = (bbox.height + PADDING * 2) * SCALE;

    const ns = "http://www.w3.org/2000/svg";
    const clone = group.cloneNode(true) as SVGGElement;
    clone.setAttribute("transform", `translate(${PADDING - bbox.x}, ${PADDING - bbox.y})`);

    await inlinePhotos(clone);

    const exportSvg = document.createElementNS(ns, "svg");
    exportSvg.setAttribute("xmlns", ns);
    exportSvg.setAttribute("viewBox", `0 0 ${bbox.width + PADDING * 2} ${bbox.height + PADDING * 2}`);
    exportSvg.setAttribute("width", String(width));
    exportSvg.setAttribute("height", String(height));

    const bg = document.createElementNS(ns, "rect");
    bg.setAttribute("x", "0");
    bg.setAttribute("y", "0");
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", PAPER);
    exportSvg.appendChild(bg);
    exportSvg.appendChild(clone);

    const svgString = new XMLSerializer().serializeToString(exportSvg);
    const svgDataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas indisponible"));
        ctx.fillStyle = PAPER;
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas);
      };
      img.onerror = () => reject(new Error("Impossible de préparer l'export"));
      img.src = svgDataUrl;
    });
  }

  async function exportPng() {
    try {
      const canvas = await buildExportCanvas();
      canvas.toBlob((blob) => blob && download(blob, "arbre-genealogique.png"), "image/png");
    } catch (err) {
      setError(extractErrorMessage(err, "L'export PNG a échoué."));
    }
  }

  async function exportPdf() {
    try {
      const canvas = await buildExportCanvas();
      const imgData = canvas.toDataURL("image/png");
      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? "landscape" : "portrait",
        unit: "px",
        format: [canvas.width, canvas.height],
      });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save("arbre-genealogique.pdf");
    } catch (err) {
      setError(extractErrorMessage(err, "L'export PDF a échoué."));
    }
  }

  if (loading) return <div className="page muted">Chargement de l'arbre…</div>;

  if (!loading && (graph?.persons.length ?? 0) === 0) {
    return (
      <div className="page">
        <h1>Arbre</h1>
        <p className="muted" style={{ marginTop: "1rem" }}>
          Aucune fiche pour le moment. Ajoutez vos premières personnes depuis l'onglet « Fiches » pour voir
          apparaître l'arbre.
        </p>
      </div>
    );
  }

  const minGen = layout ? Math.min(0, ...layout.nodes.map((n) => n.generation)) : 0;
  const rowOffset = -minGen * ROW_HEIGHT + CARD_HEIGHT;

  return (
    <div className="tree-page">
      <div className="tree-toolbar">
        <div className="tree-toolbar-root">
          <div className="tree-toolbar-root-label">
            <span className="muted" style={{ fontSize: "0.72rem" }}>
              Centré sur
            </span>
            <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>
              {rootId && personById.get(rootId)
                ? `${personById.get(rootId)!.first_name} ${personById.get(rootId)!.last_name}`
                : "—"}
            </span>
          </div>
          <PersonPicker
            value={null}
            onChange={(p) => p && setRootId(p.id)}
            placeholder="Changer de fiche…"
            alwaysSearchable
          />
        </div>
        <div className="tree-toolbar-actions">
          <div className="tree-zoom-group">
            <button className="btn btn-ghost" onClick={() => zoomBy(1 / 1.3)} type="button" aria-label="Dézoomer">
              −
            </button>
            <button className="btn btn-ghost" onClick={() => zoomBy(1.3)} type="button" aria-label="Zoomer">
              +
            </button>
          </div>
          <button className="btn btn-ghost" onClick={recenter} type="button">
            Recentrer
          </button>
          <button className="btn btn-ghost" onClick={exportPng} type="button">
            Export PNG
          </button>
          <button className="btn btn-ghost" onClick={exportPdf} type="button">
            Export PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner" style={{ margin: "0 1.6rem" }}>
          {error}
        </div>
      )}

      <div
        className="tree-viewport"
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <svg ref={svgRef} width="100%" height="100%">
          <g ref={panGroupRef} transform={`translate(${view.x}, ${view.y}) scale(${view.scale})`}>
            <g ref={groupRef} transform={`translate(400, ${rowOffset})`}>
              {layout?.spouseLines.map((l, i) => (
                <line
                  key={`sl-${i}`}
                  x1={l.x1 * SLOT_WIDTH}
                  x2={l.x2 * SLOT_WIDTH}
                  y1={l.generation * ROW_HEIGHT}
                  y2={l.generation * ROW_HEIGHT}
                  stroke={BORDER}
                  strokeWidth={2}
                />
              ))}

              {layout?.familyEdges.map((e, i) => {
                const busY = (e.unionGeneration + 0.5) * ROW_HEIGHT;
                const minX = Math.min(...e.childrenX) * SLOT_WIDTH;
                const maxX = Math.max(...e.childrenX) * SLOT_WIDTH;
                return (
                  <g key={`fe-${i}`}>
                    <line
                      x1={e.unionMidX * SLOT_WIDTH}
                      x2={e.unionMidX * SLOT_WIDTH}
                      y1={e.unionGeneration * ROW_HEIGHT}
                      y2={busY}
                      stroke={BORDER}
                      strokeWidth={2}
                    />
                    <line x1={minX} x2={maxX} y1={busY} y2={busY} stroke={BORDER} strokeWidth={2} />
                    {e.childrenX.map((cx, j) => (
                      <line
                        key={j}
                        x1={cx * SLOT_WIDTH}
                        x2={cx * SLOT_WIDTH}
                        y1={busY}
                        y2={e.childGeneration * ROW_HEIGHT}
                        stroke={BORDER}
                        strokeWidth={2}
                      />
                    ))}
                  </g>
                );
              })}

              {layout?.nodes.map((n) => {
                const person = personById.get(n.personId);
                if (!person) return null;
                const cx = n.x * SLOT_WIDTH;
                const cy = n.generation * ROW_HEIGHT;
                const accent = n.isBlood ? primary : secondary;
                const isRoot = n.personId === rootId;
                const hasPhoto = !!person.photo_url;
                const textX = hasPhoto ? PHOTO_MARGIN * 2 + PHOTO_SIZE : 14;
                return (
                  <g
                    key={n.personId}
                    transform={`translate(${cx - CARD_WIDTH / 2}, ${cy - CARD_HEIGHT / 2})`}
                    className="tree-node"
                    onClick={() => navigate(`/fiches/${n.personId}`)}
                  >
                    <rect
                      width={CARD_WIDTH}
                      height={CARD_HEIGHT}
                      rx={5}
                      fill={PAPER_RAISED}
                      stroke={isRoot ? accent : BORDER}
                      strokeWidth={isRoot ? 2 : 1}
                    />
                    <rect x={0} y={0} width={4} height={CARD_HEIGHT} fill={accent} />
                    {hasPhoto && (
                      <>
                        <rect
                          x={PHOTO_MARGIN}
                          y={(CARD_HEIGHT - PHOTO_SIZE) / 2}
                          width={PHOTO_SIZE}
                          height={PHOTO_SIZE}
                          rx={4}
                          fill={PAPER}
                          stroke={BORDER}
                        />
                        <image
                          href={person.photo_url ?? undefined}
                          x={PHOTO_MARGIN}
                          y={(CARD_HEIGHT - PHOTO_SIZE) / 2}
                          width={PHOTO_SIZE}
                          height={PHOTO_SIZE}
                          preserveAspectRatio="xMidYMid slice"
                        />
                        <rect
                          x={PHOTO_MARGIN}
                          y={(CARD_HEIGHT - PHOTO_SIZE) / 2}
                          width={PHOTO_SIZE}
                          height={PHOTO_SIZE}
                          rx={4}
                          fill="none"
                          stroke={BORDER}
                        />
                      </>
                    )}
                    <text x={textX} y={24} fontFamily="IBM Plex Sans, sans-serif" fontSize={13} fontWeight={600} fill={INK}>
                      {person.first_name} {person.last_name}
                    </text>
                    <text x={textX} y={42} fontFamily="IBM Plex Sans, sans-serif" fontSize={11} fill={INK_MUTED}>
                      {yearsOf(person)}
                      {person.occupation ? ` · ${person.occupation}` : ""}
                    </text>
                  </g>
                );
              })}
            </g>
          </g>
        </svg>
      </div>

      <div className="tree-legend">
        <span>
          <i style={{ background: primary }} /> Lignée directe
        </span>
        <span>
          <i style={{ background: secondary }} /> Conjoint·e / par alliance
        </span>
        <span className="muted">Molette ou boutons +/− pour zoomer · glisser pour se déplacer · cliquer une fiche pour l'ouvrir</span>
      </div>
    </div>
  );
}
