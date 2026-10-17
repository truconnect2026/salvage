"""
Split the Salvage lead list by phone line type.  Usage (from the repo root):

    python scripts\\lookup_lines.py              # look up, then write the 3 CSVs
    python scripts\\lookup_lines.py --dry-run    # counts + projected cost, no API calls

Reads <Desktop>/salvage_leads_100mi.csv (phone_number is E.164) and calls
Twilio Lookup v2 with Fields=line_type_intelligence for each unique number,
throttled to 5 requests/sec.  Results are cached in scripts/lookup_cache.json,
so a re-run only pays for numbers it has not seen.

Writes to the top level of the Desktop:
  morgan_batch.csv               landline + fixedVoip, columns exactly
                                 phone_number,business_name,trade,city
  andy_dial.csv                  everything else (mobile, nonFixedVoip, unknown,
                                 ...), all columns, sorted priority then miles_from_gym
  salvage_leads_100mi_typed.csv  the input with line_type filled in

Stops before writing outputs if the projected cost passes $5.00 or more than
10 lookups fail.  Credentials come from the environment, then the repo-root
.env; they are never printed.  Standard library only, no subprocesses, so it
opens no console windows.
"""

from __future__ import annotations

import argparse
import base64
import csv
import io
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INPUT_NAME = "salvage_leads_100mi.csv"
TYPED_NAME = "salvage_leads_100mi_typed.csv"
MORGAN_NAME = "morgan_batch.csv"
ANDY_NAME = "andy_dial.csv"

MORGAN_COLUMNS = ["phone_number", "business_name", "trade", "city"]
REQUIRED_COLUMNS = MORGAN_COLUMNS + ["priority", "miles_from_gym"]
MORGAN_TYPES = {"landline", "fixedVoip"}

PRICE_PER_LOOKUP = 0.008  # USD, Twilio Lookup v2 line_type_intelligence
MAX_COST = 5.00
MAX_FAILURES = 10
MIN_INTERVAL = 0.21  # seconds between request starts: never 6 in any 1s window
RETRIES = 3
E164 = re.compile(r"^\+[1-9]\d{6,14}$")


class Abort(Exception):
    pass


# ---------- paths and credentials ------------------------------------------

def desktop_dir() -> Path:
    """The real Desktop, including a OneDrive-redirected one on Windows."""
    if os.name == "nt":
        try:
            import winreg

            key = r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key) as k:
                value, _ = winreg.QueryValueEx(k, "Desktop")
            path = Path(os.path.expandvars(value))
            if path.is_dir():
                return path
        except OSError:
            pass
    return Path.home() / "Desktop"


def read_dotenv(path: Path) -> dict:
    values = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):]
        key, _, value = line.partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        values[key.strip()] = value
    return values


def credentials() -> tuple:
    dotenv = read_dotenv(ROOT / ".env")

    def pick(*names):
        for name in names:
            value = os.environ.get(name) or dotenv.get(name)
            if value:
                return value
        return None

    user = pick("TWILIO_ACCOUNT_SID", "TWILIO_SID")
    secret = pick("TWILIO_AUTH_TOKEN", "TWILIO_TOKEN")
    if not (user and secret):
        user = pick("TWILIO_API_KEY", "TWILIO_API_KEY_SID")
        secret = pick("TWILIO_API_SECRET", "TWILIO_API_KEY_SECRET")
    if not (user and secret):
        raise Abort(
            "Twilio credentials not found. Set TWILIO_ACCOUNT_SID and "
            f"TWILIO_AUTH_TOKEN in the environment or in {ROOT / '.env'}."
        )
    return user, secret


# ---------- cache ----------------------------------------------------------

def load_cache(path: Path) -> dict:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise Abort(f"Cannot read cache {path}: {e}. Fix or delete it.")
    return data if isinstance(data, dict) else {}


def write_atomic(path: Path, text: str) -> None:
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    try:
        os.replace(tmp, path)
    except PermissionError:
        tmp.unlink(missing_ok=True)
        raise Abort(f"Cannot write {path} - is it open in Excel? Close it and re-run.")


def save_cache(path: Path, cache: dict) -> None:
    write_atomic(path, json.dumps(cache, indent=1, sort_keys=True) + "\n")


# ---------- Twilio ---------------------------------------------------------

class Lookup:
    def __init__(self, api_base: str, user: str, secret: str):
        self.api_base = api_base.rstrip("/")
        token = base64.b64encode(f"{user}:{secret}".encode()).decode()
        self.headers = {"Authorization": f"Basic {token}", "Accept": "application/json"}
        self.last_start = 0.0

    def _throttle(self) -> None:
        wait = self.last_start + MIN_INTERVAL - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self.last_start = time.monotonic()

    def fetch(self, number: str) -> tuple:
        """Returns (cache_entry, billable).  Raises RuntimeError on a failed lookup."""
        url = (
            f"{self.api_base}/v2/PhoneNumbers/{urllib.parse.quote(number, safe='')}"
            "?Fields=line_type_intelligence"
        )
        last_error = "no attempt"
        for attempt in range(RETRIES + 1):
            if attempt:
                time.sleep(2 ** (attempt - 1))
            self._throttle()
            request = urllib.request.Request(url, headers=self.headers)
            try:
                with urllib.request.urlopen(request, timeout=20) as response:
                    body = json.loads(response.read().decode("utf-8"))
                return parse(body), body.get("line_type_intelligence") is not None
            except urllib.error.HTTPError as e:
                if e.code in (401, 403):
                    raise Abort(f"Twilio refused the credentials (HTTP {e.code}). Check .env.")
                if e.code == 404:
                    return {"type": "invalid", "carrier": None, "error_code": None, "valid": False}, False
                last_error = f"HTTP {e.code} {twilio_message(e)}".strip()
                if e.code != 429 and e.code < 500:
                    break
            except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
                last_error = f"{type(e).__name__}: {getattr(e, 'reason', e)}"
        raise RuntimeError(last_error)


def twilio_message(error: urllib.error.HTTPError) -> str:
    try:
        return json.loads(error.read().decode("utf-8")).get("message", "")
    except Exception:
        return ""


def parse(body: dict) -> dict:
    lti = body.get("line_type_intelligence") or {}
    if body.get("valid") is False:
        line_type = "invalid"
    else:
        line_type = lti.get("type") or "unknown"
    return {
        "type": line_type,
        "carrier": lti.get("carrier_name"),
        "error_code": lti.get("error_code"),
        "valid": body.get("valid"),
    }


# ---------- sorting --------------------------------------------------------

PRIORITY_WORDS = {"urgent": 0, "hot": 0, "high": 0, "medium": 1, "med": 1, "warm": 1,
                  "normal": 1, "low": 2, "cold": 2}


def priority_key(value: str) -> tuple:
    text = (value or "").strip()
    if not text:
        return (3, 0.0, "")
    try:
        return (0, float(text), "")
    except ValueError:
        pass
    word = PRIORITY_WORDS.get(text.lower())
    if word is not None:
        return (1, float(word), "")
    digits = re.search(r"\d+(\.\d+)?", text)
    if digits:
        return (0, float(digits.group()), text.lower())
    return (2, 0.0, text.lower())


def miles_key(value: str) -> float:
    try:
        return float((value or "").strip())
    except ValueError:
        return math.inf


# ---------- main -----------------------------------------------------------

def write_csv(path: Path, columns: list, rows: list) -> None:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore", lineterminator="\r\n")
    writer.writeheader()
    writer.writerows(rows)
    write_atomic(path, buffer.getvalue())


def run(args) -> int:
    desktop = Path(args.desktop) if args.desktop else desktop_dir()
    source = Path(args.input) if args.input else desktop / INPUT_NAME
    cache_path = Path(args.cache)
    outputs = [desktop / MORGAN_NAME, desktop / ANDY_NAME, desktop / TYPED_NAME]
    errors = []

    if not source.is_file():
        raise Abort(f"Input not found: {source}")
    with open(source, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        columns = list(reader.fieldnames or [])
        rows = list(reader)
    missing = [c for c in REQUIRED_COLUMNS if c not in columns]
    if missing:
        raise Abort(f"Input is missing column(s): {', '.join(missing)}")
    if "line_type" not in columns:
        columns.append("line_type")

    cache = load_cache(cache_path)
    numbers, unique = [], set()
    for i, row in enumerate(rows, start=2):  # row 1 is the header
        number = (row.get("phone_number") or "").strip()
        row["phone_number"] = number
        if not E164.match(number):
            errors.append(f"row {i}: phone_number {number!r} is not E.164 - not looked up")
        elif number not in unique:
            unique.add(number)
            numbers.append(number)
    todo = [n for n in numbers if n not in cache]
    projected = len(todo) * PRICE_PER_LOOKUP

    print(f"{len(rows)} rows, {len(numbers)} unique numbers, {len(numbers) - len(todo)} cached, "
          f"{len(todo)} to look up (projected ${projected:.2f})", file=sys.stderr)
    if projected > MAX_COST + 1e-9:
        raise Abort(f"Projected cost ${projected:.2f} passes the ${MAX_COST:.2f} cap - "
                    "nothing looked up.")
    if args.dry_run:
        print("Dry run - no API calls made, no files written.", file=sys.stderr)
        return 0

    spent = 0.0
    failures = []
    if todo:
        client = Lookup(args.api_base, *credentials())
        try:
            for done, number in enumerate(todo, start=1):
                if spent + PRICE_PER_LOOKUP > MAX_COST + 1e-9:
                    raise Abort(f"Cost cap ${MAX_COST:.2f} reached - stopped.")
                try:
                    entry, billable = client.fetch(number)
                except RuntimeError as e:
                    failures.append(f"{number}: {e}")
                    if len(failures) > MAX_FAILURES:
                        raise Abort(f"{len(failures)} lookups failed (limit {MAX_FAILURES}) - stopped.")
                    continue
                if billable:
                    spent += PRICE_PER_LOOKUP
                entry["looked_up_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
                cache[number] = entry
                if done % 25 == 0:
                    save_cache(cache_path, cache)
                    print(f"  {done}/{len(todo)} looked up", file=sys.stderr)
        except Abort as e:
            e.spent, e.failures = spent, failures
            raise
        finally:
            save_cache(cache_path, cache)
    errors.extend(f"lookup failed - {f} (left as unknown; re-run retries it)" for f in failures)

    counts = {}
    morgan, andy, seen = [], [], set()
    for row in rows:
        entry = cache.get(row["phone_number"])
        line_type = entry["type"] if entry else ("unknown" if E164.match(row["phone_number"]) else "invalid")
        row["line_type"] = line_type
        counts[line_type] = counts.get(line_type, 0) + 1
        if line_type in MORGAN_TYPES:
            if row["phone_number"] in seen:
                errors.append(f"{row['phone_number']}: duplicate - kept once in {MORGAN_NAME}")
                continue
            seen.add(row["phone_number"])
            morgan.append(row)
        else:
            andy.append(row)
    andy.sort(key=lambda r: (priority_key(r.get("priority")), miles_key(r.get("miles_from_gym"))))

    write_csv(outputs[0], MORGAN_COLUMNS, morgan)
    write_csv(outputs[1], columns, andy)
    write_csv(outputs[2], columns, rows)

    print(report(counts, len(morgan), len(andy), spent, len(todo) - len(failures),
                 len(numbers) - len(todo), outputs, errors))
    return 0


def report(counts, n_morgan, n_andy, spent, looked_up, cached, outputs, errors) -> str:
    lines = ["===== SALVAGE LINE-TYPE REPORT =====", "Line types (rows):"]
    for line_type, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
        lines.append(f"  {line_type:<14}{n}")
    lines += [
        f"  {'TOTAL':<14}{sum(counts.values())}",
        f"Morgan (landline + fixedVoip): {n_morgan} rows",
        f"Andy (everything else):        {n_andy} rows",
        f"Cost this run: ${spent:.2f} ({looked_up} new lookups at ${PRICE_PER_LOOKUP}; "
        f"{cached} from cache at $0)",
        "Outputs:",
        *(f"  {p}" for p in outputs),
        f"Errors: {len(errors) or 'none'}",
        *(f"  - {e}" for e in errors),
        "====================================",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0].strip())
    parser.add_argument("--dry-run", action="store_true", help="count and price only; no API calls")
    parser.add_argument("--input", help=f"input CSV (default: <Desktop>/{INPUT_NAME})")
    parser.add_argument("--desktop", help="output folder (default: your Desktop)")
    parser.add_argument("--cache", default=str(Path(__file__).resolve().parent / "lookup_cache.json"))
    parser.add_argument("--api-base", default="https://lookups.twilio.com", help=argparse.SUPPRESS)
    args = parser.parse_args()
    try:
        return run(args)
    except Abort as e:
        spent = getattr(e, "spent", 0.0)
        failures = getattr(e, "failures", [])
        lines = ["===== SALVAGE LINE-TYPE REPORT =====", f"STOPPED: {e}",
                 f"Cost this run: ${spent:.2f}", "Outputs: none written",
                 f"Errors: {len(failures) or 'none'}", *(f"  - {f}" for f in failures)]
        if hasattr(e, "spent"):
            lines.append("Cache saved - a re-run does not pay again for numbers already looked up.")
        lines.append("====================================")
        print("\n".join(lines))
        return 2
    except KeyboardInterrupt:
        print("Interrupted - cache saved; re-run to continue.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
