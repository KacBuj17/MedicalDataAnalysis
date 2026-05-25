import csv
import random
import sys
import os
from datetime import date, timedelta

import pyreadstat

FIRST_NAMES_M = ["Jan", "Piotr", "Marek", "Tomasz", "Andrzej", "Michal", "Krzysztof", "Adam", "Pawel", "Lukasz",
                 "Grzegorz", "Mateusz", "Bartosz", "Rafal", "Dariusz"]
FIRST_NAMES_F = ["Anna", "Maria", "Katarzyna", "Agnieszka", "Barbara", "Ewa", "Joanna", "Monika", "Aleksandra",
                 "Natalia", "Magdalena", "Karolina", "Zofia", "Weronika", "Paulina"]
LAST_NAMES_M = ["Kowalski", "Nowak", "Wisniewski", "Wojcik", "Kowalczyk", "Kaminski", "Lewandowski",
                "Zielinski", "Szymanski", "Wozniak", "Dabrowski", "Kozlowski", "Jankowski", "Mazur", "Kwiatkowski"]
LAST_NAMES_F = ["Kowalska", "Nowak", "Wisniewska", "Wojcik", "Kowalczyk", "Kaminska", "Lewandowska",
                "Zielinska", "Szymanska", "Wozniak", "Dabrowska", "Kozlowska", "Jankowska", "Mazur", "Kwiatkowska"]

random.seed(42)

DATE_START = date(2023, 1, 1)
DATE_END   = date(2025, 4, 30)
DATE_RANGE = (DATE_END - DATE_START).days

COLUMN_MAP = {
    "BMXWT":    "weight",
    "BMXHT":    "height",
    "BMXBMI":   "bmi",
    "BMXWAIST": "waist_circumference",
    "BMXHIP":   "hip_circumference",
    "BMXLEG":   "upper_leg_length",
    "BMXARML":  "upper_arm_length",
}

FIELDNAMES = [
    "exam_id", "patient_id", "name", "gender", "exam_date",
    "weight", "height", "bmi",
    "waist_circumference", "hip_circumference",
    "upper_leg_length", "upper_arm_length",
]


def rand_date():
    return (DATE_START + timedelta(days=random.randint(0, DATE_RANGE))).isoformat()


def main():
    xpt_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "BMX_L.xpt")
    if not os.path.exists(xpt_path):
        sys.exit(1)

    df, _meta = pyreadstat.read_xport(xpt_path)

    nhanes_cols = list(COLUMN_MAP.keys())
    missing = [c for c in nhanes_cols if c not in df.columns]
    if missing:
        sys.exit(1)

    df_clean = df[nhanes_cols].dropna()

    if len(df_clean) < 50:
        sys.exit(1)

    sample = df_clean.sample(n=min(200, len(df_clean)), random_state=42).reset_index(drop=True)

    rows = []
    for i, meas in sample.iterrows():
        pid    = f"P{i + 1:03d}"
        gender = random.choice(["M", "F"])
        if gender == "M":
            name = f"{random.choice(FIRST_NAMES_M)} {random.choice(LAST_NAMES_M)}"
        else:
            name = f"{random.choice(FIRST_NAMES_F)} {random.choice(LAST_NAMES_F)}"

        rows.append({
            "exam_id":              f"E{i + 1:04d}",
            "patient_id":           pid,
            "name":                 name,
            "gender":               gender,
            "exam_date":            rand_date(),
            "weight":               round(float(meas["BMXWT"]),    1),
            "height":               round(float(meas["BMXHT"]),    1),
            "bmi":                  round(float(meas["BMXBMI"]),   1),
            "waist_circumference":  round(float(meas["BMXWAIST"]), 1),
            "hip_circumference":    round(float(meas["BMXHIP"]),   1),
            "upper_leg_length":     round(float(meas["BMXLEG"]),   1),
            "upper_arm_length":     round(float(meas["BMXARML"]),  1),
        })

    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sample_data.csv")
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
