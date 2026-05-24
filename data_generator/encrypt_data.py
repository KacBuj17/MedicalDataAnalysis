"""
Szyfruje sample_data.csv przy użyciu TenSEAL CKKS i zapisuje:
  - compute_server/data/patients_encrypted.csv  (zaszyfrowane dane)
  - compute_server/data/public_context.bin       (kontekst bez klucza tajnego)
  - doctor_backend/keys/secret_context.bin       (kontekst z kluczem tajnym)
"""
import csv
import base64
import os
import sys

try:
    import tenseal as ts
except ImportError:
    print("Błąd: tenseal nie jest zainstalowany. Uruchom: pip install tenseal")
    sys.exit(1)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)

NUMERICAL_FIELDS = [
    "age", "blood_pressure_sys", "blood_pressure_dia",
    "heart_rate", "glucose", "cholesterol", "bmi",
    "hemoglobin", "creatinine", "wbc", "rbc",
]

PLAINTEXT_FIELDS = ["exam_id", "patient_id", "name", "gender", "exam_date"]


def create_ckks_context():
    """Tworzy kontekst CKKS.

    poly_modulus_degree=8192  → depth-3 support, ~400 KB szyfrogram
    coeff_mod_bit_sizes=[60,40,40,60] → suma 200 bitów, bezpieczne dla n=8192
    depth=2                   → wystarczy do kwadratury (sum of squares) + relinearyzacji
    global_scale=2^20         → poziom 0: q=2^60, maks. wartość = 2^60/(2*2^20) = 2^39 ≈ 5e11
                                 pokrywa WBC sum_sq ≈ 2e10, cholesterol sum_sq ≈ 1.9e6
    """
    ctx = ts.context(
        ts.SCHEME_TYPE.CKKS,
        poly_modulus_degree=8192,
        coeff_mod_bit_sizes=[60, 40, 40, 60],
    )
    ctx.generate_galois_keys()
    ctx.generate_relin_keys()
    ctx.global_scale = 2 ** 40  # musi odpowiadać middle primes (40-bit) — inaczej po rescalingu skala=1 i szum CKKS niszczy wynik
    return ctx


def encrypt_scalar(ctx, value: float) -> str:
    """Szyfruje pojedynczą wartość i zwraca jako base64."""
    vec = ts.ckks_vector(ctx, [float(value)])
    return base64.b64encode(vec.serialize()).decode("utf-8")


def main():
    input_path = os.path.join(BASE_DIR, "sample_data.csv")
    if not os.path.exists(input_path):
        print(f"Nie znaleziono pliku: {input_path}")
        print("Najpierw uruchom: python generate_data.py")
        sys.exit(1)

    # Katalogi wyjściowe
    compute_data_dir = os.path.join(PROJECT_ROOT, "compute_server", "data")
    doctor_keys_dir = os.path.join(PROJECT_ROOT, "doctor_backend", "keys")
    os.makedirs(compute_data_dir, exist_ok=True)
    os.makedirs(doctor_keys_dir, exist_ok=True)

    print("Generowanie kluczy CKKS...")
    ctx = create_ckks_context()

    # Klucz tajny (dla lekarza — doctor_backend)
    secret_path = os.path.join(doctor_keys_dir, "secret_context.bin")
    with open(secret_path, "wb") as f:
        f.write(ctx.serialize(save_secret_key=True))
    print(f"  Klucz tajny → {secret_path}")

    # Klucz publiczny (dla serwera obliczeniowego — bez klucza tajnego)
    public_path = os.path.join(compute_data_dir, "public_context.bin")
    with open(public_path, "wb") as f:
        f.write(ctx.serialize(save_secret_key=False))
    print(f"  Klucz publiczny → {public_path}")

    # Wczytaj dane
    with open(input_path, "r", encoding="utf-8") as f:
        patients = list(csv.DictReader(f))

    print(f"Szyfrowanie {len(patients)} pacjentów...")

    encrypted_rows = []
    for i, patient in enumerate(patients):
        row = {field: patient[field] for field in PLAINTEXT_FIELDS}
        for field in NUMERICAL_FIELDS:
            row[f"{field}_enc"] = encrypt_scalar(ctx, patient[field])
        encrypted_rows.append(row)

        if (i + 1) % 10 == 0:
            print(f"  Zaszyfrowano {i + 1}/{len(patients)}...")

    enc_fieldnames = PLAINTEXT_FIELDS + [f"{f}_enc" for f in NUMERICAL_FIELDS]
    output_path = os.path.join(compute_data_dir, "patients_encrypted.csv")
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=enc_fieldnames)
        writer.writeheader()
        writer.writerows(encrypted_rows)

    print(f"Dane zaszyfrowane → {output_path}")
    print("\nGotowe! Możesz uruchomić serwery.")


if __name__ == "__main__":
    main()
