==============================================
PrivDoc-Pipeline — Privacy-Preserving Invoice
Processing Pipeline
CS 6349 Network Security | UT Dallas
Author: Indrani Borra
==============================================

PROJECT OVERVIEW
----------------
This project builds a privacy-preserving ML pipeline for AI-based financial
document (invoice) processing, defending against three attack surfaces:
(1) data breach via OCR plaintext exposure, (2) re-identification through
exact numerical fingerprinting, and (3) membership inference attacks on
trained ML models. Defenses include spaCy NER redaction, Laplace differential
privacy on inputs and model outputs, and empirical MIA auditing via shadow models.

DEPENDENCIES
------------
Install all required packages:

  pip install pandas numpy scikit-learn xgboost matplotlib pdfplumber spacy

  python -m spacy download en_core_web_sm

  # pytesseract (fallback OCR for scanned PDFs — optional):
  pip install pytesseract pdf2image Pillow
  # macOS:   brew install tesseract
  # Ubuntu:  sudo apt install tesseract-ocr

FOLDER STRUCTURE
----------------
PrivDoc-Pipeline/
├── data/
│   ├── data_generator.py              # Generates 800 synthetic labeled invoice records
│   ├── generated_invoices.csv         # Output: raw training dataset
│   ├── anonymized_invoices_eps0.1.csv # Output: Laplace-noised dataset at ε=0.1
│   ├── anonymized_invoices_eps0.5.csv # Output: Laplace-noised dataset at ε=0.5
│   ├── anonymized_invoices_eps1.0.csv # Output: Laplace-noised dataset at ε=1.0
│   ├── anonymized_invoices_eps5.0.csv # Output: Laplace-noised dataset at ε=5.0
│   └── raw_invoices/                  # Directory for raw PDF inputs (optional)
├── pipeline/
│   ├── ocr_extractor.py               # Stage 1: pdfplumber OCR → structured JSON
│   ├── ner_redactor.py                # Stage 2-3A: spaCy NER → PII token replacement
│   └── dp_anonymizer.py               # Stage 3B: Laplace noise on numerical fields
├── models/
│   ├── xgboost_baseline.py            # Experiment 1: XGBoost on raw data (no privacy)
│   └── xgboost_private.py             # Experiments 2-4: input-DP + NoisyXGBoostWrapper
├── attack/
│   ├── shadow_models.py               # Stage 5A: trains N shadow XGBoost models for MIA
│   └── attack_classifier.py           # Stage 5B: logistic regression MIA audit
├── experiments/
│   └── run_all.py                     # Full pipeline orchestration (all experiments)
├── results/                           # Auto-generated: JSON metrics + PNG figures
├── requirements.txt                   # Python dependency list
└── README.txt                         # This file

HOW TO RUN — FULL PIPELINE
---------------------------
All commands run from the PrivDoc-Pipeline/ directory.

Step 1: Generate synthetic dataset
  python data/data_generator.py
  Output: data/generated_invoices.csv (800 labeled records)

Step 2: Run all experiments
  python experiments/run_all.py
  Output: results/ folder with all figures and JSON

  Flags:
    --skip-data   Skip dataset generation (use existing CSV)
    --skip-ocr    Skip OCR/NER PDF processing step

Step 3: Run individual modules (optional)
  python pipeline/ocr_extractor.py <path/to/invoice.pdf>
  python pipeline/ner_redactor.py        # test NER redaction on sample text
  python pipeline/dp_anonymizer.py       # test Laplace DP (writes anonymized CSVs)
  python models/xgboost_baseline.py      # Experiment 1 only
  python models/xgboost_private.py       # Experiments 2-3 only
  python attack/attack_classifier.py     # MIA audit only

EXPERIMENTS
-----------
Experiment 1 — Baseline XGBoost on raw data
  No privacy protection. Establishes performance ceiling.
  Output: results/baseline_metrics.json

Experiment 2 — Input-level Laplace DP
  Laplace noise on numerical features at ε ∈ {0.1, 0.5, 1.0, 5.0}
  Defends Attack 2 (re-identification) but not Attack 3 (MIA).
  Finding: MIA AUC INCREASES at intermediate ε — known limitation
  of input perturbation (unique noise per record amplifies memorization).
  Output: results/private_metrics_eps{ε}.json

Experiment 3 — Output Perturbation DP (NoisyXGBoostWrapper)
  Laplace noise added to predict_proba() at inference time.
  Sensitivity = 2.0, noise_scale = 2 / ε
  Result: MIA AUC drops monotonically toward 0.5 as ε decreases.
  Output: results/output_dp_metrics_eps{ε}.json

Experiment 4 — Combined Defense (Input DP + Output DP)
  Both layers active simultaneously.
  Result: lowest MIA AUC across all ε values.
  Output: results/mia_results.json (combined section)

RESULTS
-------
Output files in results/:
  attack_vs_epsilon.png     — KEY FIGURE: MIA AUC vs ε for all 3
                              defense strategies. Shows input DP
                              going UP and output DP going DOWN.
  privacy_utility_curve.png — F1 score vs ε privacy-utility tradeoff
  combined_defense.png      — Bar chart at ε=0.5 comparing all
                              defense conditions (F1 vs MIA AUC)
  mia_results.json          — All numerical results structured as
                              {input_dp, output_dp, combined}

KEY FINDINGS
------------
1. Input-level Laplace DP (ε=0.5): MIA AUC = 0.6411
   — increases above baseline (0.5762). Input perturbation
   alone does NOT protect against MIA.

2. Output perturbation (ε=0.5): MIA AUC = 0.5181
   — near random guessing. Output DP successfully
   defeats the shadow model attack.

3. Combined defense (ε=0.5): MIA AUC = 0.5082
   — lowest across all conditions. Both attacks
   defended simultaneously.

PRIVACY BUDGET REFERENCE
------------------------
ε = 0.1  →  strongest privacy, lowest utility
ε = 0.5  →  recommended operating point (best privacy/utility balance)
ε = 1.0  →  moderate privacy
ε = 5.0  →  weak privacy, near-baseline utility

CONTACT
-------
Indrani Borra
University of Texas at Dallas
CS 6349 — Network Security
