import base64
import csv
import os

csv.field_size_limit(10 * 1024 * 1024)

from flask import Flask, jsonify, request
from flask_cors import CORS

import numpy as np
from Pyfhel import Pyfhel, PyCtxt

app = Flask(__name__)
CORS(app)

DATA_DIR        = os.path.join(os.path.dirname(__file__), "data")
CONTEXT_PATH    = os.path.join(DATA_DIR, "context.bin")
PUBLIC_KEY_PATH = os.path.join(DATA_DIR, "public_key.bin")
RELIN_KEY_PATH  = os.path.join(DATA_DIR, "relin_key.bin")
CSV_PATH        = os.path.join(DATA_DIR, "patients_encrypted.csv")

NUMERICAL_FIELDS = [
    "weight", "height", "bmi",
    "waist_circumference", "hip_circumference",
    "upper_leg_length", "upper_arm_length",
]

PLAINTEXT_FIELDS = ["exam_id", "patient_id", "name", "gender", "exam_date"]
CSV_FIELDNAMES   = PLAINTEXT_FIELDS + [f"{f}_enc" for f in NUMERICAL_FIELDS]


def _load_he() -> Pyfhel:
    HE = Pyfhel()
    HE.load_context(CONTEXT_PATH)
    HE.load_public_key(PUBLIC_KEY_PATH)
    HE.load_relin_key(RELIN_KEY_PATH)
    return HE


def _load_rows() -> list[dict]:
    if not os.path.exists(CSV_PATH):
        return []
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _save_rows(rows: list[dict]):
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)


def _enc_sum_and_sumsq(HE: Pyfhel, field: str, rows: list[dict]):
    enc_key = f"{field}_enc"
    ciphers = [
        PyCtxt(pyfhel=HE, bytestring=base64.b64decode(r[enc_key]))
        for r in rows if r.get(enc_key)
    ]

    if not ciphers:
        return None, None, 0

    enc_sum = ciphers[0]
    for c in ciphers[1:]:
        enc_sum = enc_sum + c

    squares = []
    for c in ciphers:
        sq = c * c
        HE.relinearize(sq)
        HE.rescale_to_next(sq)
        squares.append(sq)

    enc_sum_sq = squares[0]
    for sq in squares[1:]:
        enc_sum_sq = enc_sum_sq + sq

    return enc_sum, enc_sum_sq, len(ciphers)


@app.route("/health", methods=["GET"])
def health():
    ok = (
        os.path.exists(CONTEXT_PATH)
        and os.path.exists(PUBLIC_KEY_PATH)
        and os.path.exists(CSV_PATH)
    )
    return jsonify({"status": "ok" if ok else "not_ready", "data_ready": ok})


@app.route("/patients", methods=["GET"])
def list_patients():
    rows = _load_rows()
    seen: dict[str, dict] = {}
    for r in rows:
        pid = r.get("patient_id", "")
        if pid not in seen:
            seen[pid] = {
                "patient_id":     pid,
                "name":           r.get("name", ""),
                "gender":         r.get("gender", ""),
                "exam_count":     0,
                "last_exam_date": "",
            }
        seen[pid]["exam_count"] += 1
        d = r.get("exam_date", "")
        if d > seen[pid]["last_exam_date"]:
            seen[pid]["last_exam_date"] = d
    return jsonify(sorted(seen.values(), key=lambda x: x["patient_id"]))


@app.route("/patients/<patient_id>", methods=["GET"])
def get_patient(patient_id):
    rows = _load_rows()
    for r in rows:
        if r.get("patient_id") == patient_id:
            return jsonify({
                "patient_id": patient_id,
                "name":   r.get("name", ""),
                "gender": r.get("gender", ""),
            })
    return jsonify({"error": "Nie znaleziono pacjenta"}), 404


@app.route("/patients/<patient_id>", methods=["DELETE"])
def delete_patient(patient_id):
    rows = _load_rows()
    filtered = [r for r in rows if r.get("patient_id") != patient_id]
    if len(filtered) == len(rows):
        return jsonify({"error": "Nie znaleziono pacjenta"}), 404
    _save_rows(filtered)
    return jsonify({"message": "Pacjent i wszystkie badania usuniete"})


@app.route("/patients/<patient_id>/examinations", methods=["GET"])
def get_patient_examinations(patient_id):
    rows = _load_rows()
    exams = [r for r in rows if r.get("patient_id") == patient_id]
    return jsonify(exams)


@app.route("/examinations", methods=["GET"])
def list_examinations():
    return jsonify(_load_rows())


@app.route("/examinations", methods=["POST"])
def add_examination():
    data = request.get_json(force=True)
    rows = _load_rows()

    if any(r.get("exam_id") == data.get("exam_id") for r in rows):
        return jsonify({"error": "Identyfikator badania juz istnieje"}), 409

    rows.append(data)
    _save_rows(rows)
    return jsonify({"message": "Badanie dodane"}), 201


@app.route("/examinations/<exam_id>", methods=["DELETE"])
def delete_examination(exam_id):
    rows = _load_rows()
    filtered = [r for r in rows if r.get("exam_id") != exam_id]
    if len(filtered) == len(rows):
        return jsonify({"error": "Nie znaleziono badania"}), 404
    _save_rows(filtered)
    return jsonify({"message": "Badanie usuniete"})


@app.route("/compute/statistics", methods=["POST"])
def compute_statistics():
    body  = request.get_json(force=True)
    field = body.get("field")
    if field not in NUMERICAL_FIELDS:
        return jsonify({"error": "Nieznane pole"}), 400

    HE   = _load_he()
    rows = _load_rows()

    enc_sum, enc_sum_sq, n = _enc_sum_and_sumsq(HE, field, rows)
    if n == 0:
        return jsonify({"error": "Brak danych dla tego pola"}), 404

    return jsonify({
        "count":      n,
        "enc_sum":    base64.b64encode(enc_sum.to_bytes()).decode(),
        "enc_sum_sq": base64.b64encode(enc_sum_sq.to_bytes()).decode(),
    })


@app.route("/compute/compare", methods=["POST"])
def compute_compare():
    body  = request.get_json(force=True)
    field = body.get("field")
    if field not in NUMERICAL_FIELDS:
        return jsonify({"error": "Nieznane pole"}), 400

    HE   = _load_he()
    rows = _load_rows()

    enc_sum, enc_sum_sq, n = _enc_sum_and_sumsq(HE, field, rows)
    if n == 0:
        return jsonify({"error": "Brak danych dla tego pola"}), 404

    return jsonify({
        "count":      n,
        "enc_sum":    base64.b64encode(enc_sum.to_bytes()).decode(),
        "enc_sum_sq": base64.b64encode(enc_sum_sq.to_bytes()).decode(),
    })


@app.route("/compute/batch_statistics", methods=["POST"])
def compute_batch_statistics():
    body    = request.get_json(force=True)
    fields  = body.get("fields", NUMERICAL_FIELDS)
    invalid = [f for f in fields if f not in NUMERICAL_FIELDS]
    if invalid:
        return jsonify({"error": f"Nieznane pola: {invalid}"}), 400

    HE   = _load_he()
    rows = _load_rows()

    results = {}
    for field in fields:
        enc_sum, enc_sum_sq, n = _enc_sum_and_sumsq(HE, field, rows)
        if n > 0:
            results[field] = {
                "count":      n,
                "enc_sum":    base64.b64encode(enc_sum.to_bytes()).decode(),
                "enc_sum_sq": base64.b64encode(enc_sum_sq.to_bytes()).decode(),
            }

    return jsonify(results)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=False)
