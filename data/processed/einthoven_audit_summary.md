# Einthoven-Consistency Audit - Summary

Run date: 2026-08-29T13:07:39
Wall time: 2.7 minutes
Dataset: PTB-XL v1.0.3 (21799 records, 18869 unique patients,
12-lead, 100 Hz, 10 s windows, raw ADC values in uV)
Tolerance: 5.0 uV (PTB-XL 16-bit ADC, 1 uV/LSB; Wagner et al. 2020)

## 1. Identity Residual Statistics (uV)

Per-record max |residual| over the 1000-sample window, across all records.

| Identity | Mean | Median | p95 | p99 | Max |
|----------|-----:|-------:|----:|----:|----:|
| Einthoven (II - I - III) | 2.72 | 1.00 | 1.00 | 1.00 | 5872.00 |
| aVR + (I+II)/2 | 1.72 | 1.00 | 1.50 | 1.50 | 2200.50 |
| aVL - (I-III)/2 | 1.86 | 1.00 | 1.50 | 1.50 | 3043.00 |
| aVF - (II+III)/2 | 2.20 | 1.00 | 1.50 | 1.50 | 3047.50 |

## 2. Consistency Flag

- Records flagged: **57 / 21799 (0.26%)**
- Rule: ANY of the 4 identity residuals > 5.0 uV at ANY sample
- Note: a 10 s window contains ~5-12 QRS complexes; a max-over-window rule is
  therefore far stricter than a typical per-beat clinical check.

## 3. Crosstab: consistency_flag x signal_quality

signal_quality derived from ptbxl_database.csv (see script docstring).

| signal_quality \ consistency_flag | 0 | 1 | All |
|---|---:|---:|---:|
| 0 | 16742 | 47 | 16789 |
| 1 | 5000 | 10 | 5010 |

## 4. Per-Fold Breakdown

| Fold | Records | Flagged | Flag Rate |
|-----:|--------:|--------:|----------:|
| 1 | 2175 | 7 | 0.32% |
| 2 | 2181 | 11 | 0.50% |
| 3 | 2192 | 6 | 0.27% |
| 4 | 2174 | 5 | 0.23% |
| 5 | 2174 | 2 | 0.09% |
| 6 | 2173 | 3 | 0.14% |
| 7 | 2176 | 5 | 0.23% |
| 8 | 2173 | 5 | 0.23% |
| 9 | 2183 | 9 | 0.41% |
| 10 | 2198 | 4 | 0.18% |

## 5. VCG Magnitude Statistics (uV)

Per-record window means of the Kors 1990 regression projection; |.| is the
absolute value of that per-record mean (records have ~0 DC, so this measures
the typical baseline level, not QRS amplitude).

| Component | Mean(|.|) | Median(|.|) |
|-----------|---------:|------------:|
| vcg_x_mean | 3.3 | 1.9 |
| vcg_y_mean | 3.6 | 2.4 |
| vcg_z_mean | 2.7 | 1.5 |
## 6. Honest Findings

All numbers below are from this run (this dataset, this code, single pass).

- Per-identity share of records with max residual within 5.0 uV:
  Einthoven 99.8%, aVR 99.9%,
  aVL 99.9%, aVF 99.8%.
  The identity that exceeds the tolerance most often is
  **Einthoven (II - I - III)** (54 of 57 flagged records).
- The residuals sit at quantization scale for the overwhelming majority of
  records: median max-residual is 1.0 (Einthoven),
  1.0 (aVR), 1.0 (aVL),
  1.0 (aVF) uV - i.e. 1-1.5 LSB - and p99 is
  1.0, 1.5, 1.5,
  1.5 uV. Yet the maxima are large:
  5872 (Einthoven), 2200 (aVR),
  3043 (aVL), 3048 (aVF) uV.
  The distribution is therefore extremely right-tailed: ~99.8-99.9% of records
  are consistent to within 1-1.5 uV (ADC-quantization level), while a small
  number carry large-amplitude artifacts. No flags occur near the p99
  (1.0 uV <= 5.0 uV).
- 22 records have Einthoven max residual > 50 uV and 18 have some
  identity residual > 200 uV - plausible real-world artifacts (motion,
  electrode pop, lead disconnection), not an arithmetic error.
- Contrary to expectation, the PTB-XL noise annotations do NOT systematically
  predict the audit flag: 0.20% of annotated-noisy records are
  flagged vs 0.28% of unannotated records (10 of
  5010 noisy, 47 of 16789 clean). The
  annotations are per-lead human notes (drift/static/burst/electrode problems)
  while the audit is whole-window arithmetic on the limb-lead identities; the
  two only partially overlap.
- Per-fold flag rates range 0.09% (fold 5) to
  0.50% (fold 2) - folds are patient-stratified by the
  PTB-XL authors, so small differences reflect case-mix, not leakage.
- VCG window means cluster near 0 (Section 5), as expected for raw 10 s
  windows without DC removal. The Kors regression coefficients were verified
  against Jaros et al. 2019 (open access, Table 2), which reproduces the
  Kors 1990 values exactly; the primary 1990 paper is paywalled (OUP 403 for
  non-browser clients), so verification is via that secondary source only.
