# Phase B — Completion Report (VCG-Augmented Classifier, GPU run)

Date: 2026-08-29 (IST) · Hardware: node1 2× NVIDIA A30 24 GB (intelunnati cluster)
Verdict: **VCG augmentation shows no statistically significant effect** (paired ΔAUC +0.00055, 95% CI [−0.00216, +0.00305]).

## 1. Task

Controlled A/B of the vendor `resnet1d_wang` 1-D CNN on PTB-XL superdiagnostic
(5 classes CD/HYP/MI/NORM/STTC, one-vs-rest macro AUC, test fold 10):

- **control** — 12 raw leads (1000 samples @ 100 Hz)
- **vcg_augmented** — 15 channels = same 12 raw + 3 Kors VCG leads

Identical architecture, hyperparameters, seed (42) and split in both runs;
only the input channels differ. Bootstrap CIs, n=100 (identical resamples in
both runs → paired comparison).

## 2. Environment verification (migration spec, step 1)

| Item | Finding |
|---|---|
| Scheduler | PBS/Torque 23.06 on master (10.233.123.199, ZeroTier); workq free at launch; 1 harmless stuck job (parag, 10 GPUs, Oct 2024) |
| node1 | 2× A30 24 GB, interconnect **SYS** (NUMA 0/1, no NVLink), driver 580.95.05 (CUDA 13.0), 56 pcpus, 128 GB RAM, /scratch 871 GB local SSD |
| Python env | conda `ecgpb` (clone of `train`, py3.11.15) + fastai 1.0.61, wfdb 4.3.1, scikit-learn 1.9.0, scikit-image, setuptools 80.10.2 (<81 required for pkg_resources), **torch 2.6.0+cu124**, `cuda_available=True`, `device_count=2` |
| GPU occupancy | vLLM (qwen-27b-fp8, TP2, serves this opencode session) held 21.5 GB/GPU |
| Data transfer | 2,891 MB tar laptop→node1, SHA256 `7f9a0731…5dcab` verified on both sides |

## 3. GPU strategy — Option A (one job per GPU, no DataParallel)

- control → GPU 0 (`CUDA_VISIBLE_DEVICES=0`), vcg_augmented → GPU 1
- **Deviation:** PBS submission failed with `qsub: Bad UID for job execution`
  as both root and unnati (NIS UID-mapping drift after the July remediation).
  Jobs were therefore launched **directly on node1** with `setsid`
  (verified free before launch; no other compute jobs in queue). Same
  one-job-per-GPU isolation as Option A, just unscheduled.
- **Co-location with vLLM:** user restarted vLLM to keep the session alive;
  training co-located (smoke test proved +~0.7 GB fits under vLLM's
  21.5 GB at gpu-memory-utilization 0.92). vLLM is idle except while
  generating, so compute contention was negligible.

## 4. Determinism

`torch.backends.cudnn.deterministic = True` and `benchmark = False` set in
`set_seed()` (run_phase_b.py:114-115); random/numpy/torch/cuda RNGs +
fastai `set_seed(42)` locked before each run.

## 5. Wall times (actual vs estimate)

| Run | Start (IST) | End (IST) | Wall time |
|---|---|---|---|
| control | 20:12:30 | 20:17:50 | **5 min 20 s** (0.089 h) |
| vcg_augmented | 20:12:30 | 20:18:15 | **5 min 45 s** (0.096 h) |

Includes data load, lr-find, 50 epochs, aggregation and bootstrap eval.
The laptop CPU estimate was ~10 h/run → **~100–110× speedup** (both runs
complete in <6 min of GPU wall time, ~4 s/epoch).

GPU utilization (node1, t+75 s after launch, vLLM running concurrently):
`GPU 0: 22263 MiB, 31 %` · `GPU 1: 22263 MiB, 24 %` (≈0.7 GB + 24–31 % is
the training share). Smoke-test `nvidia-smi dmon` showed 11–48 % util and
+712 MiB during fit.

## 6. Results

| Run | Channels | Test AUC | CI* | Note |
|-----|---------:|---------:|-----|------|
| Spec 02 — resnet1d_wang (12-ch) | 12 | 0.92932 | — | baseline, CPU, no bootstrap CI |
| Spec 02 — inception1d (12-ch) | 12 | 0.92187 | — | baseline, CPU, no bootstrap CI |
| **Phase B — control** | 12 | **0.93009** | [0.9240, 0.9348] | bootstrap n=100, GPU |
| **Phase B — vcg_augmented** | 15 | **0.93051** | [0.9247, 0.9355] | bootstrap n=100, GPU |

\* Vendor CI convention: 5th/95th percentile of the bootstrap AUC
distribution (≈90 % CI). Conventional 95 % CIs (2.5/97.5):
control [0.9230, 0.9360], vcg_augmented [0.9230, 0.9365].

Point estimates per split (5-class macro AUC):

| Run | Train | Val | Test |
|---|---:|---:|---:|
| control | 0.97748 | 0.93068 | 0.93009 |
| vcg_augmented | 0.97742 | 0.93219 | 0.93051 |

**Paired comparison** (identical 100 bootstrap resamples):
ΔAUC (VCG − control) = **+0.00055**, 95 % CI **[−0.00216, +0.00305]**,
68 % of resamples positive. The CI crosses zero → **no statistically
significant difference**. The 3 derived Kors VCG channels add no measurable
diagnostic value on top of the 12 raw leads under this architecture and
protocol. The slight positive point estimate is within noise (n=2158 test
records, n=100 resamples).

## 7. Acceptance criteria — re-verified on GPU outputs (step 6)

`scripts/verify_phase_b.py` → **32/32 checks PASS** (run 2026-08-29, laptop,
on the fetched GPU outputs; SHA256-verified transfer).

- **AC1 data/split integrity** — PASS: records 17084/2146/2158,
  patients 14823/1917/1877 (post-filter), fold ≤8/9/10 split convention,
  zero patient overlap across splits, split_metadata byte-identical across
  runs, multi-hot labels (N,5) over the 5 superclasses consistent
  data-npy ↔ vendor output (2158/2158 test records), class prevalence
  NORM 44.6 %, MI 25.5 %, STTC 24.1 %, CD 23.0 %, HYP 12.1 %.
- **AC2 control artifacts** — PASS: 12/12 files (checkpoint 5.7 MB,
  te_results.csv, per-split preds, losses/lr-find plots, ensembler, scalers).
- **AC3 vcg artifacts** — PASS: 12/12 files (checkpoint 5.8 MB).
- **AC4 identical config** — PASS: all 68 tensors identical in name and
  shape except `0.weight` (128×12×7 → 128×15×7, the intended input-channel
  change); identical hyperparameters and random seed across both runs.
- **AC5 VCG construction** — PASS: vcg channels 0:12 byte-identical to
  control raw (test + train samples), channels 12:15 non-degenerate
  (std 0.986) and not duplicates of any raw channel.
- **AC6 bootstrap** — PASS: recomputed 100-resample distribution reproduces
  te_results.csv exactly (point/mean/lower/upper) for both runs; resamples
  identical across runs (paired).
- **AC7 A/B comparison** — PASS: paired Δ +0.00055, CI crosses 0
  (interpretation above).
- **AC8 results table** — PASS: `output/phase_b/results_table.md` generated.
- **AC9 baselines** — PASS: control 0.93009 ≥ Spec 02 CPU 0.92932
  (Δ +0.00077, within noise); hardware caveat noted (Spec 02 = CPU).

## 8. Deviations

1. **CPU → 2× A30** — user-approved migration spec (this report).
2. **cudnn.deterministic=True / benchmark=False** — required by migration spec.
3. **PBS → direct setsid launch** — `Bad UID for job execution` (both root
   and unnati); node verified free before launch.
4. **Co-located with vLLM** — user preference (keep session alive); memory
   fits, contention negligible (vLLM idle while training).
5. **Bootstrap pre-generation** — vendor bug (first run crashes without
   `test_bootstrap_ids.npy`); seeded with 42, written to both runs so
   resamples are identical (paired CIs).
6. **torch.load weights_only shim + worker cap 4** — fastai 1.0.61 on
   torch ≥2.6; same shims as Spec 02.
7. **Vendor CI convention** is 5/95 percentiles (≈90 % CI); conventional
   95 % CIs reported alongside.
8. **Spec 02 baseline rows were CPU** — hardware caveat on that comparison.

## 9. Artifacts

Local machine:
- `output/phase_b/{control,vcg_augmented}/…` — full run artifacts
  (fetched from node1, tar SHA256 `bf0c2fd6…e97e` verified)
- `output/phase_b/results_table.md` — comparison table
- `output/phase_b/phaseb_{control,vcg}.log` — full GPU run logs
- `scripts/verify_phase_b.py` — the 32-check AC verifier (rerunnable)
- `PHASEB_GPU_STATUS.md` — handover/status doc

Cluster (GPU compute node):
- `ecg-arrhythmia/` — project + outputs, training logs,
  conda env `ecgpb`
