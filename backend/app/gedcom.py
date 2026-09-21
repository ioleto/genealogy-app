"""Import / export au format GEDCOM (5.5.1, compatible avec la plupart des
fichiers 7.0 de base), le standard d'échange utilisé par les logiciels de
généalogie (Gramps, Geneanet, MyHeritage, Ancestry, FamilySearch...).

Le parseur travaille au niveau des balises plutôt que de valider strictement
l'en-tête GEDC/VERS, ce qui lui permet de lire aussi bien des fichiers 5.5.1
que des fichiers 7.0 basiques (les balises INDI/FAM/NAME/BIRT/DEAT/MARR/
HUSB/WIFE/CHIL sont restées stables entre les deux versions).

Limites connues, documentées plutôt que cachées :
- l'import crée toujours de nouvelles fiches, il ne tente pas de fusionner
  avec des fiches existantes (dédoublonnage non géré) ;
- les dates non standard (calendriers non grégoriens, doubles millésimes)
  ne sont pas reconnues et sont importées sans date ;
- les photos/pièces jointes (OBJE) ne sont pas importées ni exportées.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date

from app import models

MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
MONTH_TO_NUM = {m: i + 1 for i, m in enumerate(MONTHS)}

UNION_TYPE_LABELS = {
    "civil_union": "Union civile",
    "partnership": "Concubinage",
}


# ---------------------------------------------------------------------------
# Dates
# ---------------------------------------------------------------------------

def format_gedcom_date(d: date | None, approx: bool) -> str | None:
    if d is None:
        return None
    text = f"{d.day} {MONTHS[d.month - 1]} {d.year}"
    return f"ABT {text}" if approx else text


def parse_gedcom_date(raw: str) -> tuple[date | None, bool]:
    if not raw:
        return None, False
    s = raw.strip().upper()
    approx = False

    for prefix in ("ABT", "EST", "CAL", "BEF", "AFT"):
        if s.startswith(prefix):
            approx = True
            s = s[len(prefix):].strip()
            break
    if s.startswith("BET"):
        approx = True
        s = s[3:].split("AND")[0].strip()

    parts = s.split()
    try:
        if len(parts) == 3:
            day, month, year = int(parts[0]), MONTH_TO_NUM.get(parts[1]), int(parts[2])
        elif len(parts) == 2:
            day, month, year = 1, MONTH_TO_NUM.get(parts[0]), int(parts[1])
            approx = True
        elif len(parts) == 1:
            day, month, year = 1, 1, int(parts[0])
            approx = True
        else:
            return None, True
        if month is None:
            return None, True
        return date(year, month, day), approx
    except (ValueError, TypeError):
        return None, True


def parse_gedcom_name(value: str) -> tuple[str, str]:
    m = re.match(r"^(.*?)/(.*?)/", value)
    if m:
        given, surname = m.group(1).strip(), m.group(2).strip()
    else:
        given, surname = value.strip(), ""
    return given or "Prénom inconnu", surname or "Nom inconnu"


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def export_gedcom(persons: list[models.Person], unions: list[models.Union], filiations: list[models.Filiation]) -> str:
    person_index = {p.id: i + 1 for i, p in enumerate(persons)}
    union_index = {u.id: i + 1 for i, u in enumerate(unions)}

    fams_by_person: dict[str, list[str]] = defaultdict(list)
    for u in unions:
        fams_by_person[u.partner1_id].append(u.id)
        if u.partner2_id:
            fams_by_person[u.partner2_id].append(u.id)

    famc_by_person: dict[str, str] = {}
    children_by_union: dict[str, list[str]] = defaultdict(list)
    for f in filiations:
        famc_by_person.setdefault(f.child_id, f.union_id)
        children_by_union[f.union_id].append(f.child_id)

    lines: list[str] = [
        "0 HEAD",
        "1 SOUR ArbreGenealogique",
        "1 GEDC",
        "2 VERS 5.5.1",
        "2 FORM LINEAGE-LINKED",
        "1 CHAR UTF-8",
    ]

    def enum_value(v):
        return v.value if hasattr(v, "value") else v

    for p in persons:
        pid = f"@I{person_index[p.id]}@"
        lines.append(f"0 {pid} INDI")
        given, surname = p.first_name or "", p.last_name or ""
        lines.append(f"1 NAME {given} /{surname}/")
        if given:
            lines.append(f"2 GIVN {given}")
        if surname:
            lines.append(f"2 SURN {surname}")
        sex = enum_value(p.sex)
        if sex in ("M", "F"):
            lines.append(f"1 SEX {sex}")
        if p.birth_date or p.birth_place:
            lines.append("1 BIRT")
            if p.birth_date:
                lines.append(f"2 DATE {format_gedcom_date(p.birth_date, p.birth_date_approx)}")
            if p.birth_place:
                lines.append(f"2 PLAC {p.birth_place}")
        if p.death_date or p.death_place:
            lines.append("1 DEAT")
            if p.death_date:
                lines.append(f"2 DATE {format_gedcom_date(p.death_date, p.death_date_approx)}")
            if p.death_place:
                lines.append(f"2 PLAC {p.death_place}")
        if p.occupation:
            lines.append(f"1 OCCU {p.occupation}")
        if p.biography:
            bio_lines = p.biography.splitlines() or [""]
            lines.append(f"1 NOTE {bio_lines[0]}")
            for cont in bio_lines[1:]:
                lines.append(f"2 CONT {cont}")
        for uid in fams_by_person.get(p.id, []):
            lines.append(f"1 FAMS @F{union_index[uid]}@")
        if p.id in famc_by_person:
            lines.append(f"1 FAMC @F{union_index[famc_by_person[p.id]]}@")

    for u in unions:
        fid = f"@F{union_index[u.id]}@"
        lines.append(f"0 {fid} FAM")
        if u.partner1_id:
            lines.append(f"1 HUSB @I{person_index[u.partner1_id]}@")
        if u.partner2_id:
            lines.append(f"1 WIFE @I{person_index[u.partner2_id]}@")
        utype = enum_value(u.union_type)
        if u.union_date or u.union_place or utype == "marriage":
            lines.append("1 MARR")
            if u.union_date:
                lines.append(f"2 DATE {format_gedcom_date(u.union_date, u.union_date_approx)}")
            if u.union_place:
                lines.append(f"2 PLAC {u.union_place}")
            if utype in UNION_TYPE_LABELS:
                lines.append(f"2 TYPE {UNION_TYPE_LABELS[utype]}")
        if u.end_date:
            lines.append("1 DIV")
            lines.append(f"2 DATE {format_gedcom_date(u.end_date, False)}")
        for child_id in children_by_union.get(u.id, []):
            lines.append(f"1 CHIL @I{person_index[child_id]}@")

    lines.append("0 TRLR")
    return "\r\n".join(lines) + "\r\n"


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

@dataclass
class ParsedGedcom:
    persons: dict[str, dict] = field(default_factory=dict)
    families: dict[str, dict] = field(default_factory=dict)


def _split_line(raw: str):
    line = raw.strip()
    if not line:
        return None
    parts = line.split(" ", 1)
    level = int(parts[0])
    remainder = parts[1] if len(parts) > 1 else ""
    if remainder.startswith("@"):
        xref, _, tail = remainder.partition(" ")
        tag, _, value = tail.partition(" ")
        return level, xref, tag, value
    tag, _, value = remainder.partition(" ")
    return level, None, tag, value


def parse_gedcom(text: str) -> ParsedGedcom:
    result = ParsedGedcom()
    current: tuple[str, str] | None = None  # ("INDI"|"FAM", xref)
    current_event: str | None = None

    for raw in text.splitlines():
        parsed = _split_line(raw)
        if parsed is None:
            continue
        level, xref, tag, value = parsed

        if level == 0:
            current_event = None
            if tag == "INDI" and xref:
                current = ("INDI", xref)
                result.persons[xref] = {"sex": "U"}
            elif tag == "FAM" and xref:
                current = ("FAM", xref)
                result.families[xref] = {"children": []}
            else:
                current = None
            continue

        if current is None:
            continue
        kind, rxref = current

        if kind == "INDI":
            person = result.persons[rxref]
            if level == 1:
                current_event = None
                if tag == "NAME":
                    given, surname = parse_gedcom_name(value)
                    person.setdefault("first_name", given)
                    person.setdefault("last_name", surname)
                elif tag == "SEX":
                    v = value.strip().upper()[:1]
                    person["sex"] = v if v in ("M", "F") else "U"
                elif tag == "OCCU":
                    person["occupation"] = value
                elif tag in ("BIRT", "DEAT"):
                    current_event = tag
                elif tag == "NOTE":
                    person.setdefault("_note", []).append(value)
                    current_event = "NOTE"
            elif level == 2:
                if current_event == "BIRT":
                    if tag == "DATE":
                        person["birth_date"], person["birth_date_approx"] = parse_gedcom_date(value)
                    elif tag == "PLAC":
                        person["birth_place"] = value
                elif current_event == "DEAT":
                    if tag == "DATE":
                        person["death_date"], person["death_date_approx"] = parse_gedcom_date(value)
                    elif tag == "PLAC":
                        person["death_place"] = value
                elif current_event == "NOTE" and tag in ("CONT", "CONC"):
                    sep = "\n" if tag == "CONT" else ""
                    person.setdefault("_note", [""])
                    person["_note"][-1] = person["_note"][-1] + sep + value

        elif kind == "FAM":
            fam = result.families[rxref]
            if level == 1:
                current_event = None
                if tag == "HUSB":
                    fam["partner1"] = value
                elif tag == "WIFE":
                    fam["partner2"] = value
                elif tag == "CHIL":
                    fam["children"].append(value)
                elif tag == "MARR":
                    current_event = "MARR"
                    fam["union_type"] = "marriage"
                elif tag == "DIV":
                    current_event = "DIV"
                elif tag in ("ENGA", "MARB", "MARC"):
                    current_event = "MARR"
                    fam.setdefault("union_type", "marriage")
            elif level == 2:
                if current_event == "MARR":
                    if tag == "DATE":
                        fam["union_date"], fam["union_date_approx"] = parse_gedcom_date(value)
                    elif tag == "PLAC":
                        fam["union_place"] = value
                elif current_event == "DIV" and tag == "DATE":
                    fam["end_date"], _ = parse_gedcom_date(value)

    for person in result.persons.values():
        if "_note" in person:
            person["biography"] = "\n".join(person.pop("_note"))

    return result


async def apply_import(db, parsed: ParsedGedcom, created_by: str) -> dict:
    from sqlalchemy.exc import IntegrityError

    xref_to_id: dict[str, str] = {}
    for xref, data in parsed.persons.items():
        person = models.Person(
            first_name=data.get("first_name") or "Prénom inconnu",
            last_name=data.get("last_name") or "Nom inconnu",
            sex=data.get("sex", "U"),
            birth_date=data.get("birth_date"),
            birth_date_approx=data.get("birth_date_approx", False),
            birth_place=data.get("birth_place"),
            death_date=data.get("death_date"),
            death_date_approx=data.get("death_date_approx", False),
            death_place=data.get("death_place"),
            occupation=data.get("occupation"),
            biography=data.get("biography"),
            created_by=created_by,
        )
        db.add(person)
        await db.flush()
        xref_to_id[xref] = person.id
    await db.commit()

    unions_created = 0
    filiations_created = 0
    skipped_unions = 0

    for fam in parsed.families.values():
        p1 = xref_to_id.get(fam.get("partner1", ""))
        p2 = xref_to_id.get(fam.get("partner2", ""))
        if p1 is None and p2 is None:
            continue
        if p1 is None:
            p1, p2 = p2, None

        try:
            async with db.begin_nested():
                union = models.Union(
                    partner1_id=p1,
                    partner2_id=p2,
                    union_type=fam.get("union_type", "unknown"),
                    union_date=fam.get("union_date"),
                    union_date_approx=fam.get("union_date_approx", False),
                    union_place=fam.get("union_place"),
                    end_date=fam.get("end_date"),
                )
                db.add(union)
                await db.flush()
                local_filiations = 0
                for child_xref in fam.get("children", []):
                    child_id = xref_to_id.get(child_xref)
                    if child_id is not None:
                        db.add(models.Filiation(child_id=child_id, union_id=union.id))
                        local_filiations += 1
            unions_created += 1
            filiations_created += local_filiations
        except IntegrityError:
            skipped_unions += 1

    await db.commit()

    return {
        "persons": len(xref_to_id),
        "unions": unions_created,
        "filiations": filiations_created,
        "skipped_unions": skipped_unions,
    }
