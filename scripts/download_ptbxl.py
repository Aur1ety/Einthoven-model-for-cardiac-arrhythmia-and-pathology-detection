"""Download PTB-XL v1.0.3 from PhysioNet and build derived metadata.

Downloads (into data/raw/):
  - ptbxl_database.csv
  - scp_statements.csv
  - records100/**  (all 100 Hz downsampled records, .hdr + .dat)

Builds (into data/processed/):
  - metadata.csv           one row per record, 14 columns, strat_fold preserved
  - diagnostic_mapping.csv scp_statements.csv with an explicit superclass column

Splits are NOT created here: PTB-XL's provided strat_fold (1-10) is used
downstream directly (folds 1-8 train, 9 val, 10 test). No shuffling, no
custom splits, no modifications of strat_fold.

Credentials: PTB-XL is currently anonymously readable; if PhysioNet ever
returns 401/403, set PHYSIONET_USERNAME / PHYSIONET_PASSWORD (free account
at https://physionet.org/) and re-run.
"""

from __future__ import annotations

import ast
import concurrent.futures
import os
import sys
import threading
import time
from pathlib import Path

import pandas as pd
import requests
import yaml
from tqdm import tqdm

PTBXL_VERSION = "1.0.3"
BASE_URL = f"https://physionet.org/files/ptb-xl/{PTBXL_VERSION}"
REPO_ROOT = Path(__file__).resolve().parents[1]
CHUNK = 1 << 16
WORKERS = 8
RETRIES = 3

_thread_local = threading.local()


class PhysionetAuthError(RuntimeError):
    pass


def load_config() -> dict:
    with open(REPO_ROOT / "configs" / "default.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def get_auth():
    user = os.environ.get("PHYSIONET_USERNAME")
    pwd = os.environ.get("PHYSIONET_PASSWORD")
    if user and pwd:
        return (user, pwd)
    return None


def session() -> requests.Session:
    if not hasattr(_thread_local, "session"):
        _thread_local.session = requests.Session()
    return _thread_local.session


def download_file(url: str, dest: Path, auth) -> str:
    if dest.exists() and dest.stat().st_size > 0:
        return "skipped"
    last_err: Exception | None = None
    for attempt in range(1, RETRIES + 1):
        try:
            with session().get(url, auth=auth, stream=True, timeout=60) as r:
                if r.status_code in (401, 403):
                    raise PhysionetAuthError(url)
                r.raise_for_status()
                dest.parent.mkdir(parents=True, exist_ok=True)
                tmp = dest.with_suffix(dest.suffix + ".part")
                with open(tmp, "wb") as f:
                    for chunk in r.iter_content(CHUNK):
                        f.write(chunk)
                tmp.replace(dest)
            return "downloaded"
        except PhysionetAuthError:
            raise
        except (requests.RequestException, OSError) as err:
            last_err = err
            time.sleep(1.5 * attempt)
    raise RuntimeError(f"failed after {RETRIES} attempts: {url}: {last_err}")


def build_outputs(raw_dir: Path, processed_dir: Path) -> None:
    db = pd.read_csv(raw_dir / "ptbxl_database.csv")
    scp = pd.read_csv(raw_dir / "scp_statements.csv")
    scp = scp.rename(columns={"Unnamed: 0": "scp_code"})

    diag = scp.loc[scp["diagnostic"] == 1, ["scp_code", "diagnostic_class"]]
    code_to_superclass: dict[str, str] = dict(zip(diag["scp_code"], diag["diagnostic_class"]))
    rhythm_codes = set(scp.loc[scp["rhythm"] == 1, "scp_code"])

    superclasses: list[str] = []
    rhythm_labels: list[str] = []
    for raw in db["scp_codes"]:
        codes = list(ast.literal_eval(raw).keys())
        supers = []
        for code in codes:
            sc = code_to_superclass.get(code)
            if sc and sc not in supers:
                supers.append(sc)
        superclasses.append(",".join(supers))
        rhythm_labels.append(",".join(c for c in codes if c in rhythm_codes))

    quality = pd.Series(0, index=db.index)
    for col in ("static_noise", "burst_noise", "baseline_drift", "electrodes_problems"):
        vals = db[col].fillna("").astype(str).str.strip()
        quality[vals.ne("")] = 1

    metadata = pd.DataFrame(
        {
            "ecg_id": db["ecg_id"].astype(int),
            "patient_id": db["patient_id"].astype(int),
            "age": db["age"],
            "sex": db["sex"],
            "height": db["height"],
            "weight": db["weight"],
            "recording_date": db["recording_date"],
            "heart_axis": db["heart_axis"],
            "scp_codes": db["scp_codes"],
            "diagnostic_superclass": superclasses,
            "rhythm_label": rhythm_labels,
            "signal_quality": quality,
            "strat_fold": db["strat_fold"].astype(int),
            "filename_lr": db["filename_lr"],
        }
    )

    processed_dir.mkdir(parents=True, exist_ok=True)
    metadata.to_csv(processed_dir / "metadata.csv", index=False)

    mapping = scp.copy()
    mapping["superclass"] = mapping["diagnostic_class"]
    mapping.to_csv(processed_dir / "diagnostic_mapping.csv", index=False)

    print(f"metadata.csv: {metadata.shape[0]} records, "
          f"{metadata['patient_id'].nunique()} unique patients")
    print(f"diagnostic_mapping.csv: {mapping.shape[0]} SCP codes, "
          f"{len(code_to_superclass)} diagnostic codes mapped to superclasses")


def main() -> None:
    cfg = load_config()
    data_dir = REPO_ROOT / cfg["data_dir"]
    raw_dir = data_dir / "raw"
    processed_dir = data_dir / "processed"
    raw_dir.mkdir(parents=True, exist_ok=True)
    auth = get_auth()

    top_level = ["ptbxl_database.csv", "scp_statements.csv"]
    print(f"== PTB-XL v{PTBXL_VERSION} download ==")
    try:
        for name in top_level:
            url = f"{BASE_URL}/{name}"
            status = download_file(url, raw_dir / name, auth)
            print(f"  {name}: {status}")

        db = pd.read_csv(raw_dir / "ptbxl_database.csv")
        # PTB-XL ships .dat + .hea file pairs (not .hdr)
        rel_paths = [f"{row}{ext}" for row in db["filename_lr"] for ext in (".dat", ".hea")]
        print(f"records100: {len(rel_paths)} files "
              f"({db['filename_lr'].nunique()} records x 2)")
        errors: list[str] = []
        counts = {"downloaded": 0, "skipped": 0}
        with tqdm(total=len(rel_paths), unit="file", desc="records100") as bar:
            with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
                futures = {
                    pool.submit(download_file, f"{BASE_URL}/{p}", raw_dir / p, auth): p
                    for p in rel_paths
                }
                for fut in concurrent.futures.as_completed(futures):
                    try:
                        counts[fut.result()] += 1
                    except PhysionetAuthError:
                        raise
                    except Exception as err:  # noqa: BLE001 - report all failures
                        errors.append(f"{futures[fut]}: {err}")
                    bar.update(1)
        if errors:
            print(f"\n{len(errors)} file(s) failed. First error:", file=sys.stderr)
            print(errors[0], file=sys.stderr)
            sys.exit(1)
        print(f"records100: {counts['downloaded']} downloaded, "
              f"{counts['skipped']} already present")
    except PhysionetAuthError as err:
        print(
            "\nPhysioNet rejected the request (401/403):\n  " + str(err)
            + "\n\nPTB-XL requires a free PhysioNet account for this access.\n"
            "  1. Create a free account: https://physionet.org/\n"
            "  2. Set PHYSIONET_USERNAME and PHYSIONET_PASSWORD\n"
            "  3. Re-run this script (existing files are skipped).",
            file=sys.stderr,
        )
        sys.exit(1)

    print("== building processed metadata ==")
    build_outputs(raw_dir, processed_dir)
    print("done.")


if __name__ == "__main__":
    main()
