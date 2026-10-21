"""
Write a /go link for every Salvage lead.  Usage (from the repo root):

    python scripts\\lead_links.py

Reads <Desktop>/salvage_leads_100mi.csv (the same Desktop lookup as
lookup_lines.py, OneDrive redirection included) and writes
<Desktop>/salvage_lead_links.csv with columns exactly

    business_name,phone,city,trade,go_url,start_url

go_url = https://salvage.davyjoneslocker.app/go?biz=<name>&preset=home
         &trade=<trade>&demo=1&ref=lead&lead=<row>

  - <name> is business_name with trailing LLC / Inc / Co stripped, then
    URL-encoded.
  - hvac, plumbing, electrical, roofing map to themselves; "garage door"
    maps to garage.  Any other trade gets preset=other and no trade param.
  - <row> is the 1-based data row in the input file.

start_url = https://salvage.davyjoneslocker.app/start?biz=<name>&trade=<trade>
            (change 50: the link Andy texts after a "yes"; same <name>; the
            trade only for the five home trades)

Standard library only, no subprocesses, so it opens no console windows.
"""

from __future__ import annotations

import csv
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lookup_lines import INPUT_NAME, desktop_dir  # noqa: E402

OUTPUT_NAME = "salvage_lead_links.csv"
OUTPUT_COLUMNS = ["business_name", "phone", "city", "trade", "go_url", "start_url"]
GO_BASE = "https://salvage.davyjoneslocker.app/go"
START_BASE = "https://salvage.davyjoneslocker.app/start"

TRADES = {
    "hvac": "hvac",
    "plumbing": "plumbing",
    "electrical": "electrical",
    "roofing": "roofing",
    "garage door": "garage",
    "garage doors": "garage",
}

# Trailing entity suffixes, with their usual comma and periods; repeated so
# "Smith Co., Inc." loses both.
SUFFIX = re.compile(r"[\s,]+(?:L\.?L\.?C|Inc|Co)\.?\s*$", re.IGNORECASE)


def clean_name(name: str) -> str:
    name = " ".join(name.split())
    while True:
        stripped = SUFFIX.sub("", name)
        if stripped == name or not stripped:
            return name
        name = stripped


def go_url(name: str, trade_raw: str, row: int) -> str:
    trade = TRADES.get(" ".join(trade_raw.lower().split()))
    parts = [("biz", clean_name(name))]
    if trade:
        parts += [("preset", "home"), ("trade", trade)]
    else:
        parts += [("preset", "other")]
    parts += [("demo", "1"), ("ref", "lead"), ("lead", str(row))]
    return GO_BASE + "?" + urllib.parse.urlencode(parts, quote_via=urllib.parse.quote)


def start_url(name: str, trade_raw: str) -> str:
    trade = TRADES.get(" ".join(trade_raw.lower().split()))
    parts = [("biz", clean_name(name))]
    if trade:
        parts.append(("trade", trade))
    return START_BASE + "?" + urllib.parse.urlencode(parts, quote_via=urllib.parse.quote)


def main() -> int:
    desk = desktop_dir()
    source = desk / INPUT_NAME
    if not source.is_file():
        print(f"Input not found: {source}", file=sys.stderr)
        return 1
    with open(source, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames or []
        missing = [c for c in ("business_name", "phone_number", "city", "trade") if c not in fields]
        if missing:
            print(f"Input is missing columns: {', '.join(missing)}", file=sys.stderr)
            return 1
        rows = list(reader)

    out = desk / OUTPUT_NAME
    tmp = out.with_suffix(".csv.tmp")
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(OUTPUT_COLUMNS)
        for i, r in enumerate(rows, start=1):
            w.writerow([
                r["business_name"],
                r["phone_number"],
                r["city"],
                r["trade"],
                go_url(r["business_name"], r["trade"], i),
                start_url(r["business_name"], r["trade"]),
            ])
    tmp.replace(out)
    print(f"Wrote {len(rows)} rows to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
