"""Export everything the Einthoven website shows to web/public/data/.

Nothing is re-trained or re-run. The site shows:
  - PTB-XL ECGs (records100: 100 Hz, 10 s, 12 leads) for a fixed, seeded sample of
    test-fold records plus every record the Einthoven audit flags;
  - the Phase B control model's SAVED test-set predictions
    (output/phase_b/control/models/fastai_resnet1d_wang/y_test_pred.npy), the same
    array the README's 0.9301 macro AUC is computed from;
  - result numbers read from the repo's own outputs, each re-derived here and
    asserted against the stored value, so the site cannot drift from the research.

Row alignment of the saved predictions is not assumed: the test-fold label matrix is
rebuilt from ptbxl_database.csv + scp_statements.csv exactly as the vendor code does
(compute_label_aggregations + select_data, superdiagnostic, min_samples=0, fold 10)
and asserted equal to the stored y_test.npy.

Data licence: PTB-XL is CC BY 4.0 (Wagner et al., Scientific Data 2020; PhysioNet).
The exported ECG files keep that licence and attribution.

Only results already published in this repository's README are exported.

Usage (from the repo root): python web/scripts/export_site_data.py
"""
import argparse
import ast
import json
import pickle
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.signal import butter, filtfilt, find_peaks
from sklearn.metrics import roc_auc_score, roc_curve

warnings.filterwarnings("ignore", category=UserWarning)  # sklearn version note when unpickling the label binarizer

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
PB = ROOT / "output" / "phase_b"
OUT = ROOT / "web" / "public" / "data"
CLASSES = ["CD", "HYP", "MI", "NORM", "STTC"]  # MultiLabelBinarizer order (sorted)
LEADS = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"]
PER_CLASS = 20  # explorer sample: 20 test records per class, seeded, no hand-picking
SEED = 0

load = lambda p: np.load(p, allow_pickle=True)  # the repo's own artefacts


def superdiagnostic_test_labels():
    db = pd.read_csv(RAW / "ptbxl_database.csv", index_col="ecg_id")
    db.scp_codes = db.scp_codes.apply(ast.literal_eval)
    agg = pd.read_csv(RAW / "scp_statements.csv", index_col=0)
    agg = agg[agg.diagnostic == 1.0]

    def classes(codes):
        out = []
        for key in codes:
            if key in agg.index:
                c = agg.loc[key].diagnostic_class
                if str(c) != "nan":
                    out.append(c)
        return sorted(set(out))

    db["superdiagnostic"] = db.scp_codes.apply(classes)
    kept = db[db.superdiagnostic.apply(len) > 0]  # select_data: min_samples=0 keeps every class
    test = kept[kept.strat_fold == 10]
    y = np.array([[int(c in labs) for c in CLASSES] for labs in test.superdiagnostic])
    return db, test, y


def read_record(filename, fs_expected=100):
    """WFDB format 16, gain 1000 adu/mV, baseline 0: each int16 is one microvolt."""
    base = RAW / filename
    header = (base.with_suffix(".hea")).read_text().splitlines()
    n_sig, fs, n = (int(float(x)) for x in header[0].split()[1:4])
    assert (n_sig, fs, n) == (12, fs_expected, fs_expected * 10), header[0]
    for line in header[1:13]:
        parts = line.split()
        assert parts[1] == "16" and parts[2].startswith("1000") and parts[4] == "0", line
    sig = np.fromfile(base.with_suffix(".dat"), dtype="<i2").reshape(n, 12)
    return sig.T  # 12 x (10 s x fs), microvolts


# Kors (1990) regression from 8 independent leads to the Frank X, Y, Z leads, as released
# in data/processed/vcg_kors_coefficients.json. In this convention +X points to the
# patient's left, +Y towards the feet and +Z towards the back.
KORS = json.loads((ROOT / "data" / "processed" / "vcg_kors_coefficients.json").read_text(encoding="utf-8"))
KORS_IDX = [0, 1, 6, 7, 8, 9, 10, 11]  # I, II, V1..V6 in the WFDB lead order
assert KORS["leads"] == ["I", "II", "V1", "V2", "V3", "V4", "V5", "V6"]
KORS_M = np.array([KORS["X"], KORS["Y"], KORS["Z"]])


def vcg(sig):
    return KORS_M @ sig[KORS_IDX].astype(float)  # 3 x samples, microvolts


def qrs_envelope(leads, fs):
    """How fast the leads move in the QRS band (5-20 Hz), averaged over 100 ms. The band
    leaves out baseline wander, most of the T wave and most muscle noise."""
    b, a = butter(2, (5, 20), btype="band", fs=fs)
    f = filtfilt(b, a, leads.astype(float), axis=1)
    speed = np.sqrt((np.gradient(f, axis=1) ** 2).sum(axis=0))
    k = int(0.1 * fs)
    return np.convolve(speed, np.ones(k) / k, mode="same")


def relative(env, fs):
    """The envelope as a fraction of a typical beat's peak in this record."""
    peaks, _ = find_peaks(env, distance=int(0.3 * fs))
    h = env[peaks]
    return env / np.median(h[h >= 0.3 * np.percentile(env, 95)])


def qrs_times(sig, xyz, fs):
    """A beat finder for display only (not clinical delineation). A heartbeat shows up in
    the limb leads (I, II) and in the chest leads (V1-V6) at the same moment; a loose
    electrode or a noise burst usually shows up in one group only. So a beat is a moment
    where BOTH groups move at least 0.3x as fast as their typical beat, at least 300 ms
    after the previous one. Its time is the middle of the QRS: the peak of the same
    envelope computed on the heart vector itself, within 50 ms."""
    both = np.minimum(relative(qrs_envelope(sig[[0, 1]], fs), fs), relative(qrs_envelope(sig[6:12], fs), fs))
    found, _ = find_peaks(both, height=0.3, distance=int(0.3 * fs))
    env, w = qrs_envelope(xyz, fs), int(0.05 * fs)
    mids = [max(0, p - w) + int(np.argmax(env[max(0, p - w):p + w + 1])) for p in found]
    return [round(p / fs, 3) for p in mids]


def noise_notes(r):
    """PTB-XL's own noise annotations for a record, tidied for display (they are terse and
    partly German: 'alles' = all leads, 'leicht' = slight)."""
    words = {"alles": "all leads", "leicht": "slight"}
    out = {}
    for col, name in [("burst_noise", "bursts"), ("static_noise", "steady noise"), ("baseline_drift", "baseline drift"), ("electrodes_problems", "electrode problems")]:
        if isinstance(r[col], str):
            parts = [words.get(t.strip().lower(), t.strip().upper().replace("AV", "aV")) for t in r[col].split(",") if t.strip()]
            # 'V1,2' means V1 and V2; 'I-aVF' means the leads from I to aVF
            parts = [f"V{p}" if p.isdigit() and i and parts[i - 1].startswith("V") else p.replace("-", " to ") for i, p in enumerate(parts)]
            if parts:
                out[name] = ", ".join(parts)
    return out


def roc_points(y, p, keep=120):
    fpr, tpr, _ = roc_curve(y, p)
    idx = np.unique(np.linspace(0, len(fpr) - 1, min(keep, len(fpr))).astype(int))
    return [[round(float(fpr[i]), 4), round(float(tpr[i]), 4)] for i in idx]


def main():
    argparse.ArgumentParser(description=__doc__.splitlines()[0]).parse_args()
    db, test, y_rebuilt = superdiagnostic_test_labels()
    y_test = load(PB / "control" / "data" / "y_test.npy").astype(int)
    assert np.array_equal(y_rebuilt, y_test), "rebuilt test labels do not match the stored y_test.npy"
    mlb = pickle.load(open(PB / "control" / "data" / "mlb.pkl", "rb"))
    assert list(mlb.classes_) == CLASSES, mlb.classes_

    pred = {run: load(PB / run / "models" / "fastai_resnet1d_wang" / "y_test_pred.npy").astype(float) for run in ["control", "vcg_augmented"]}
    stored = {run: pd.read_csv(PB / run / "models" / "fastai_resnet1d_wang" / "results" / "te_results.csv", index_col=0)["macro_auc"] for run in pred}
    macro = {run: roc_auc_score(y_test, p, average="macro") for run, p in pred.items()}
    for run in pred:
        assert abs(macro[run] - stored[run]["point"]) < 1e-9, (run, macro[run], stored[run]["point"])

    # paired bootstrap, same 100 resamples for both runs (as scripts/verify_phase_b.py)
    ids = load(PB / "control" / "test_bootstrap_ids.npy")
    assert np.array_equal(ids, load(PB / "vcg_augmented" / "test_bootstrap_ids.npy"))
    deltas = np.array([roc_auc_score(y_test[i], pred["vcg_augmented"][i], average="macro") - roc_auc_score(y_test[i], pred["control"][i], average="macro") for i in ids])
    ci95 = {}
    for run in pred:
        aucs = np.array([roc_auc_score(y_test[i], pred[run][i], average="macro") for i in ids])
        ci95[run] = [float(np.percentile(aucs, 2.5)), float(np.percentile(aucs, 97.5))]

    baselines = {}
    for name in ["fastai_resnet1d_wang", "fastai_inception1d"]:
        csv = ROOT / "output" / "baselines" / "baselines" / "models" / name / "results" / "te_results.csv"
        baselines[name] = float(pd.read_csv(csv, index_col=0)["macro_auc"]["point"])

    # --- audit ---
    audit = pd.read_csv(ROOT / "data" / "processed" / "einthoven_audit.csv").set_index("ecg_id")
    assert len(audit) == len(db) == 21799
    flagged = audit[audit.consistency_flag == 1]
    resid_cols = {"einthoven_residual_max": "II − (I + III)", "avr_residual_max": "aVR + (I + II)/2", "avl_residual_max": "aVL − (I − III)/2", "avf_residual_max": "aVF − (II + III)/2"}
    residual_stats = [
        {"identity": label, "mean": round(float(audit[col].mean()), 2), "median": round(float(audit[col].median()), 2), "p99": round(float(audit[col].quantile(0.99)), 2), "max": round(float(audit[col].max()), 1)}
        for col, label in resid_cols.items()
    ]
    # II - (I + III) is a whole number of microvolts, so whole-number bins are exact;
    # "over" means above the tolerance, as in the flag rule (> 5 uV)
    ein = audit.einthoven_residual_max.round().astype(int)
    assert (abs(audit.einthoven_residual_max - ein) < 1e-6).all()
    bins = [(0, 1), (2, 5), (6, 9), (10, 49), (50, 99), (100, 499), (500, 999), (1000, None)]
    tol = float(audit.identity_tolerance_uv.iloc[0])
    histogram = [
        {"label": f"{lo:,}+" if hi is None else f"{lo:,}–{hi:,}", "count": int(((ein >= lo) & ((ein <= hi) if hi is not None else True)).sum()), "over_tolerance": lo > tol}
        for lo, hi in bins
    ]
    assert sum(h["count"] for h in histogram) == len(audit)
    crosstab = pd.crosstab(audit.signal_quality, audit.consistency_flag)
    by_fold = audit.groupby("strat_fold").consistency_flag.agg(["count", "sum"]).reset_index()

    # --- explorer sample: PER_CLASS test records per class, seeded; a record is used once ---
    rng = np.random.default_rng(SEED)
    chosen = []
    for k, cls in enumerate(CLASSES):
        pool = [i for i in np.flatnonzero(y_test[:, k]) if i not in chosen]
        chosen += sorted(rng.choice(pool, size=PER_CLASS, replace=False).tolist())
    # share of the test ECGs with a strictly lower score for that class (never 100%)
    below = {c: np.array([(pred["control"][:, k] < v).mean() * 100 for v in pred["control"][:, k]]) for k, c in enumerate(CLASSES)}

    def meta(ecg_id):
        r = db.loc[ecg_id]
        a = audit.loc[ecg_id]
        age = None if pd.isna(r.age) else int(r.age)
        return {
            "id": int(ecg_id),
            "age": "90+" if age is not None and age >= 300 else age,  # PTB-XL codes ages over 89 as 300
            "sex": "female" if r.sex == 1 else "male",
            "labels": [c for c in CLASSES if c in r.superdiagnostic],
            "fold": int(r.strat_fold),
            "audit": {"flag": int(a.consistency_flag), **{f"{k}_max_uv": round(float(a[f"{k}_residual_max"]), 3) for k in ["einthoven", "avr", "avl", "avf"]}},
        }

    test_ids = test.index.to_numpy()
    cases = []
    for i in chosen:
        m = meta(test_ids[i])
        m["scores"] = {c: round(float(pred["control"][i, k]), 4) for k, c in enumerate(CLASSES)}
        m["percentile"] = {c: float(np.floor(below[c][i] * 10) / 10) for c in CLASSES}
        cases.append(m)
    flagged_cases = [meta(e) for e in flagged.index]

    missing = [m["id"] for m in cases if not all((RAW / db.loc[m["id"]].filename_hr).with_suffix(x).exists() for x in (".hea", ".dat"))]
    if missing:
        raise SystemExit(f"{len(missing)} of the 500 Hz records are missing; run: python web/scripts/fetch_500hz.py --ids {' '.join(map(str, missing))}")

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "ecg").mkdir(exist_ok=True)
    written = 0
    for m in cases + flagged_cases:
        sig = read_record(db.loc[m["id"]].filename_lr)
        (OUT / "ecg" / f"{m['id']}.json").write_text(json.dumps({"id": m["id"], "source": f"PTB-XL v1.0.3 record {db.loc[m['id']].filename_lr} (Wagner et al., Scientific Data 2020; https://doi.org/10.13026/kfzx-aw45), converted from WFDB to JSON", "licence": "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)", "fs": 100, "units": "uV", "leads": LEADS, "signal": sig.tolist()}, separators=(",", ":")))
        written += 1
        if m in cases:
            # the 3D heart-vector loop, from the 500 Hz version of the same record (web/scripts/fetch_500hz.py)
            hr = read_record(db.loc[m["id"]].filename_hr, fs_expected=500)
            xyz = vcg(hr)
            # guard against a lead-order slip: each axis from the 500 Hz record must match the SAME axis
            # from the 100 Hz record best, at the same scale. (They are not identical: PTB-XL made its
            # 100 Hz files with filtering; across the 100 explorer ECGs the two versions of one axis
            # correlate at 0.89-1.00 and their spreads differ by a factor of 0.95-1.12.)
            lo = vcg(sig)
            corr = np.corrcoef(np.vstack([xyz[:, ::5], lo]))[:3, 3:]
            assert (corr.argmax(axis=1) == [0, 1, 2]).all() and corr.diagonal().min() > 0.85, (m["id"], corr.round(3))
            gain = xyz[:, ::5].std(axis=1) / lo.std(axis=1)
            assert ((gain > 0.8) & (gain < 1.25)).all(), (m["id"], gain.round(3))
            beats = qrs_times(hr, xyz, 500)
            # moving each beat onto the heart-vector peak (up to 50 ms) must not bring two beats closer than 300 ms
            assert len(beats) < 2 or np.diff(beats).min() >= 0.3, (m["id"], beats)
            assert 3 <= len(beats) <= 35, (m["id"], len(beats))
            (OUT / "ecg" / f"{m['id']}.vcg.json").write_text(json.dumps({
                "id": m["id"],
                "source": f"PTB-XL v1.0.3 record {db.loc[m['id']].filename_hr} (500 Hz), Kors (1990) transform; CC BY 4.0",
                "fs": 500, "units": "uV", "axes": {"x": "+ to the left", "y": "+ to the feet", "z": "+ to the back"},
                "x": np.rint(xyz[0]).astype(int).tolist(), "y": np.rint(xyz[1]).astype(int).tolist(), "z": np.rint(xyz[2]).astype(int).tolist(),
                "qrs_s": beats,
            }, separators=(",", ":")))
            m["beats"] = len(beats)
            m["noise"] = noise_notes(db.loc[m["id"]])
        if m in flagged_cases:
            # where in the 10 s window the identities break (the audit tested no causes; this is location only)
            I, II, III, aVR, aVL, aVF = sig[:6].astype(float)
            res = np.abs(np.stack([II - (I + III), aVR + (I + II) / 2, aVL - (I - III) / 2, aVF - (II + III) / 2]))
            bad = np.flatnonzero((res > tol).any(axis=0))
            assert len(bad), m["id"]
            m["breaks"] = {"samples": int(len(bad)), "first_s": round(float(bad[0]) / 100, 2), "last_s": round(float(bad[-1]) / 100, 2)}

    edge = {
        "last_0_1_s": int(sum(m["breaks"]["first_s"] >= 9.9 for m in flagged_cases)),
        "last_1_s": int(sum(m["breaks"]["first_s"] >= 9.0 for m in flagged_cases)),
        "half_second_or_more": int(sum(m["breaks"]["samples"] >= 50 for m in flagged_cases)),
    }

    site = {
        "classes": CLASSES,
        "test": {"n": int(len(y_test)), "positives": {c: int(y_test[:, k].sum()) for k, c in enumerate(CLASSES)}},
        "results": {
            "control": {"macro_auc": macro["control"], "ci90": [float(stored["control"]["lower"]), float(stored["control"]["upper"])], "ci95": ci95["control"],
                        "per_class": {c: roc_auc_score(y_test[:, k], pred["control"][:, k]) for k, c in enumerate(CLASSES)},
                        "roc": {c: roc_points(y_test[:, k], pred["control"][:, k]) for k, c in enumerate(CLASSES)}},
            "vcg_augmented": {"macro_auc": macro["vcg_augmented"], "ci90": [float(stored["vcg_augmented"]["lower"]), float(stored["vcg_augmented"]["upper"])], "ci95": ci95["vcg_augmented"],
                              "per_class": {c: roc_auc_score(y_test[:, k], pred["vcg_augmented"][:, k]) for k, c in enumerate(CLASSES)}},
            "paired_delta": {"full_test": float(macro["vcg_augmented"] - macro["control"]), "mean": float(deltas.mean()), "ci95": [float(np.percentile(deltas, 2.5)), float(np.percentile(deltas, 97.5))], "resamples": int(len(ids)), "fraction_positive": float((deltas > 0).mean())},
            "baselines": baselines,
        },
        "audit": {
            "records": int(len(audit)), "patients": int(db.patient_id.nunique()), "flagged": int(len(flagged)), "tolerance_uv": float(audit.identity_tolerance_uv.iloc[0]), "where_flags_break": edge,
            "residual_stats": residual_stats,
            "histogram": histogram,
            "signal_quality": {"annotated_noisy": {"records": int(crosstab.loc[1].sum()), "flagged": int(crosstab.loc[1].get(1, 0))}, "not_annotated": {"records": int(crosstab.loc[0].sum()), "flagged": int(crosstab.loc[0].get(1, 0))}},
            "by_fold": [{"fold": int(r.strat_fold), "records": int(r["count"]), "flagged": int(r["sum"])} for _, r in by_fold.iterrows()],
        },
        "sample": {"rule": f"{PER_CLASS} test-fold records per class, drawn at random (numpy default_rng seed {SEED}); a record is used once. Not hand-picked.", "cases": cases},
        "flagged": flagged_cases,
        "sources": {
            "predictions": "output/phase_b/control/models/fastai_resnet1d_wang/y_test_pred.npy",
            "labels": "output/phase_b/control/data/y_test.npy (rebuilt from ptbxl_database.csv and asserted equal)",
            "audit": "data/processed/einthoven_audit.csv",
        },
        "kors": {"leads": KORS["leads"], "X": KORS["X"], "Y": KORS["Y"], "Z": KORS["Z"], "source": "data/processed/vcg_kors_coefficients.json"},
        "licence": "ECG data: PTB-XL v1.0.3, CC BY 4.0 (Wagner et al., Scientific Data 2020; PhysioNet).",
    }
    (OUT / "site.json").write_text(json.dumps(site, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"control macro AUC {macro['control']:.5f} (stored {stored['control']['point']:.5f}); vcg {macro['vcg_augmented']:.5f}")
    print(f"paired delta {deltas.mean():+.5f} 95% CI [{np.percentile(deltas, 2.5):+.5f}, {np.percentile(deltas, 97.5):+.5f}]")
    print(f"audit: {len(flagged)} of {len(audit)} flagged; explorer cases {len(cases)}; ECG files written {written}")


if __name__ == "__main__":
    main()
