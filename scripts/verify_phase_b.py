"""
Phase B completion verification (AC1-AC9) on GPU-run outputs.

Run on the laptop: python scripts/verify_phase_b.py
Reads:
  data/processed/{control,vcg_augmented}/   (X/y/split data, local)
  output/phase_b/{control,vcg_augmented}/   (fetched from cluster)
Writes nothing except printing the AC report.
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

ROOT = Path(__file__).resolve().parents[1]
PROC = ROOT / "data" / "processed"
OUT = ROOT / "output" / "phase_b"
RUNS = ["control", "vcg_augmented"]
CLASSES = ["CD", "HYP", "MI", "NORM", "STTC"]

ok = []
fail = []


def check(name, cond, detail=""):
    tag = "PASS" if cond else "FAIL"
    (ok if cond else fail).append(name)
    print(f"[{tag}] {name}" + (f" — {detail}" if detail else ""))
    return cond


def macro_auc(y_true, y_pred, ids):
    yt = y_true[ids]
    yp = y_pred[ids]
    return float(roc_auc_score(yt, yp, average="macro"))


print("=" * 70)
print("Phase B GPU-output verification")
print("=" * 70)

# ---------------------------------------------------------------- AC1
print("\n--- AC1: data & split integrity ---")
# Data files are record-level (N, 1000, ch); the vendor pipeline chunks
# to 250-sample windows (stride 125) inside prepare(). Evaluation is
# aggregated back to record level (log: "aggregating predictions...").
shapes = {}
for run in RUNS:
    for split in ["train", "val", "test"]:
        X = np.load(str(PROC / run / f"X_{split}.npy"), mmap_mode="r")
        y = np.load(str(PROC / run / f"y_{split}.npy"), allow_pickle=True)
        shapes[(run, split)] = (X.shape, len(y))
        print(f"  {run:14s} {split}: X {X.shape}  y {len(y)}")

expected_records = {"train": 17084, "val": 2146, "test": 2158}
check("AC1 record counts 17084/2146/2158",
      all(shapes[(r, s)][1] == expected_records[s] for r in RUNS for s in expected_records))
check("AC1 channels 12 (control) / 15 (vcg)",
      shapes[("control", "test")][0][2] == 12 and shapes[("vcg_augmented", "test")][0][2] == 15)
check("AC1 record length 1000 samples @100 Hz (10 s)",
      all(shapes[(r, "test")][0][1] == 1000 for r in RUNS))

meta_c = pd.read_csv(PROC / "control" / "split_metadata.csv")
meta_v = pd.read_csv(PROC / "vcg_augmented" / "split_metadata.csv")
check("AC1 split_metadata identical across runs", meta_c.equals(meta_v))

# vendor split convention: train = fold <= 8, val = fold 9, test = fold 10
def fold_mask(name):
    return {"train": meta_c["strat_fold"] <= 8,
            "val": meta_c["strat_fold"] == 9,
            "test": meta_c["strat_fold"] == 10}[name]

n_pat = {s: meta_c.loc[fold_mask(s), "patient_id"].nunique() for s in ["train", "val", "test"]}
n_rec = {s: int(fold_mask(s).sum()) for s in ["train", "val", "test"]}
print(f"  patients per split: {n_pat}")
print(f"  records per split:  {n_rec}")
check("AC1 patient counts 14823/1917/1877 (post-filter)",
      n_pat == {"train": 14823, "val": 1917, "test": 1877})
check("AC1 record counts match data files", n_rec == expected_records)

tr = set(meta_c.loc[fold_mask("train"), "patient_id"])
va = set(meta_c.loc[fold_mask("val"), "patient_id"])
te = set(meta_c.loc[fold_mask("test"), "patient_id"])
check("AC1 no patient overlap across splits (leakage)",
      not (tr & va) and not (tr & te) and not (va & te))

# evaluation is record-level: output y_test must have len == test records
for run in RUNS:
    ytest_out = np.load(str(OUT / run / "data" / "y_test.npy"), allow_pickle=True)
    check(f"AC1 output y_test record-level len {expected_records['test']} ({run})",
          len(ytest_out) == expected_records["test"], f"len={len(ytest_out)}")

# Final task: 5-class superdiagnostic (CD/HYP/MI/NORM/STTC), one-vs-rest
# macro AUC. Vendor builds (N,5) multi-hot labels from scp_codes; the
# data-npy y is a binary pathology flag (1 = any CD/HYP/MI/STTC).
ytest_c = np.load(str(PROC / "control" / "y_test.npy"), allow_pickle=True)
ytest_v = np.load(str(PROC / "vcg_augmented" / "y_test.npy"), allow_pickle=True)
check("AC1 data-npy y is multi-hot 0/1 (N,5)",
      set(np.unique(ytest_c).tolist()) == {0, 1} and ytest_c.shape[1] == 5,
      f"shape {ytest_c.shape}")
check("AC1 y_test identical across runs (same split)", np.array_equal(ytest_c, ytest_v))

import pickle
mlb = pickle.load(open(OUT / "control/data/mlb.pkl", "rb"))
check("AC1 mlb classes_ = 5 superclasses",
      list(mlb.classes_) == CLASSES, str(list(mlb.classes_)))

y_out_te = np.load(str(OUT / "control/data/y_test.npy"), allow_pickle=True)
check("AC1 output y_test multi-hot (2158,5), every record has >=1 class",
      y_out_te.shape == (2158, 5) and np.all(y_out_te.sum(axis=1) >= 1),
      f"row sums: min={int(y_out_te.sum(axis=1).min())} max={int(y_out_te.sum(axis=1).max())}")
class_frac = y_out_te.mean(axis=0)
print(f"  class prevalence (test): "
      + ", ".join(f"{c}={v:.3f}" for c, v in zip(mlb.classes_, class_frac)))

# internal consistency: data-npy multi-hot must equal the vendor's
# output multi-hot exactly (same labels fed to training and evaluation)
check("AC1 data-npy multi-hot == vendor output multi-hot (test)",
      np.array_equal(np.asarray(ytest_c, dtype=int), np.asarray(y_out_te, dtype=int)),
      f"{int((np.asarray(ytest_c, dtype=int) == np.asarray(y_out_te, dtype=int)).all(axis=1).sum())}/2158 records")

# output y_test must match the training data y_test
for run in RUNS:
    ytest_out = np.load(str(OUT / run / "data" / "y_test.npy"), allow_pickle=True)
    ytest_dat = np.load(str(PROC / run / "y_test.npy"), allow_pickle=True)
    check(f"AC1 output y_test == data y_test ({run})", np.array_equal(ytest_out, ytest_dat))

# ---------------------------------------------------------------- AC2/AC3
print("\n--- AC2/AC3: artifacts present (both runs) ---")
required = [
    "models/fastai_resnet1d_wang/models/fastai_resnet1d_wang.pth",
    "models/fastai_resnet1d_wang/results/te_results.csv",
    "models/fastai_resnet1d_wang/y_train_pred.npy",
    "models/fastai_resnet1d_wang/y_val_pred.npy",
    "models/fastai_resnet1d_wang/y_test_pred.npy",
    "models/fastai_resnet1d_wang/losses.png",
    "models/fastai_resnet1d_wang/lr_find.png",
    "models/ensemble/results/te_results.csv",
    "models/naive/results/te_results.csv",
    "data/mlb.pkl",
    "data/standard_scaler.pkl",
    "test_bootstrap_ids.npy",
]
for run in RUNS:
    missing = [f for f in required if not (OUT / run / f).exists()]
    check(f"AC2/3 all artifacts present ({run})", not missing,
          f"missing: {missing}" if missing else f"{len(required)} files")
    pth = (OUT / run / "models/fastai_resnet1d_wang/models/fastai_resnet1d_wang.pth")
    check(f"AC2/3 model checkpoint non-empty ({run})", pth.stat().st_size > 1e6,
          f"{pth.stat().st_size/1e6:.1f} MB")

# ---------------------------------------------------------------- AC4
print("\n--- AC4: identical architecture & hyperparameters ---")
import torch

sd_c = torch.load(str(OUT / "control/models/fastai_resnet1d_wang/models/fastai_resnet1d_wang.pth"),
                  map_location="cpu", weights_only=False)
sd_v = torch.load(str(OUT / "vcg_augmented/models/fastai_resnet1d_wang/models/fastai_resnet1d_wang.pth"),
                  map_location="cpu", weights_only=False)

def keys(sd):
    if isinstance(sd, dict) and "model" in sd and isinstance(sd["model"], dict):
        sd = sd["model"]
    elif isinstance(sd, dict) and "state_dict" in sd:
        sd = sd["state_dict"]
    return {k: tuple(v.shape) for k, v in sd.items() if hasattr(v, "shape")}

kc, kv = keys(sd_c), keys(sd_v)
diff = {k: (kc.get(k), kv.get(k)) for k in set(kc) | set(kv) if kc.get(k) != kv.get(k)}
# Only the input conv may differ: in-channels 12 (control) vs 15 (vcg).
arch_ok = (len(diff) == 1 and "0.weight" in diff
           and diff["0.weight"][0] == (128, 12, 7) and diff["0.weight"][1] == (128, 15, 7))
check("AC4 identical arch (only input conv differs: 12 vs 15 ch)", arch_ok,
      f"differing tensors: {diff if diff else 'none'}; common: {len(set(kc) & set(kv))}")
n_params = sum(int(np.prod(v)) for v in kc.values())
print(f"  control model params: {n_params:,}")

# hyperparameters: both runs were launched from the same script (single
# source of constants); verify the constants in the script text.
import re
src = (ROOT / "scripts" / "run_phase_b.py").read_text()
consts = dict(re.findall(r"^(SEED|EPOCHS|BATCH_SIZE|LR|N_BOOTSTRAP)\s*=\s*(.+)$", src, re.M))
check("AC4 shared hyperparameters (single source in script)",
      consts.get("SEED") == "42" and consts.get("EPOCHS") == "50"
      and consts.get("BATCH_SIZE") == "128" and consts.get("LR") == "1e-2"
      and consts.get("N_BOOTSTRAP") == "100",
      str(consts))

# ---------------------------------------------------------------- AC5
print("\n--- AC5: VCG input construction ---")
XT_c = np.load(str(PROC / "control" / "X_test.npy"), mmap_mode="r")
XT_v = np.load(str(PROC / "vcg_augmented" / "X_test.npy"), mmap_mode="r")
raw_same = np.allclose(np.asarray(XT_c[:2000]), np.asarray(XT_v[:2000, :, :12]))
check("AC5 vcg channels 0:12 == control raw (test, 2000-chunk sample)", raw_same)
vcg3 = np.asarray(XT_v[:2000, :, 12:])
check("AC5 VCG channels 12:15 have signal (not degenerate)",
      float(vcg3.std()) > 1e-3, f"std={float(vcg3.std()):.4f}, min={float(vcg3.min()):.3f}, max={float(vcg3.max()):.3f}")
raw = np.asarray(XT_c[:2000])
novel = all(not np.allclose(vcg3[..., i], raw[..., j]) for i in range(3) for j in range(12))
check("AC5 VCG channels not duplicates of any raw channel", novel)

XT_tr_c = np.load(str(PROC / "control" / "X_train.npy"), mmap_mode="r")
XT_tr_v = np.load(str(PROC / "vcg_augmented" / "X_train.npy"), mmap_mode="r")
raw_same_tr = np.allclose(np.asarray(XT_tr_c[:500]), np.asarray(XT_tr_v[:500, :, :12]))
check("AC5 vcg raw slice == control (train, 500-chunk sample)", raw_same_tr)

# ---------------------------------------------------------------- AC6
print("\n--- AC6: bootstrap CIs (n=100) ---")
# Vendor CI convention (scp_experiment.evaluate): lower/upper = the 5th and
# 95th percentiles of the 100-resample AUC distribution (pandas quantile,
# linear interpolation) — NOT the conventional 2.5/97.5. Reproduce exactly,
# then also report the conventional 95% CI for the completion report.
res = {}
res_95 = {}
for run in RUNS:
    y_true = np.load(str(OUT / run / "data" / "y_test.npy"), allow_pickle=True)
    y_pred = np.load(str(OUT / run / "models/fastai_resnet1d_wang/y_test_pred.npy"), allow_pickle=True)
    ids = np.load(str(OUT / run / "test_bootstrap_ids.npy"), allow_pickle=True)
    aucs = np.array([macro_auc(y_true, y_pred, np.asarray(ids[i], dtype=int)) for i in range(len(ids))])
    point = float(roc_auc_score(y_true, y_pred, average="macro"))
    lo_v, hi_v = np.percentile(aucs, [5, 95])    # vendor convention (csv)
    lo95, hi95 = np.percentile(aucs, [2.5, 97.5])  # conventional 95% CI
    res[run] = (point, aucs.mean(), lo_v, hi_v)
    res_95[run] = (lo95, hi95)
    csv = pd.read_csv(OUT / run / "models/fastai_resnet1d_wang/results/te_results.csv", index_col=0)
    match = (abs(point - csv.loc["point", "macro_auc"]) < 1e-6
             and abs(aucs.mean() - csv.loc["mean", "macro_auc"]) < 1e-4
             and abs(lo_v - csv.loc["lower", "macro_auc"]) < 1e-4
             and abs(hi_v - csv.loc["upper", "macro_auc"]) < 1e-4)
    check(f"AC6 recomputed bootstrap matches te_results.csv ({run})", match,
          f"point {point:.5f} mean {aucs.mean():.5f} "
          f"vendor-CI {lo_v:.5f}-{hi_v:.5f} vs csv "
          f"{csv.loc['point','macro_auc']:.5f} {csv.loc['mean','macro_auc']:.5f} "
          f"{csv.loc['lower','macro_auc']:.5f}-{csv.loc['upper','macro_auc']:.5f}")
    print(f"  {run}: conventional 95% CI (2.5/97.5) [{lo95:.5f}, {hi95:.5f}]")

ids_c = np.load(str(OUT / "control/test_bootstrap_ids.npy"), allow_pickle=True)
ids_v = np.load(str(OUT / "vcg_augmented/test_bootstrap_ids.npy"), allow_pickle=True)
same_ids = all(np.array_equal(np.asarray(ids_c[i], dtype=int), np.asarray(ids_v[i], dtype=int))
               for i in range(100))
check("AC6 bootstrap resamples identical across runs (paired CIs)", same_ids, "100/100")

# ---------------------------------------------------------------- AC7
print("\n--- AC7: A/B comparison with paired delta ---")
pt_c, mu_c, lo_c, hi_c = res["control"]
pt_v, mu_v, lo_v, hi_v = res["vcg_augmented"]
delta = None
try:
    # rebuild per-resample aucs (ids identical, but recompute to be safe)
    y_true = np.load(str(OUT / "control/data/y_test.npy"), allow_pickle=True)
    yp_c = np.load(str(OUT / "control/models/fastai_resnet1d_wang/y_test_pred.npy"), allow_pickle=True)
    yp_v = np.load(str(OUT / "vcg_augmented/models/fastai_resnet1d_wang/y_test_pred.npy"), allow_pickle=True)
    ids = np.load(str(OUT / "control/test_bootstrap_ids.npy"), allow_pickle=True)
    d = np.array([macro_auc(y_true, yp_v, np.asarray(ids[i], dtype=int))
                  - macro_auc(y_true, yp_c, np.asarray(ids[i], dtype=int)) for i in range(100)])
    delta = d
    dmean, dlo, dhi = float(d.mean()), float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))
    frac_pos = float((d > 0).mean())
except Exception as e:
    dmean = dlo = dhi = float("nan")
    frac_pos = float("nan")
    print(f"  (paired delta skipped: {e})")

print(f"\n  control          AUC {pt_c:.5f}  vendor-CI(5/95) [{lo_c:.5f}, {hi_c:.5f}]  95%CI(2.5/97.5) [{res_95['control'][0]:.5f}, {res_95['control'][1]:.5f}]")
print(f"  vcg_augmented    AUC {pt_v:.5f}  vendor-CI(5/95) [{lo_v:.5f}, {hi_v:.5f}]  95%CI(2.5/97.5) [{res_95['vcg_augmented'][0]:.5f}, {res_95['vcg_augmented'][1]:.5f}]")
if delta is not None:
    print(f"  paired delta     {dmean:+.5f}  95% CI [{dlo:+.5f}, {dhi:+.5f}]  (frac>0: {frac_pos:.0%})")
    check("AC7 delta computed", True)
    verdict = ("VCG > control" if dlo > 0 else
               "control > VCG" if dhi < 0 else
               "no statistically significant difference (CI crosses 0)")
    print(f"  verdict: {verdict}")

# ---------------------------------------------------------------- AC8
print("\n--- AC8: results table ---")
# Inline the table generation (run_phase_b.write_results_table) to avoid
# pulling the full vendor import chain (wfdb) into this verifier.
N_BOOTSTRAP = 100
rows = [
    {"run": "Spec 02 — resnet1d_wang (12-ch, single-sample)", "channels": 12,
     "test_auc": 0.92932, "ci_lower": None, "ci_upper": None,
     "note": "baseline, no bootstrap CI"},
    {"run": "Spec 02 — inception1d (12-ch, single-sample)", "channels": 12,
     "test_auc": 0.92187, "ci_lower": None, "ci_upper": None,
     "note": "baseline, no bootstrap CI"},
]
for run_name in ["control", "vcg_augmented"]:
    df = pd.read_csv(OUT / run_name / "models/fastai_resnet1d_wang/results/te_results.csv",
                     index_col=0)
    rows.append({
        "run": f"Phase B — {run_name}",
        "channels": 12 if run_name == "control" else 15,
        "test_auc": float(df.loc['point', 'macro_auc']),
        "ci_lower": float(df.loc['lower', 'macro_auc']),
        "ci_upper": float(df.loc['upper', 'macro_auc']),
        "note": f"bootstrap n={N_BOOTSTRAP}",
    })

md = "# Phase B Results — VCG-Augmented Classifier (GPU)\n\n"
md += "Task: PTB-XL superdiagnostic, 5 classes (CD/HYP/MI/NORM/STTC), one-vs-rest macro AUC, test fold = 10\n"
md += "Architecture: resnet1d_wang (vendor repo, unmodified)\n"
md += "Hyperparameters: EPOCHS=50, BS=128, LR=1e-2, seed=42, bootstrap n=100\n"
md += "Hardware: node1 2x A30 (Option A: 1 job/GPU), cudnn.deterministic=True\n\n"
md += "| Run | Channels | Test AUC | CI | Note |\n"
md += "|-----|---------:|---------:|--------|------|\n"
for r in rows:
    ci = f"[{r['ci_lower']:.4f}, {r['ci_upper']:.4f}]" if r['ci_lower'] is not None else "—"
    md += f"| {r['run']} | {r['channels']} | **{r['test_auc']:.4f}** | {ci} | {r['note']} |\n"
md += ("\n*CI = 5th/95th percentile of the 100-resample bootstrap AUC distribution "
       "(vendor convention from `scp_experiment.evaluate`), i.e. an approximate "
       "90% CI. Conventional 95% CIs (2.5/97.5 percentile): "
       f"control [{res_95['control'][0]:.4f}, {res_95['control'][1]:.4f}], "
       f"vcg_augmented [{res_95['vcg_augmented'][0]:.4f}, {res_95['vcg_augmented'][1]:.4f}].\n")

md += "\n## Honest Interpretation\n\n"
ctrl = next(r for r in rows if r["run"] == "Phase B — control")
vcg = next(r for r in rows if r["run"] == "Phase B — vcg_augmented")
if delta is not None:
    md += (f"Paired delta (VCG - control) = {dmean:+.5f}, 95% CI [{dlo:+.5f}, {dhi:+.5f}].\n\n")
    if dlo > 0:
        md += "**VCG-augmented > Control** (delta CI excludes 0).\n"
    elif dhi < 0:
        md += "**VCG-augmented < Control** (delta CI excludes 0).\n"
    else:
        md += "**No statistically significant difference** — the delta CI crosses 0.\n"
        md += "The 3 derived Kors VCG channels add no measurable diagnostic value\n"
        md += "on top of the 12 raw leads under this architecture and protocol.\n"

with open(OUT / "results_table.md", "w") as f:
    f.write(md)
check("AC8 results_table.md generated", (OUT / "results_table.md").exists())
print("\n" + (OUT / "results_table.md").read_text())

# ---------------------------------------------------------------- AC9
print("--- AC9: comparison vs Spec 02 baselines ---")
spec02_resnet = 0.92932
spec02_incep = 0.92187
print(f"  Spec 02 resnet1d_wang (CPU): {spec02_resnet:.5f}")
print(f"  Phase B control (GPU)      : {pt_c:.5f}  (delta {pt_c - spec02_resnet:+.5f})")
print(f"  Phase B vcg (GPU)          : {pt_v:.5f}  (delta {pt_v - spec02_resnet:+.5f})")
check("AC9 Phase B control >= Spec 02 baseline (within noise)",
      pt_c >= spec02_resnet - 0.001)
print("  caveats: Spec 02 was CPU + no bootstrap CI; Phase B is GPU (cudnn.deterministic=True).")

# ---------------------------------------------------------------- summary
print("\n" + "=" * 70)
print(f"SUMMARY: {len(ok)} passed, {len(fail)} failed")
if fail:
    print("FAILED:")
    for f in fail:
        print(f"  - {f}")
    sys.exit(1)
print("ALL CHECKS PASSED")
