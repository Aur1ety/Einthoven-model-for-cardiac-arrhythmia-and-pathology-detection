# Einthoven

Physically grounded deep learning for cardiac pathology detection from ECG.

## Results

**Phase B: VCG-augmented vs. raw 12-lead, controlled comparison**

A controlled A/B test on PTB-XL's diagnostic superclass task (5 classes:
CD, HYP, MI, NORM, STTC; one-vs-rest macro AUC; test fold 10). Identical
architecture, hyperparameters, random seed, and train/val/test split
between the two runs. Only the input channels differ.

| Run | Channels | Test AUC | 90% CI |
|-----|---------:|---------:|--------|
| Spec 02, resnet1d_wang (single-sample) | 12 | 0.9293 | - |
| Spec 02, inception1d (single-sample) | 12 | 0.9219 | - |
| Phase B, control | 12 | 0.9301 | [0.9240, 0.9348] |
| Phase B, vcg_augmented | 15 | 0.9305 | [0.9247, 0.9355] |

Paired ΔAUC (VCG − control) = +0.00055, 95% CI [−0.00216, +0.00305].
**The CI crosses zero.** The 3 derived Kors VCG channels add no
measurable diagnostic value on top of the 12 raw leads under this
architecture and protocol. Full results in
`output/phase_b/results_table.md` and the per-model `te_results.csv`
files.

**Einthoven-consistency audit, a standalone finding**

A systematic check of the limb-lead identities (Einthoven's triangle,
aVR, aVL, aVF) across all 21,799 PTB-XL records, using the Kors 1990
regression coefficients (verified against Jaros et al. 2019, Table 2).

- **99.74%** of records are consistent to within 1–1.5 µV (ADC
  quantization level)
- Only **57 records (0.26%)** are flagged, all with heavy-tailed
  artifacts (motion, electrode pop, lead disconnection), not
  arithmetic errors
- PTB-XL's own noise annotations do **not** predict the audit flag
  (0.20% of annotated-noisy records flagged vs. 0.28% of unannotated
  records), the two appear to capture different failure modes

This is a standalone, citable quality-control finding for anyone using
PTB-XL. The audit dataset (`einthoven_audit.csv`) and verified transform
coefficients (`vcg_kors_coefficients.json`) are released with this
repository.

## Motivation

Most deep learning approaches to multi-lead ECG classification treat
the 12 leads as a flat input tensor and let the model learn lead
relationships implicitly. Recent graph-based methods (PM2ECGCN,
MSAGFN) push this further by encoding lead topology as a graph. But
there is an older, physics-grounded alternative: the vectorcardiogram
(VCG), which reconstructs a 3D cardiac vector from the same 12 leads
using published regression coefficients. This project tests whether
adding those 3 VCG-derived channels improves diagnostic classification,
or whether the model already extracts everything it needs from the raw
leads.

## Dataset

All experiments use PTB-XL v1.0.3 (Wagner et al. 2020), a 12-lead ECG
dataset of 21,799 records from 18,869 patients at 100 Hz. The official
patient-stratified fold protocol is used throughout:

- Folds 1–8: train
- Fold 9: validation
- Fold 10: test

No `train_test_split`, random splitting, or custom ratios. Every
dataframe carries a `patient_id` column, and patient-disjoint splits
are verified before training. The benchmarking baselines are
reproduced from Strodthoff et al. (2020) using the official
`helme/ecg_ptbxl_benchmarking` reference implementation.

## Implementation

The full training pipeline and physically grounded input construction
method are described in an accompanying paper currently in
preparation. Implementation code will be released upon publication.
This repository currently includes the verified audit dataset, baseline
reproduction code, and full experimental results for transparency and
reproducibility of the reported findings.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

To reproduce the baselines, clone the reference implementation separately:

```bash
git clone https://github.com/helme/ecg_ptbxl_benchmarking.git vendor/ecg_ptbxl_benchmarking
```

To download PTB-XL and build the processed metadata:

```bash
python scripts/download_ptbxl.py
```

To run the baseline benchmark (reproduces Spec 02 results):

```bash
python scripts/run_baselines.py
```

## Project structure

```
Einthoven/
├── configs/default.yaml          # fold config, runtime parameters
├── scripts/
│   ├── download_ptbxl.py         # data acquisition + metadata build
│   ├── run_baselines.py          # Spec 02 baseline reproduction
│   ├── verify_phase_b.py         # acceptance-criteria verifier
│   ├── verify_folds.py           # fold integrity checks
│   └── acceptance_checks.py      # acceptance criteria runner
├── data/
│   ├── raw/                      # PTB-XL (gitignored, re-downloadable)
│   └── processed/                # audit outputs, VCG coefficients
├── output/
│   ├── baselines/                # Spec 02 trained models + results
│   └── phase_b/                  # Phase B results (control + VCG-augmented)
├── tests/
├── requirements.txt
└── pyproject.toml
```

Note: the VCG-channel construction and Phase B training scripts are
intentionally not included in this repository, see "Implementation"
above.

## Citation

If you use the Einthoven audit dataset or VCG coefficients, please cite:

- **Einthoven audit and VCG comparison**: This repository.
  https://github.com/Aur1ety/Einthoven-model-for-cardiac-arrhythmia-and-pathology-detection
- **PTB-XL dataset**: Wagner P, Strodthoff N, Bousseljot RD, et al.
  (2020). PTB-XL, a large publicly available electrocardiography
  dataset. *Scientific Data* 7:154.
  https://doi.org/10.1038/s41597-020-0495-6
- **Benchmarking baselines**: Strodthoff N, Wagner P, Schaeffter T, et
  al. (2020). Deep learning for ECG analysis: benchmarks and insights
  from PTB-XL. https://github.com/helme/ecg_ptbxl_benchmarking /
  arXiv:2004.13701
- **Kors VCG transform**: Kors JA, van Herpen G, Sittig AC, van Bemmel
  JH (1990). Reconstruction of the Frank vectorcardiogram from
  standard electrocardiographic leads: diagnostic comparison of
  different methods. *European Heart Journal* 11(12):1083–1092.
  https://doi.org/10.1093/oxfordjournals.eurheartj.a059647
- **Kors coefficient verification**: Jaros R, Martinek R, Danys L
  (2019). Comparison of different electrocardiography with
  vectorcardiography transformations. *Sensors* 19(14):3072.
  https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6678609/

## License

All rights reserved. License to be finalized upon publication.
