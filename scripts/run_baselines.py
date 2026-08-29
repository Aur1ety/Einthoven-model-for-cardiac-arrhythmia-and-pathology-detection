"""Spec 02 - run the official PTB-XL benchmarking baselines.

Runs resnet1d_wang and inception1d on the diagnostic superclass task
('superdiagnostic') using the unmodified official framework and configs
from the vendored helme/ecg_ptbxl_benchmarking repo:

  - model configs: code/configs/fastai_configs.py
      conf_fastai_resnet1d_wang / conf_fastai_inception1d
      (parameters dict() -> the repo's official defaults:
       bs=128, wd=1e-2, epochs=50, lr=1e-2, kernel_size=5,
       loss=binary_cross_entropy, input_size=2.5 s @100 Hz,
       chunkify_train=False, chunkify_valid=True, aggregate_fn=max)
  - folds: the repo's official protocol, unchanged
      folds 1-8 train / fold 9 val / fold 10 test (patient-stratified)
  - evaluation: e.evaluate(bootstrap_eval=False) -> single whole-sample
      evaluation, written to models/<name>/results/te_results.csv

Data is the Spec 01 download under data/raw, exposed to the repo as
data/ptbxl (junction) because utils.load_dataset() requires the parent
folder to be named 'ptbxl'. No re-download; raw100.npy is cached by the
repo after the first load.

IMPORTANT (Windows): fastai's DataBunch uses a multi-process DataLoader
with the 'spawn' start method, so ALL work lives behind
`if __name__ == '__main__':`. Launch with `python -u` and redirect
stdout to a log; the run is long (50 epochs x 2 models on CPU) and must
not be interrupted.
"""
import sys
import traceback
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CODE = PROJECT_ROOT / "vendor" / "ecg_ptbxl_benchmarking" / "code"
sys.path.insert(0, str(CODE))


def _patch_torch_load():
    """Main-process-only (imported inside main(), NOT at module level, so
    spawned workers don't pay for torch via the main-module re-import).

    fastai 1.0.61 predates torch>=2.6, which defaults torch.load to
    weights_only=True and rejects fastai 1.x checkpoint round-trips.
    We only load checkpoints we wrote ourselves in this run, so restore
    the pre-2.6 default for this process (verified by smoke test).
    """
    import torch

    if getattr(torch.load, "_trusted_patched", False):
        return
    _orig = torch.load

    def _load_trusted(*args, **kwargs):
        kwargs.setdefault("weights_only", False)
        return _orig(*args, **kwargs)

    _load_trusted._trusted_patched = True
    torch.load = _load_trusted


def _cap_spawned_workers(n=4):
    """Library-level shims (repo untouched) for 31GB RAM + Windows spawn.

    1) fastai defaults to num_workers=defaults.cpus (8). Each spawn worker
       receives a full pickled copy of the 836MB train dataset plus its own
       torch+libs footprint (~3GB each) -> 8 workers exceed the commit limit,
       a child dies mid-bootstrap and the parent's pipe write fails with
       OSError [Errno 22]. Cap at n. num_workers does not change training
       math (same batches, same order).
    2) SCP_Experiment.evaluate() uses multiprocessing.Pool(20); each spawn
       worker re-imports the main module. Cap at n for the same reason.
    """
    import fastai.basic_data as _bd
    if not getattr(_bd.DataBunch.create, "_worker_capped", False):
        _orig_create = _bd.DataBunch.create.__func__

        def _create_capped(cls, *args, **kwargs):
            kwargs.setdefault("num_workers", n)
            return _orig_create(cls, *args, **kwargs)

        _create_capped._worker_capped = True
        _bd.DataBunch.create = classmethod(_create_capped)

    import multiprocessing as _mp
    if not getattr(_mp, "_pool_capped", False):
        _orig_pool = _mp.Pool

        class _CappedPool:
            # multiprocessing.Pool is a factory function (not a class),
            # so delegate instead of subclass.
            def __init__(self, processes=None, *args, **kwargs):
                size = min(processes, n) if processes else n
                self._pool = _orig_pool(size, *args, **kwargs)

            def __getattr__(self, item):
                return getattr(self._pool, item)

        _mp.Pool = _CappedPool
        _mp._pool_capped = True


def main():
    datafolder = (PROJECT_ROOT / "data" / "ptbxl").as_posix() + "/"
    outputfolder = (PROJECT_ROOT / "output" / "baselines").as_posix() + "/"

    from experiments.scp_experiment import SCP_Experiment
    from configs.fastai_configs import conf_fastai_resnet1d_wang, conf_fastai_inception1d

    models = [conf_fastai_resnet1d_wang, conf_fastai_inception1d]

    e = SCP_Experiment(
        "baselines", "superdiagnostic", datafolder, outputfolder,
        models, sampling_frequency=100,
    )

    cache = Path(datafolder) / "raw100.npy"
    print(f"[run_baselines] datafolder={datafolder}", flush=True)
    print(f"[run_baselines] outputfolder={outputfolder}", flush=True)
    print(f"[run_baselines] raw100.npy cache: "
          f"{'present (reuse)' if cache.exists() else 'will be built on first load'}",
          flush=True)

    print("[run_baselines] prepare() ...", flush=True)
    e.prepare()
    print(f"[run_baselines] prepare() done: train={len(e.X_train)} "
          f"val={len(e.X_val)} test={len(e.X_test)} n_classes={e.n_classes}",
          flush=True)

    print("[run_baselines] perform() (50 epochs x 2 models, CPU) ...", flush=True)
    _patch_torch_load()
    _cap_spawned_workers(4)
    e.perform()
    print("[run_baselines] perform() done", flush=True)

    print("[run_baselines] evaluate(bootstrap_eval=False) ...", flush=True)
    e.evaluate(bootstrap_eval=False)
    print("[run_baselines] evaluate() done", flush=True)

    # surface the headline numbers
    import pandas as pd
    base = Path(outputfolder) / "baselines" / "models"
    for m in ["fastai_resnet1d_wang", "fastai_inception1d", "ensemble", "naive"]:
        csv = base / m / "results" / "te_results.csv"
        if csv.exists():
            df = pd.read_csv(csv, index_col=0)
            print(f"[run_baselines] {m}: macro_auc point="
                  f"{df.loc['point']['macro_auc']:.5f} "
                  f"90%CI [{df.loc['lower']['macro_auc']:.5f}, "
                  f"{df.loc['upper']['macro_auc']:.5f}]", flush=True)
    print("[run_baselines] ALL DONE", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)
