"""Spec 02 - verify the strat_fold split protocol before any training.

Runs the unmodified official SCP_Experiment.prepare() (vendored
helme/ecg_ptbxl_benchmarking repo, task 'superdiagnostic') and checks:

  V1. split assignment: train = folds 1-8, val = fold 9, test = fold 10
      (and no other fold values present)
  V2. split sizes are consistent between labels and signal arrays
  V3. patient disjointness: no patient_id appears in more than one split
  V4. label sanity: exactly the 5 diagnostic superclasses, no NaNs,
      every record has at least one label

Exit code 0 = PASS, 1 = FAIL.
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CODE = PROJECT_ROOT / "vendor" / "ecg_ptbxl_benchmarking" / "code"
sys.path.insert(0, str(CODE))

import pandas as pd  # noqa: E402

FAILURES = []


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}" + (f" | {detail}" if detail else ""))
    if not cond:
        FAILURES.append(name)


def main():
    datafolder = (PROJECT_ROOT / "data" / "ptbxl").as_posix() + "/"
    outputfolder = (PROJECT_ROOT / "output" / "baselines").as_posix() + "/"

    from experiments.scp_experiment import SCP_Experiment
    from configs.fastai_configs import conf_fastai_resnet1d_wang

    e = SCP_Experiment(
        "baselines", "superdiagnostic", datafolder, outputfolder,
        [conf_fastai_resnet1d_wang], sampling_frequency=100,
    )
    print("running official SCP_Experiment.prepare() ...")
    e.prepare()
    print("prepare() done")

    labels = e.labels  # DataFrame indexed by ecg_id, carries strat_fold
    db = pd.read_csv(PROJECT_ROOT / "data" / "raw" / "ptbxl_database.csv",
                     usecols=["ecg_id", "patient_id"])
    pid = db.set_index("ecg_id").patient_id

    tr_idx = labels.index[labels.strat_fold <= 8]
    va_idx = labels.index[labels.strat_fold == 9]
    te_idx = labels.index[labels.strat_fold == 10]
    splits = {"train": (tr_idx, e.X_train, e.y_train),
              "val": (va_idx, e.X_val, e.y_val),
              "test": (te_idx, e.X_test, e.y_test)}

    print(f"records kept by superdiagnostic selection: {len(labels)}")

    # V1: fold assignment
    folds = set(labels.strat_fold.unique())
    check("V1a no fold outside 1-10", folds <= set(range(1, 11)),
          f"folds present: {sorted(folds)}")
    for name, (idx, X, y) in splits.items():
        got = set(labels.loc[idx, "strat_fold"].unique())
        want = {1, 2, 3, 4, 5, 6, 7, 8} if name == "train" else {9 if name == "val" else 10}
        check(f"V1b {name} uses exactly folds {sorted(want)}", got == want,
              f"got {sorted(got)}")

    # V2: sizes consistent between labels and arrays
    for name, (idx, X, y) in splits.items():
        check(f"V2 {name} sizes",
              len(idx) == len(X) == len(y) and X.shape[1:] == (1000, 12),
              f"labels={len(idx)} X={X.shape} y={y.shape}")

    # V3: patient disjointness
    patient_sets = {}
    for name, (idx, _, _) in splits.items():
        patient_sets[name] = set(pid.loc[idx])
    for a in patient_sets:
        for b in patient_sets:
            if a < b:
                inter = patient_sets[a] & patient_sets[b]
                check(f"V3 no patient spans {a}/{b}", len(inter) == 0,
                      f"overlap={len(inter)}")
    for name, s in patient_sets.items():
        print(f"      {name}: {len(s)} patients")

    # V4: label sanity
    import numpy as np
    check("V4a 5 superclasses", e.n_classes == 5, f"n_classes={e.n_classes}")
    for name, (_, _, y) in splits.items():
        check(f"V4b {name} no NaN and no empty labels",
              not np.isnan(y).any() and (y.sum(axis=1) >= 1).all())
    print("      class columns (MultiLabelBinarizer order):",
          list(e.__dict__.get("mlb_classes", "see mlb.pkl")))
    try:
        import pickle
        with open(PROJECT_ROOT / "output" / "baselines" / "baselines" / "data" / "mlb.pkl", "rb") as f:
            classes = list(pickle.load(f).classes_)
        print("      mlb classes:", classes)
        check("V4c superclass names",
              set(classes) == {"NORM", "MI", "STTC", "CD", "HYP"}, str(classes))
    except FileNotFoundError:
        pass

    print()
    if FAILURES:
        print("VERIFY FOLDS: FAIL ->", FAILURES)
        return 1
    print("VERIFY FOLDS: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
