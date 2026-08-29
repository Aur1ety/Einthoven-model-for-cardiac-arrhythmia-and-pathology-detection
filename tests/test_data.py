"""Data tests: PTB-XL fold protocol (config) + metadata integrity (once downloaded)."""

from pathlib import Path

import pandas as pd
import pytest
import yaml

ROOT = Path(__file__).resolve().parent.parent
METADATA = ROOT / "data" / "processed" / "metadata.csv"


def _config() -> dict:
    with open(ROOT / "configs" / "default.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def test_config_folds_disjoint_and_complete():
    cfg = _config()
    train = set(cfg["train_folds"])
    val = {cfg["val_fold"]}
    test = {cfg["test_fold"]}
    assert not (train & val) and not (train & test) and not (val & test)
    assert train | val | test == set(range(1, 11))


@pytest.mark.skipif(not METADATA.exists(), reason="run scripts/download_ptbxl.py first")
def test_metadata_patient_level_disjointness():
    df = pd.read_csv(METADATA)
    train_pts = set(df.loc[df.strat_fold.between(1, 8), "patient_id"])
    val_pts = set(df.loc[df.strat_fold == 9, "patient_id"])
    test_pts = set(df.loc[df.strat_fold == 10, "patient_id"])
    assert val_pts.isdisjoint(test_pts), "patient in both val and test"
    assert val_pts.isdisjoint(train_pts), "patient in both train and val"
    assert test_pts.isdisjoint(train_pts), "patient in both train and test"


@pytest.mark.skipif(not METADATA.exists(), reason="run scripts/download_ptbxl.py first")
def test_metadata_fold_values():
    df = pd.read_csv(METADATA)
    assert sorted(df.strat_fold.unique()) == list(range(1, 11))


@pytest.mark.skipif(not METADATA.exists(), reason="run scripts/download_ptbxl.py first")
def test_metadata_bakes_in_patient_id():
    df = pd.read_csv(METADATA)
    assert "patient_id" in df.columns
    assert df["patient_id"].notna().all()
