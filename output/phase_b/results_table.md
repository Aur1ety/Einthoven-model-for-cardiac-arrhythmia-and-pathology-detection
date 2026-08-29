# Phase B Results � VCG-Augmented Classifier (GPU)

Task: PTB-XL superdiagnostic, 5 classes (CD/HYP/MI/NORM/STTC), one-vs-rest macro AUC, test fold = 10
Architecture: resnet1d_wang (vendor repo, unmodified)
Hyperparameters: EPOCHS=50, BS=128, LR=1e-2, seed=42, bootstrap n=100
Hardware: 2× NVIDIA A30, cudnn.deterministic=True

| Run | Channels | Test AUC | CI | Note |
|-----|---------:|---------:|--------|------|
| Spec 02 � resnet1d_wang (12-ch, single-sample) | 12 | **0.9293** | � | baseline, no bootstrap CI |
| Spec 02 � inception1d (12-ch, single-sample) | 12 | **0.9219** | � | baseline, no bootstrap CI |
| Phase B � control | 12 | **0.9301** | [0.9240, 0.9348] | bootstrap n=100 |
| Phase B � vcg_augmented | 15 | **0.9305** | [0.9247, 0.9355] | bootstrap n=100 |

*CI = 5th/95th percentile of the 100-resample bootstrap AUC distribution (vendor convention from `scp_experiment.evaluate`), i.e. an approximate 90% CI. Conventional 95% CIs (2.5/97.5 percentile): control [0.9230, 0.9360], vcg_augmented [0.9230, 0.9365].

## Honest Interpretation

Paired delta (VCG - control) = +0.00055, 95% CI [-0.00216, +0.00305].

**No statistically significant difference** � the delta CI crosses 0.
The 3 derived Kors VCG channels add no measurable diagnostic value
on top of the 12 raw leads under this architecture and protocol.
