"""
Backend lekarza — posiada klucz tajny, szyfruje dane wejściowe
i odszyfrowuje wyniki zwrócone przez serwer obliczeniowy.
Port: 5001
"""
import base64
import math
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone, date

from functools import wraps

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    import jwt
except ImportError:
    print("Błąd: pip install PyJWT")
    sys.exit(1)

try:
    import tenseal as ts
except ImportError:
    print("Błąd: pip install tenseal")
    sys.exit(1)

app = Flask(__name__)
CORS(app)

JWT_SECRET  = "he_medical_jwt_secret_change_in_production"
COMPUTE_URL = os.environ.get("COMPUTE_SERVER_URL", "http://localhost:5002")
KEYS_DIR    = os.path.join(os.path.dirname(__file__), "keys")
SECRET_CONTEXT_PATH = os.path.join(KEYS_DIR, "secret_context.bin")

NUMERICAL_FIELDS = [
    "age", "blood_pressure_sys", "blood_pressure_dia",
    "heart_rate", "glucose", "cholesterol", "bmi",
    "hemoglobin", "creatinine", "wbc", "rbc",
]

FIELD_META = {
    "age":                 {"label": "Wiek",                     "unit": "lata",    "normal": [18, 100]},
    "blood_pressure_sys":  {"label": "Ciśnienie skurczowe",      "unit": "mmHg",    "normal": [90, 140]},
    "blood_pressure_dia":  {"label": "Ciśnienie rozkurczowe",    "unit": "mmHg",    "normal": [60, 90]},
    "heart_rate":          {"label": "Tętno",                    "unit": "bpm",     "normal": [60, 100]},
    "glucose":             {"label": "Glukoza (na czczo)",       "unit": "mg/dL",   "normal": [70, 100]},
    "cholesterol":         {"label": "Cholesterol całkowity",    "unit": "mg/dL",   "normal": [0, 200]},
    "bmi":                 {"label": "BMI",                      "unit": "kg/m²",   "normal": [18.5, 25]},
    "hemoglobin":          {"label": "Hemoglobina",              "unit": "g/dL",    "normal": [12, 17.5]},
    "creatinine":          {"label": "Kreatynina",               "unit": "mg/dL",   "normal": [0.6, 1.2]},
    "wbc":                 {"label": "Leukocyty (WBC)",          "unit": "/μL",     "normal": [4000, 11000]},
    "rbc":                 {"label": "Erytrocyty (RBC)",         "unit": "mln/μL",  "normal": [4.0, 5.5]},
}

DOCTORS = {
    "dr_kowalski": {"password": "Doctor123!", "name": "Dr Jan Kowalski",    "specialty": "Kardiologia"},
    "dr_nowak":    {"password": "Doctor123!", "name": "Dr Anna Nowak",      "specialty": "Diabetologia"},
}


# ─────────────────────────────── Helpers ────────────────────────────────────

def _load_context() -> ts.Context:
    if not os.path.exists(SECRET_CONTEXT_PATH):
        raise FileNotFoundError(
            "Brak klucza tajnego. Uruchom: cd data_generator && python encrypt_data.py"
        )
    with open(SECRET_CONTEXT_PATH, "rb") as f:
        return ts.context_from(f.read())


def _encrypt(ctx: ts.Context, value: float) -> str:
    vec = ts.ckks_vector(ctx, [float(value)])
    return base64.b64encode(vec.serialize()).decode()


def _decrypt(ctx: ts.Context, enc_b64: str) -> float:
    vec = ts.ckks_vector_from(ctx, base64.b64decode(enc_b64))
    return vec.decrypt()[0]


def _normal_cdf(z: float) -> float:
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def _stats_from_sum(enc_sum_b64: str, enc_sum_sq_b64: str, n: int, ctx: ts.Context):
    total    = _decrypt(ctx, enc_sum_b64)
    total_sq = _decrypt(ctx, enc_sum_sq_b64)
    mean     = total / n
    variance = max(0.0, total_sq / n - mean ** 2)
    std      = math.sqrt(variance)
    return mean, std, variance


def _decrypt_exam(ctx: ts.Context, enc_row: dict) -> dict:
    row = {
        "exam_id":    enc_row.get("exam_id"),
        "patient_id": enc_row.get("patient_id"),
        "name":       enc_row.get("name"),
        "gender":     enc_row.get("gender"),
        "exam_date":  enc_row.get("exam_date"),
    }
    for field in NUMERICAL_FIELDS:
        raw = enc_row.get(f"{field}_enc", "")
        if raw:
            row[field] = round(_decrypt(ctx, raw), 2)
    return row


def _next_patient_id(existing_patients: list[dict]) -> str:
    nums = []
    for p in existing_patients:
        pid = p.get("patient_id", "")
        if pid.startswith("P") and pid[1:].isdigit():
            nums.append(int(pid[1:]))
    return f"P{(max(nums) + 1 if nums else 1):03d}"


def _new_exam_id() -> str:
    return f"E{uuid.uuid4().hex[:8].upper()}"


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Brak tokenu"}), 401
        token = auth[7:]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            request.doctor = payload
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token wygasł"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Nieprawidłowy token"}), 401
        return f(*args, **kwargs)
    return decorated


# ─────────────────────────────── Auth ───────────────────────────────────────

@app.route("/auth/login", methods=["POST"])
def login():
    body     = request.get_json(force=True)
    username = body.get("username", "")
    password = body.get("password", "")
    doctor   = DOCTORS.get(username)
    if not doctor or doctor["password"] != password:
        return jsonify({"error": "Nieprawidłowe dane logowania"}), 401

    token = jwt.encode(
        {
            "username":  username,
            "name":      doctor["name"],
            "specialty": doctor["specialty"],
            "exp":       datetime.now(timezone.utc) + timedelta(hours=8),
        },
        JWT_SECRET,
        algorithm="HS256",
    )
    return jsonify({"token": token, "name": doctor["name"], "specialty": doctor["specialty"]})


@app.route("/auth/verify", methods=["GET"])
@token_required
def verify_token():
    return jsonify({"valid": True, "doctor": request.doctor})


# ─────────────────────────────── Pacjenci ───────────────────────────────────

@app.route("/patients", methods=["GET"])
@token_required
def get_patients():
    resp = requests.get(f"{COMPUTE_URL}/patients", timeout=10)
    return jsonify(resp.json())


@app.route("/patients/<patient_id>", methods=["GET"])
@token_required
def get_patient(patient_id):
    resp = requests.get(f"{COMPUTE_URL}/patients/{patient_id}", timeout=10)
    if resp.status_code == 404:
        return jsonify({"error": "Nie znaleziono pacjenta"}), 404
    return jsonify(resp.json())


@app.route("/patients", methods=["POST"])
@token_required
def add_patient():
    """Tworzy nowego pacjenta z automatycznym ID i dodaje pierwsze badanie."""
    body = request.get_json(force=True)

    required = ["name", "gender"] + NUMERICAL_FIELDS
    missing  = [f for f in required if f not in body]
    if missing:
        return jsonify({"error": f"Brakujące pola: {missing}"}), 400

    try:
        ctx = _load_context()
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 503

    # Auto-generuj patient_id
    patients_resp = requests.get(f"{COMPUTE_URL}/patients", timeout=10)
    patient_id = _next_patient_id(patients_resp.json() if patients_resp.ok else [])

    exam_row = {
        "exam_id":    _new_exam_id(),
        "patient_id": patient_id,
        "name":       body["name"].strip(),
        "gender":     body["gender"],
        "exam_date":  body.get("exam_date", date.today().isoformat()),
    }
    for field in NUMERICAL_FIELDS:
        exam_row[f"{field}_enc"] = _encrypt(ctx, body[field])

    resp = requests.post(f"{COMPUTE_URL}/examinations", json=exam_row, timeout=15)
    if resp.status_code == 409:
        return jsonify({"error": "Konflikt identyfikatora badania"}), 409

    return jsonify({"message": "Pacjent dodany pomyślnie", "patient_id": patient_id}), 201


@app.route("/patients/<patient_id>", methods=["DELETE"])
@token_required
def delete_patient(patient_id):
    resp = requests.delete(f"{COMPUTE_URL}/patients/{patient_id}", timeout=10)
    if resp.status_code == 404:
        return jsonify({"error": "Nie znaleziono pacjenta"}), 404
    return jsonify({"message": "Pacjent usunięty"})


# ─────────────────────────────── Badania ────────────────────────────────────

@app.route("/patients/<patient_id>/examinations", methods=["GET"])
@token_required
def get_patient_examinations(patient_id):
    try:
        ctx = _load_context()
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 503

    resp = requests.get(f"{COMPUTE_URL}/patients/{patient_id}/examinations", timeout=10)
    enc_list = resp.json()
    result = [_decrypt_exam(ctx, e) for e in enc_list]
    result.sort(key=lambda x: x.get("exam_date", ""), reverse=True)
    return jsonify(result)


@app.route("/patients/<patient_id>/examinations", methods=["POST"])
@token_required
def add_examination(patient_id):
    """Dodaje nowe badanie do istniejącego pacjenta."""
    body = request.get_json(force=True)

    missing = [f for f in NUMERICAL_FIELDS if f not in body]
    if missing:
        return jsonify({"error": f"Brakujące pola: {missing}"}), 400

    # Sprawdź czy pacjent istnieje
    check = requests.get(f"{COMPUTE_URL}/patients/{patient_id}", timeout=10)
    if check.status_code == 404:
        return jsonify({"error": "Nie znaleziono pacjenta"}), 404
    patient_info = check.json()

    try:
        ctx = _load_context()
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 503

    exam_row = {
        "exam_id":    _new_exam_id(),
        "patient_id": patient_id,
        "name":       patient_info.get("name", ""),
        "gender":     patient_info.get("gender", ""),
        "exam_date":  body.get("exam_date", date.today().isoformat()),
    }
    for field in NUMERICAL_FIELDS:
        exam_row[f"{field}_enc"] = _encrypt(ctx, body[field])

    resp = requests.post(f"{COMPUTE_URL}/examinations", json=exam_row, timeout=15)
    return jsonify({"message": "Badanie dodane", "exam_id": exam_row["exam_id"]}), 201


@app.route("/examinations/<exam_id>", methods=["DELETE"])
@token_required
def delete_examination(exam_id):
    resp = requests.delete(f"{COMPUTE_URL}/examinations/{exam_id}", timeout=10)
    if resp.status_code == 404:
        return jsonify({"error": "Nie znaleziono badania"}), 404
    return jsonify({"message": "Badanie usunięte"})


# ─────────────────────────────── Analytics ──────────────────────────────────

@app.route("/analyze/statistics/<field>", methods=["GET"])
@token_required
def analyze_statistics(field):
    if field not in NUMERICAL_FIELDS:
        return jsonify({"error": "Nieznane pole"}), 400

    try:
        ctx = _load_context()
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 503

    resp = requests.post(f"{COMPUTE_URL}/compute/statistics", json={"field": field}, timeout=30)
    if resp.status_code != 200:
        return jsonify({"error": "Błąd serwera obliczeniowego"}), 502

    r = resp.json()
    n = r["count"]
    mean, std, variance = _stats_from_sum(r["enc_sum"], r["enc_sum_sq"], n, ctx)

    exams_resp = requests.get(f"{COMPUTE_URL}/examinations", timeout=30)
    values = []
    for e in exams_resp.json():
        raw = e.get(f"{field}_enc", "")
        if raw:
            values.append(round(_decrypt(ctx, raw), 3))
    values.sort()

    pct = lambda q: values[int(len(values) * q)] if values else 0

    meta = FIELD_META.get(field, {})
    return jsonify({
        "field":        field,
        "label":        meta.get("label", field),
        "unit":         meta.get("unit", ""),
        "normal_range": meta.get("normal", []),
        "count":        n,
        "mean":         round(mean, 2),
        "std":          round(std, 2),
        "variance":     round(variance, 2),
        "min":          round(min(values), 2),
        "max":          round(max(values), 2),
        "p25":          round(pct(0.25), 2),
        "median":       round(pct(0.50), 2),
        "p75":          round(pct(0.75), 2),
        "values":       values,
    })


@app.route("/analyze/compare", methods=["POST"])
@token_required
def analyze_compare():
    body      = request.get_json(force=True)
    field     = body.get("field")
    new_value = body.get("value")

    if field not in NUMERICAL_FIELDS or new_value is None:
        return jsonify({"error": "Wymagane: field i value"}), 400

    try:
        ctx = _load_context()
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 503

    new_value_enc = _encrypt(ctx, new_value)

    resp = requests.post(
        f"{COMPUTE_URL}/compute/compare",
        json={"field": field, "new_value_enc": new_value_enc},
        timeout=30,
    )
    if resp.status_code != 200:
        return jsonify({"error": "Błąd serwera obliczeniowego"}), 502

    r = resp.json()
    n = r["count"]
    mean, std, _ = _stats_from_sum(r["enc_sum"], r["enc_sum_sq"], n, ctx)

    diff_scaled = _decrypt(ctx, r["enc_diff"])
    diff        = diff_scaled / n
    z           = diff / std if std > 0 else 0.0
    percentile  = round(_normal_cdf(z) * 100, 1)

    if abs(z) < 1:
        severity, interpretation = "normal", "W normie (±1 SD)"
    elif abs(z) < 2:
        severity, interpretation = "warning", "Nieznacznie poza normą (1–2 SD)"
    else:
        severity, interpretation = "danger", "Znacznie poza normą (>2 SD)"

    meta         = FIELD_META.get(field, {})
    normal_range = meta.get("normal", [])
    in_clinical_range = (
        len(normal_range) == 2 and normal_range[0] <= float(new_value) <= normal_range[1]
    )

    return jsonify({
        "field":            field,
        "label":            meta.get("label", field),
        "unit":             meta.get("unit", ""),
        "normal_range":     normal_range,
        "value":            new_value,
        "mean":             round(mean, 2),
        "std":              round(std, 2),
        "diff":             round(diff, 2),
        "z_score":          round(z, 3),
        "percentile":       percentile,
        "severity":         severity,
        "interpretation":   interpretation,
        "in_clinical_range": in_clinical_range,
    })


@app.route("/analyze/full_profile", methods=["POST"])
@token_required
def analyze_full_profile():
    body = request.get_json(force=True)

    try:
        ctx = _load_context()
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 503

    try:
        batch_resp = requests.post(
            f"{COMPUTE_URL}/compute/batch_statistics",
            json={"fields": NUMERICAL_FIELDS},
            timeout=60,
        )
        batch_resp.raise_for_status()
        batch = batch_resp.json()
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"Błąd połączenia z serwerem obliczeniowym: {e}"}), 502
    except ValueError:
        return jsonify({"error": "Serwer obliczeniowy zwrócił nieprawidłową odpowiedź"}), 502

    results = {}
    for field in NUMERICAL_FIELDS:
        if field not in body or field not in batch:
            continue

        new_value = float(body[field])
        r         = batch[field]
        n         = r["count"]
        mean, std, _ = _stats_from_sum(r["enc_sum"], r["enc_sum_sq"], n, ctx)

        z = (new_value - mean) / std if std > 0 else 0.0

        if abs(z) < 1:
            severity = "normal"
        elif abs(z) < 2:
            severity = "warning"
        else:
            severity = "danger"

        meta         = FIELD_META.get(field, {})
        normal_range = meta.get("normal", [])
        in_clinical_range = (
            len(normal_range) == 2 and normal_range[0] <= new_value <= normal_range[1]
        )

        results[field] = {
            "label":            meta.get("label", field),
            "unit":             meta.get("unit", ""),
            "normal_range":     normal_range,
            "value":            new_value,
            "mean":             round(mean, 2),
            "std":              round(std, 2),
            "z_score":          round(z, 3),
            "percentile":       round(_normal_cdf(z) * 100, 1),
            "severity":         severity,
            "in_clinical_range": in_clinical_range,
        }

    return jsonify(results)


@app.route("/meta/fields", methods=["GET"])
def field_meta():
    return jsonify(FIELD_META)


if __name__ == "__main__":
    if not os.path.exists(SECRET_CONTEXT_PATH):
        print("UWAGA: Brak secret_context.bin. Uruchom: cd data_generator && python encrypt_data.py")
    app.run(host="0.0.0.0", port=5001, debug=False)
