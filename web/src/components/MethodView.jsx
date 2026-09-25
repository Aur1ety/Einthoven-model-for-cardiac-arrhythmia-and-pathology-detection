import { fmt } from '../lib/data'

const REPO = 'https://github.com/Aur1ety/Einthoven-model-for-cardiac-arrhythmia-and-pathology-detection'

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="t-title">{title}</h2>
      {children}
    </section>
  )
}

export default function MethodView({ site }) {
  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-2">
        <h1 className="t-display">Method &amp; limitations</h1>
        <p className="t-body text-muted-foreground">
          A research project, not a medical device. Nothing here should be used to diagnose anyone. No cardiologist or clinician
          has reviewed this site.
        </p>
      </header>

      <Section title="Data">
        <p className="t-body">
          PTB-XL v1.0.3: {fmt(site.audit.records)} 10-second, 12-lead ECGs from {fmt(site.audit.patients)} patients, recorded in
          Germany between 1989 and 1996 and labelled by cardiologists. The site uses the 100 Hz version. The dataset’s own
          patient-level folds are used as published: folds 1–8 train, fold 9 tune, fold 10 test.
        </p>
      </Section>

      <Section title="Model and task">
        <p className="t-body">
          A 1-D ResNet (<code>resnet1d_wang</code>) from the PTB-XL benchmark code, unmodified, trained to score five diagnostic
          superclasses: conduction disturbance (CD), hypertrophy (HYP), myocardial infarction (MI), normal ECG (NORM) and ST/T
          change (STTC). This is diagnosis at a coarse level; it is not rhythm or arrhythmia detection, despite the repository’s
          name.
        </p>
      </Section>

      <Section title="What this site shows, and how it is kept honest">
        <ul className="list-disc pl-5 space-y-1.5 t-body">
          <li>
            The explorer shows the model’s <strong>saved</strong> predictions from the test run. No model runs in your browser.
            The ECGs shown were chosen by a fixed rule, not by hand: {site.sample.rule}
          </li>
          <li>
            When the site’s data is exported (<code>web/scripts/export_site_data.py</code>, run before each deploy, not by the
            web host), it rebuilds the test-set rows in the benchmark code’s order from the raw PTB-XL files and checks their
            labels match the saved ones exactly, so each saved score is shown next to its own ECG. It recomputes the macro AUCs
            from the saved predictions and checks them against the stored results, and recomputes the per-class AUCs and the
            paired interval; the 90% intervals and baselines are read from the stored result files.
          </li>
          <li>Scores are uncalibrated model outputs, not probabilities of disease.</li>
          <li>
            The audit view recomputes all four limb-lead identities in your browser from the same samples the audit used; a test
            checks they reproduce the audit file’s values.
          </li>
        </ul>
      </Section>

      <Section title="Limitations">
        <ul className="list-disc pl-5 space-y-1.5 t-body">
          <li>
            One dataset, one country, recordings from 1989–1996. Performance on ECGs from other hospitals and devices is not shown
            here and should not be assumed to match.
          </li>
          <li>Five broad classes only; PTB-XL has far finer diagnostic statements that this model does not predict.</li>
          <li>The test fold is used once for the reported numbers; the explorer shows a sample of it, not all of it.</li>
          <li>
            The vectorcardiogram experiment is a null result for this architecture: the extra channels gave no measurable gain. Each
            arm was trained once, so training-run variation is not in the interval.
          </li>
        </ul>
      </Section>

      <Section title="Sources and licences">
        <ul className="list-disc pl-5 space-y-1.5 t-body">
          <li>
            Wagner P, Strodthoff N, Bousseljot R-D, et al. PTB-XL, a large publicly available electrocardiography dataset.{' '}
            <em>Scientific Data</em> 7, 154 (2020). Data: <a href="https://physionet.org/content/ptb-xl/1.0.3/">PTB-XL v1.0.3 on
            PhysioNet</a> (<a href="https://doi.org/10.13026/kfzx-aw45">doi:10.13026/kfzx-aw45</a>), licensed{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. This site shows a subset of the records, converted
            from WFDB to JSON; they keep that licence, and each file names its source record.
          </li>
          <li>
            Strodthoff N, Wagner P, Schaeffter T, Samek W. Deep learning for ECG analysis: benchmarks and insights from PTB-XL.{' '}
            <em>IEEE Journal of Biomedical and Health Informatics</em> 25(5), 2021 (model and training code).
          </li>
          <li>Kors JA et al. Reconstruction of the Frank vectorcardiogram from standard electrocardiographic leads. <em>European Heart Journal</em> 11, 1990.</li>
          <li>
            Code, results and the audit file: <a href={REPO}>the Einthoven repository on GitHub</a>.
          </li>
        </ul>
      </Section>
    </div>
  )
}
