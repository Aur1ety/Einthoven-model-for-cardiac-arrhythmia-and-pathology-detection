# Einthoven

Physically grounded deep learning for cardiac pathology detection from ECG.

## Results

**Phase B: VCG-augmented vs. raw 12-lead, controlled comparison**

A controlled A/B test on PTB-XL's diagnostic superclass task (5 classes:
CD, HYP, MI, NORM, STTC; one-vs-rest macro AUC; test fold 10). Same
architecture, hyperparameters, seed value (42) and train/val/test split
in both runs. Only the input channels differ (12 or 15). Because the
first layer then has a different number of weights, the same seed does
not give matched initialisation, and each arm was trained once, so the
intervals below cover test-set sampling only, not run-to-run variation.

| Run | Channels | Test AUC | 90% CI |
|-----|---------:|---------:|--------|
| Spec 02, resnet1d_wang (single-sample) | 12 | 0.9293 | - |
| Spec 02, inception1d (single-sample) | 12 | 0.9219 | - |
| Phase B, control | 12 | 0.9301 | [0.9240, 0.9348] |
| Phase B, vcg_augmented | 15 | 0.9305 | [0.9247, 0.9355] |

Paired ΔAUC (VCG − control) = +0.00042 on the full test set. Over 100
paired bootstrap resamples the mean is +0.00055 and the 95% interval is
[−0.00216, +0.00305].
**The interval crosses zero.** The 3 derived Kors VCG channels add no
measurable diagnostic value on top of the 12 raw leads under this
architecture and protocol. Full results in
`output/phase_b/results_table.md` and the per-model `te_results.csv`
files.

**Einthoven-consistency audit, a standalone finding**

A systematic check of the limb-lead identities (Einthoven's law and
Goldberger's equations for aVR, aVL and aVF) across all 21,799 PTB-XL
records in the 100 Hz files. The audit file also carries each record's
Kors 1990 VCG means (coefficients verified against Jaros et al. 2019,
Table 2).

- **99.74%** of records are consistent to within the 5 µV tolerance
  (99.61% to within 1.5 µV). The leads are stored as whole microvolts,
  so Einthoven's residual takes whole-microvolt values and the augmented
  residuals multiples of 0.5 µV. Typical maxima are 1 to 1.5 µV;
  augmented maxima of 1.5 µV exceed what a single rounding produces, so
  the leads were probably rounded at more than one processing stage.
- Only **57 records (0.26%)** are flagged (any identity off by more
  than 5 µV at any sample). In 34 of them every break falls in the last
  0.1 s of the 10 s recording, and in 41 within the last second (both
  counts from `web/scripts/export_site_data.py`). Breaks are brief: the
  longest continuous break lasts 0.33 s, and the 7 records with 50 or
  more break samples spread them over 6 to 26 separate runs.
- Flags concentrate in paced recordings: 11 of the 57 are paced,
  against 291 of all 21,799 records (odds ratio 18).
- PTB-XL's own noise annotations show no detectable association with
  the audit flag (0.20% of annotated records flagged vs. 0.28% of
  unannotated records; odds ratio 0.71, 95% interval 0.32 to 1.43,
  p = 0.43).

This is a standalone, citable quality-control finding for anyone using
PTB-XL. The audit dataset (`einthoven_audit.csv`) and verified transform
coefficients (`vcg_kors_coefficients.json`) are released with this
repository. The residual columns in `einthoven_audit.csv` hold exact
values (maxima on the 0.5 µV grid). An earlier version carried
floating-point noise of up to 5 × 10⁻¹³ µV, which is enough to make
rank-based tests treat equal values as different.

**The 500 Hz files and a cross-rate check (paper in preparation)**

The same audit run on PTB-XL's 500 Hz files, and a comparison of the
two file sets:

- At 500 Hz only **9 records** are flagged, and just **3** of them are
  among the 57 flagged at 100 Hz. The two file sets flag mostly
  different records.
- Every 500 Hz file ends with its last 45 to 65 samples (about 0.1 s)
  held constant in all 12 leads. All breaks of the 34 end-of-recording
  records above fall inside this held end, so the two file sets cannot
  be compared there.
- Away from the recording ends, one fixed 241-tap linear filter maps
  the 500 Hz files onto the 100 Hz files to within 1 µV in 21,685 of
  the 21,736 records unflagged at both rates (with a constant 1.25 ms
  offset, half a sample at the original 400 Hz). Each file set can
  therefore check the other, lead by lead.
- That check shows which leads depart at the 100 Hz breaks, and it
  exposes 17 records that pass the identities at both rates but whose
  chest leads differ between the file sets by 1.1 to 43.8 mV. The
  identities cannot see these faults, because they test only the limb
  leads.
- One device group (AT-6 C) carries an identical 1.1 mV transient in
  lead V3 at the same instant (4.54 s) in five recordings from five
  patients, which cannot be physiological. Record 10565 holds a block of
  exactly 2,048 implausible samples in lead I of its 500 Hz file.
- Removing the 4 test records flagged at 100 Hz (the files the models
  use) changes test macro AUC by less than 0.0002. The flagged training records were kept, and the effect
  of the other faults on the benchmark was not tested. The faults matter
  most for work that relies on the relations between leads.

The files cannot show which processing step produced each fault.
Per-record results at both rates will be released with the paper.

## Motivation

Most deep learning approaches to multi-lead ECG classification treat
the 12 leads as a flat input tensor and let the model learn lead
relationships implicitly. Recent graph-based methods (PM2ECGCN,
MSAGFN) push this further by encoding lead topology as a graph. But
there is an older, physics-grounded alternative: the vectorcardiogram
(VCG), a 3D record of the heart's electrical vector that can be
reconstructed from 8 of the 12 leads with published regression
coefficients. This project tests whether
adding those 3 VCG-derived channels improves diagnostic classification,
or whether the model already extracts everything it needs from the raw
leads.

## Dataset

All experiments use PTB-XL v1.0.3 (Wagner et al. 2020), a 12-lead ECG
dataset of 21,799 records from 18,869 patients, recorded at 400 Hz and
stored at 500 Hz, with a downsampled 100 Hz copy. The models use the 100 Hz files; the audit
checks both. The official patient-stratified fold protocol is used
throughout:

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
This repository currently includes the verified 100 Hz audit dataset,
baseline reproduction code and the Phase B results; the 500 Hz and
cross-rate results will be released with the paper.

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
│   ├── baselines/                # Spec 02 baseline results (te_results.csv)
│   └── phase_b/                  # Phase B results (control + VCG-augmented)
├── tests/
├── requirements.txt
└── pyproject.toml
```

Note: the VCG-channel construction and Phase B training scripts are
intentionally not included in this repository, see "Implementation"
above.

## Website

`web/` is a static research site (React + Vite, no server): an **ECG
explorer** (100 test-fold PTB-XL ECGs, 20 per class drawn with a fixed
seed, drawn at 25 mm/s and 10 mm/mV next to the Phase B control model's
saved scores and the cardiologists' labels), a **3D heart-vector view**
for each of those ECGs (the Kors VCG loop, one beat at a time, rotatable,
with the three standard planes and a cursor linking it to the 12-lead
trace; drawn from the 500 Hz records), the **Einthoven audit**
(all four limb-lead identities, with the 57 flagged recordings and
their residual traces), the **results** (per-class ROC, the paired
VCG-vs-control interval) and a **method & limitations** page. No model
runs in the browser; the site shows the saved test-set predictions.

To rebuild the site's data, from the repository root:

```bash
python web/scripts/fetch_500hz.py        # the 500 Hz records for the 3D view, checked against PhysioNet's SHA256SUMS
python web/scripts/export_site_data.py   # writes web/public/data/
```

The export rebuilds the fold-10 label matrix from `ptbxl_database.csv` and asserts
it equals the stored `y_test.npy` (so every score sits on the right
ECG), asserts the macro AUCs against the stored results, and recomputes
the paired interval from the stored predictions and bootstrap resamples.
The audit page's 500 Hz paragraph, its noise-annotation odds ratio and
p-value, and the length of the 500 Hz held end are static text taken
from the paper draft. Only PTB-XL results are exported. The exported ECGs are PTB-XL data
(CC BY 4.0) and carry that attribution on the site.

```bash
cd web
npm install
npm run dev      # local preview
npm run check    # unit tests (geometry, data, audit identities) + build
```

Deploy: import the repository in Vercel with **root directory `web`**
(framework preset Vite, no environment variables).

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
