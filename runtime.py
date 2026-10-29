"""
runtime.py
----------
Owns the trained models and the derived customer scores for ShopSmart Analytics.

The first call to get_runtime() generates the sample data if needed, trains all
six models, and computes the dashboard-wide customer scores. Later calls return
the same objects, so training happens once per process even when app.py is
imported by multiple page/API modules.
"""

import os
import threading

import generate_data
from ml_models import train_all, SVM_FEATURES, TREE_FEATURES, ANN_FEATURES

_lock = threading.Lock()
_runtime = None


def _customer_scores(M, D):
    """Run every customer through SVM, Decision Tree and ANN."""
    c = D["customers"].copy()
    c["svm_purchase"] = M["svm"].model.predict(c[SVM_FEATURES])
    c["promo_prob"] = M["tree"].model.predict_proba(c[TREE_FEATURES])[:, 1]
    c["ann_prob"] = M["ann"].predict_proba(c)
    return c


def _load_runtime():
    if not os.path.exists(os.path.join(generate_data.DATA_DIR, "customers.csv")):
        generate_data.main()

    print("Training models...")
    M = train_all()
    D = M["data"]
    SCORES = _customer_scores(M, D)
    print("Models ready.")
    return M, D, SCORES


def get_runtime():
    """Return (M, D, SCORES), training the models on first use."""
    global _runtime
    if _runtime is None:
        with _lock:
            if _runtime is None:
                _runtime = _load_runtime()
    return _runtime
