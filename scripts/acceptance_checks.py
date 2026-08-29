"""Spec 02 - acceptance criteria checks (AC1-AC7).

Run with the project venv:  python scripts/acceptance_checks.py
AC1-AC5 and AC6 are data/framework checks (runnable immediately).
AC7 (AUC plausibility) passes only once run_baselines.py has written
te_results.csv; until then it is reported as PENDING.

Deviation note: the repo's utils.load_dataset() requires the data folder's
PARENT to be named 'ptbxl' and forward-slash paths (utils.py:117), so AC3
uses the data/ptbxl junction (-> data/raw) instead of data/raw directly.
Same data, one junction, no repo modification.
"""
import glob
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CODE = PROJECT_ROOT / "vendor" / "ecg_ptbxl_benchmarking" / "code"
sys.path.insert(0, str(CODE))

PTBXL = (PROJECT_ROOT / "data" / "ptbxl").as_posix() + "/"
FAILURES = []


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        FAILURES.append(name)


def main():
    import pandas as pd

    # AC1: model files present in the vendored repo
    models_dir = CODE / "models"
    listing = sorted(p.name for p in models_dir.iterdir() if p.is_file())
    print(f"AC1 models dir listing: {listing}")
    needed = {"basic_conv1d.py", "fastai_model.py", "inception1d.py",
              "resnet1d.py", "timeseries_utils.py"}
    check("AC1 required model files present",
          needed <= set(listing), f"missing: {sorted(needed - set(listing))}")

    # AC2: official experiment class imports
    from experiments.scp_experiment import SCP_Experiment  # noqa: F401
    check("AC2 SCP_Experiment import", True)

    # AC3: full dataset loads at the new location
    from utils import utils
    X, raw_labels = utils.load_dataset(PTBXL, 100)
    print(f"AC3 records={X.shape[0]} per-record shape={X[0].shape}")
    check("AC3 record count 21799", X.shape[0] == 21799, f"got {X.shape[0]}")
    check("AC3 per-record shape (1000, 12)", X[0].shape == (1000, 12),
          f"got {X[0].shape}")

    # AC4: label aggregation flags exactly 411 unlabeled records
    # (empty superdiagnostic list; one-hotting happens later in select_data)
    labels = utils.compute_label_aggregations(raw_labels, PTBXL, "superdiagnostic")
    empty = int((labels["superdiagnostic_len"] == 0).sum())
    from collections import Counter
    cls_counts = Counter(c for lst in labels["superdiagnostic"] for c in lst)
    print(f"AC4 total={len(labels)} empty-superclass={empty} "
          f"class counts={dict(sorted(cls_counts.items()))}")
    check("AC4 exactly 411 empty superdiagnostic labels", empty == 411,
          f"got {empty}")
    check("AC4 21799 label rows", len(labels) == 21799, f"got {len(labels)}")

    # AC5: no patient spans multiple splits
    db = pd.read_csv(PROJECT_ROOT / "data" / "raw" / "ptbxl_database.csv",
                     usecols=["ecg_id", "patient_id"])
    pid = db.set_index("ecg_id").patient_id
    tr = set(pid.loc[labels.index[labels.strat_fold <= 8]])
    va = set(pid.loc[labels.index[labels.strat_fold == 9]])
    te = set(pid.loc[labels.index[labels.strat_fold == 10]])
    check("AC5 no patient in train&val", len(tr & va) == 0, f"overlap={len(tr & va)}")
    check("AC5 no patient in train&test", len(tr & te) == 0, f"overlap={len(tr & te)}")
    check("AC5 no patient in val&test", len(va & te) == 0, f"overlap={len(va & te)}")
    print(f"AC5 patients: train={len(tr)} val={len(va)} test={len(te)}")

    # AC6: te_results.csv files exist under output/baselines
    csvs = glob.glob(str(PROJECT_ROOT / "output" / "baselines" / "**" / "te_results.csv"),
                     recursive=True)
    print(f"AC6 te_results.csv found ({len(csvs)}):")
    for c in csvs:
        print("   ", os.path.relpath(c, PROJECT_ROOT))
    check("AC6 te_results.csv present", len(csvs) >= 4,
          f"expected >=4 (resnet, inception, ensemble, naive), got {len(csvs)}")

    # AC7: test macro-AUC in plausible band [0.80, 0.99]
    ok = True
    detail = []
    for m in ["fastai_resnet1d_wang", "fastai_inception1d"]:
        p = PROJECT_ROOT / "output" / "baselines" / "baselines" / "models" / m / "results" / "te_results.csv"
        if not p.exists():
            print(f"AC7 PENDING {m}: te_results.csv not written yet")
            continue
        df = pd.read_csv(p, index_col=0)
        auc = float(df.loc["point", "macro_auc"])
        detail.append(f"{m} macro_auc={auc:.5f}")
        ok = ok and 0.80 <= auc <= 0.99
    if detail:
        check("AC7 macro_auc in [0.80, 0.99]", ok, "; ".join(detail))
    else:
        print("AC7 PENDING: no model results written yet")

    print()
    if FAILURES:
        print("ACCEPTANCE: FAIL ->", FAILURES)
        return 1
    print("ACCEPTANCE: PASS (AC7 pending if not yet run)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
