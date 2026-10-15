#!/usr/bin/env python3
"""
Regenerate src/lib/fitscore/hybrid/data/jd-templates-all-india.json from the Excel workbook.

Usage:
  python3 scripts/export-jd-templates-xlsx.py /path/to/TigerHire_JD_Templates_All_India.xlsx
"""

from __future__ import annotations

import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def cell_text(c: ET.Element) -> str:
    is_el = c.find("m:is", NS)
    if is_el is not None:
        parts = []
        for t_el in is_el.findall(".//m:t", NS):
            if t_el.text:
                parts.append(t_el.text)
        return "".join(parts)
    v = c.find("m:v", NS)
    return v.text if v is not None else ""


def col_row(ref: str) -> tuple[str, int]:
    m = re.match(r"([A-Z]+)(\d+)", ref)
    if not m:
        return "", 0
    return m.group(1), int(m.group(2))


def parse_dim(s: str) -> dict[str, int | str] | None:
    s = (s or "").strip()
    if not s:
        return None
    m = re.match(r"([^:]+):\s*(\d+)\s*%", s, re.I)
    if not m:
        return None
    return {"name": m.group(1).strip().lower().replace(" ", "_"), "weight": int(m.group(2))}


def main() -> None:
    xlsx = sys.argv[1] if len(sys.argv) > 1 else None
    if not xlsx or not os.path.isfile(xlsx):
        print("Usage: python3 scripts/export-jd-templates-xlsx.py <path-to.xlsx>", file=sys.stderr)
        sys.exit(1)

    z = zipfile.ZipFile(xlsx)
    root = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    rows: dict[int, dict[str, str]] = {}
    for row in root.findall(".//m:sheetData/m:row", NS):
        for c in row.findall("m:c", NS):
            ref = c.get("r")
            if not ref:
                continue
            col, rnum = col_row(ref)
            if rnum not in rows:
                rows[rnum] = {}
            rows[rnum][col] = cell_text(c)

    templates = []
    for rnum in sorted(rows.keys()):
        if rnum <= 2:
            continue
        R = rows[rnum]
        title = (R.get("C") or "").strip()
        if not title:
            continue
        category = (R.get("B") or "").strip()
        dims = []
        for col in "DEFGHIJK":
            d = parse_dim(R.get(col, ""))
            if d:
                dims.append(d)
        if len(dims) < 6:
            continue
        idx = R.get("A", str(len(templates) + 1))
        tid = f"india_{idx}_{re.sub(r'[^a-z0-9]+', '_', title.lower()).strip('_')[:50]}"
        words = re.findall(r"[a-zA-Z]{3,}", title.lower())
        cat_words = re.findall(r"[a-zA-Z]{3,}", category.lower())
        kw = list(dict.fromkeys(words + cat_words))
        templates.append(
            {
                "id": tid,
                "category": category,
                "roleTitle": title,
                "keywords": kw,
                "dimensions": dims,
                "keySignals": (R.get("L") or "").strip(),
                "redFlags": (R.get("M") or "").strip(),
            }
        )

    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(repo_root, "src/lib/fitscore/hybrid/data/jd-templates-all-india.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    payload = {
        "version": 1,
        "source": os.path.basename(xlsx),
        "templates": templates,
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    print(f"Wrote {len(templates)} templates to {out}")


if __name__ == "__main__":
    main()
