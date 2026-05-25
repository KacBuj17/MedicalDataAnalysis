import csv
import base64
import os
import sys

import numpy as np
from Pyfhel import Pyfhel
from cryptography.fernet import Fernet

BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)

NUMERICAL_FIELDS = [
    "weight", "height", "bmi",
    "waist_circumference", "hip_circumference",
    "upper_leg_length", "upper_arm_length",
]

PLAINTEXT_FIELDS     = ["exam_id", "patient_id", "exam_date"]
ENCRYPTED_STR_FIELDS = ["name", "gender"]


def create_he_context() -> Pyfhel:
    HE = Pyfhel()
    HE.contextGen(scheme="CKKS", n=8192, scale=2**40, qi_sizes=[60, 40, 40, 60])
    HE.keyGen()
    HE.relinKeyGen()
    return HE


def encrypt_scalar(HE: Pyfhel, value: float) -> str:
    ctxt = HE.encryptFrac(np.array([float(value)]))
    return base64.b64encode(ctxt.to_bytes()).decode("utf-8")


def encrypt_str(fernet: Fernet, value: str) -> str:
    return fernet.encrypt(value.encode()).decode("utf-8")


def main():
    input_path = os.path.join(BASE_DIR, "sample_data.csv")
    if not os.path.exists(input_path):
        sys.exit(1)

    compute_data_dir = os.path.join(PROJECT_ROOT, "compute_server", "data")
    doctor_keys_dir  = os.path.join(PROJECT_ROOT, "doctor_backend", "keys")
    os.makedirs(compute_data_dir, exist_ok=True)
    os.makedirs(doctor_keys_dir, exist_ok=True)

    HE = create_he_context()

    for path in [
        os.path.join(compute_data_dir, "context.bin"),
        os.path.join(doctor_keys_dir, "context.bin"),
    ]:
        HE.save_context(path)

    for path in [
        os.path.join(compute_data_dir, "public_key.bin"),
        os.path.join(doctor_keys_dir, "public_key.bin"),
    ]:
        HE.save_public_key(path)

    for path in [
        os.path.join(compute_data_dir, "relin_key.bin"),
        os.path.join(doctor_keys_dir, "relin_key.bin"),
    ]:
        HE.save_relin_key(path)

    HE.save_secret_key(os.path.join(doctor_keys_dir, "secret_key.bin"))

    fernet_key = Fernet.generate_key()
    fernet     = Fernet(fernet_key)

    fernet_path = os.path.join(doctor_keys_dir, "fernet_key.bin")
    with open(fernet_path, "wb") as f:
        f.write(fernet_key)

    with open(input_path, "r", encoding="utf-8") as f:
        patients = list(csv.DictReader(f))

    encrypted_rows = []
    for i, patient in enumerate(patients):
        row = {field: patient[field] for field in PLAINTEXT_FIELDS}
        for field in ENCRYPTED_STR_FIELDS:
            row[field] = encrypt_str(fernet, patient[field])
        for field in NUMERICAL_FIELDS:
            row[f"{field}_enc"] = encrypt_scalar(HE, patient[field])
        encrypted_rows.append(row)

    enc_fieldnames = (
        PLAINTEXT_FIELDS
        + ENCRYPTED_STR_FIELDS
        + [f"{f}_enc" for f in NUMERICAL_FIELDS]
    )
    output_path = os.path.join(compute_data_dir, "patients_encrypted.csv")
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=enc_fieldnames)
        writer.writeheader()
        writer.writerows(encrypted_rows)


if __name__ == "__main__":
    main()
