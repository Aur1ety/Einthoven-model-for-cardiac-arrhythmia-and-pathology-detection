"""Scaffold verification: layout, pins, gitignore, config."""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent

REQUIRED_DIRS = [
    "src/data",
    "src/preprocessing",
    "src/models",
    "src/training",
    "src/evaluation",
    "scripts",
    "tests",
    "configs",
    "data/raw",
    "data/processed",
    "notebooks",
    "staging",
]

REQUIRED_CONFIG_KEYS = {
    "data_dir",
    "sample_rate",
    "patient_id_col",
    "train_folds",
    "val_fold",
    "test_fold",
}


def test_required_directories_exist():
    missing = [d for d in REQUIRED_DIRS if not (ROOT / d).is_dir()]
    assert not missing, f"missing directories: {missing}"


def test_requirements_exist_and_are_pinned():
    req = ROOT / "requirements.txt"
    assert req.is_file(), "requirements.txt is missing"
    for line in req.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        assert "==" in stripped, f"unpinned requirement: {stripped}"


def test_gitignore_excludes_data_dirs_and_artifacts():
    gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    for entry in ("data/raw/", "data/processed/", "*.pt", "*.ckpt",
                  "__pycache__/", ".ipynb_checkpoints/"):
        assert entry in gitignore, f".gitignore missing entry: {entry}"


def test_default_yaml_is_valid_and_complete():
    cfg = yaml.safe_load((ROOT / "configs" / "default.yaml").read_text(encoding="utf-8"))
    assert isinstance(cfg, dict), "default.yaml did not parse to a mapping"
    missing = REQUIRED_CONFIG_KEYS - set(cfg)
    assert not missing, f"default.yaml missing keys: {sorted(missing)}"
    # fold-based protocol: custom splitting is forbidden
    assert "split_ratios" not in cfg, "split_ratios must not be used (PTB-XL folds only)"
    assert "split_seed" not in cfg, "split_seed must not be used (PTB-XL folds only)"
    assert cfg["train_folds"] == [1, 2, 3, 4, 5, 6, 7, 8]
    assert cfg["val_fold"] == 9
    assert cfg["test_fold"] == 10


def test_readme_documents_patient_level_split():
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "patient-level" in readme
    assert "PTB-XL" in readme
    assert "strat_fold" in readme
