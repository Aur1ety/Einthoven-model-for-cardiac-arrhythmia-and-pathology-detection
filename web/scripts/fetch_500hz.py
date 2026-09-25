"""Download the 500 Hz PTB-XL records for the ECGs the website's 3D view shows.

The model and the 2D traces use the 100 Hz records already in data/raw/records100.
The 3D heart-vector (VCG) loop is drawn from the 500 Hz records instead, because
at 100 Hz one heartbeat's QRS loop is only 8-10 points. Only the records listed
in web/public/data/site.json (the explorer sample) are fetched, from PhysioNet,
and every file is checked against PhysioNet's published SHA256SUMS.txt.

Data licence: PTB-XL v1.0.3, CC BY 4.0 (Wagner et al., Scientific Data 2020).

Usage (from the repo root, BEFORE export_site_data.py, which needs these files; this
script only reads the committed web/public/data/site.json and ptbxl_database.csv):
    python web/scripts/fetch_500hz.py
If the explorer sample changes, the export stops and prints the command to fetch the new
records (python web/scripts/fetch_500hz.py --ids ...).
"""
import argparse
import hashlib
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
BASE = "https://physionet.org/files/ptb-xl/1.0.3/"
UA = {"User-Agent": "einthoven-web/1.0 (research site data fetch)"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--ids", type=int, nargs="+", help="fetch these ECG ids instead of the explorer sample in site.json (export_site_data.py prints them if any are missing)")
    args = ap.parse_args()
    if args.ids:
        ids = args.ids
    else:
        site = json.loads((ROOT / "web" / "public" / "data" / "site.json").read_text(encoding="utf-8"))
        ids = [c["id"] for c in site["sample"]["cases"]]
    db = pd.read_csv(RAW / "ptbxl_database.csv", index_col="ecg_id")
    sums = {}
    for line in get(BASE + "SHA256SUMS.txt").decode().splitlines():
        digest, name = line.split(maxsplit=1)
        sums[name.strip()] = digest

    def fetch(ecg_id):
        stem = db.loc[ecg_id].filename_hr  # e.g. records500/00000/00377_hr
        done = 0
        for ext in (".hea", ".dat"):
            rel = stem + ext
            dest = RAW / rel
            if dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest() == sums[rel]:
                continue
            body = get(BASE + rel)
            assert hashlib.sha256(body).hexdigest() == sums[rel], f"checksum mismatch for {rel}"
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(body)
            done += 1
        return done

    with ThreadPoolExecutor(max_workers=6) as pool:
        fetched = sum(pool.map(fetch, ids))
    print(f"{len(ids)} records present and verified against SHA256SUMS.txt ({fetched} files downloaded now)")


if __name__ == "__main__":
    main()
