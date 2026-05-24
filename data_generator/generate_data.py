import csv
import random
import numpy as np
import os
from datetime import date, timedelta

FIRST_NAMES_M = ["Jan", "Piotr", "Marek", "Tomasz", "Andrzej", "Michał", "Krzysztof", "Adam", "Paweł", "Łukasz",
                 "Grzegorz", "Mateusz", "Bartosz", "Rafał", "Dariusz"]
FIRST_NAMES_F = ["Anna", "Maria", "Katarzyna", "Agnieszka", "Barbara", "Ewa", "Joanna", "Monika", "Aleksandra",
                 "Natalia", "Magdalena", "Karolina", "Zofia", "Weronika", "Paulina"]
LAST_NAMES_M = ["Kowalski", "Nowak", "Wiśniewski", "Wójcik", "Kowalczyk", "Kamiński", "Lewandowski",
                "Zieliński", "Szymański", "Woźniak", "Dąbrowski", "Kozłowski", "Jankowski", "Mazur", "Kwiatkowski"]
LAST_NAMES_F = ["Kowalska", "Nowak", "Wiśniewska", "Wójcik", "Kowalczyk", "Kamińska", "Lewandowska",
                "Zielińska", "Szymańska", "Woźniak", "Dąbrowska", "Kozłowska", "Jankowska", "Mazur", "Kwiatkowska"]

random.seed(42)
np.random.seed(42)

DATE_START = date(2023, 1, 1)
DATE_END   = date(2025, 4, 30)
DATE_RANGE = (DATE_END - DATE_START).days


def rand_date():
    return (DATE_START + timedelta(days=random.randint(0, DATE_RANGE))).isoformat()


def make_examination(exam_id, patient_id, name, gender, age):
    if gender == "M":
        hgb_mean, hgb_std = 15.5, 1.0
        rbc_mean, rbc_std = 5.0, 0.3
    else:
        hgb_mean, hgb_std = 13.5, 0.8
        rbc_mean, rbc_std = 4.5, 0.3

    bp_factor = 1.0 + (age - 50) * 0.005
    return {
        "exam_id":              exam_id,
        "patient_id":           patient_id,
        "name":                 name,
        "gender":               gender,
        "exam_date":            rand_date(),
        "age":                  age,
        "blood_pressure_sys":   round(float(np.clip(np.random.normal(125 * bp_factor, 15), 90, 200)), 1),
        "blood_pressure_dia":   round(float(np.clip(np.random.normal(82 * bp_factor, 10), 60, 130)), 1),
        "heart_rate":           round(float(np.clip(np.random.normal(74, 10), 50, 120)), 1),
        "glucose":              round(float(np.clip(np.random.normal(98, 18), 60, 200)), 1),
        "cholesterol":          round(float(np.clip(np.random.normal(198, 30), 120, 320)), 1),
        "bmi":                  round(float(np.clip(np.random.normal(26.5, 4), 16, 45)), 1),
        "hemoglobin":           round(float(np.clip(np.random.normal(hgb_mean, hgb_std), 8, 20)), 1),
        "creatinine":           round(float(np.clip(np.random.normal(0.9, 0.15), 0.4, 2.5)), 2),
        "wbc":                  round(float(np.clip(np.random.normal(7000, 1500), 2000, 20000)), 0),
        "rbc":                  round(float(np.clip(np.random.normal(rbc_mean, rbc_std), 3.0, 7.0)), 2),
    }


rows = []
exam_counter = 1

for i in range(50):
    pid    = f"P{i + 1:03d}"
    gender = random.choice(["M", "F"])
    name   = (f"{random.choice(FIRST_NAMES_M)} {random.choice(LAST_NAMES_M)}"
              if gender == "M"
              else f"{random.choice(FIRST_NAMES_F)} {random.choice(LAST_NAMES_F)}")
    age    = int(np.clip(np.random.normal(50, 12), 25, 80))

    # 1–3 examinations per patient
    n_exams = random.choices([1, 2, 3], weights=[3, 2, 1])[0]
    for _ in range(n_exams):
        eid = f"E{exam_counter:04d}"
        exam_counter += 1
        rows.append(make_examination(eid, pid, name, gender, age))
        # slight variation between visits
        age = min(age + random.randint(0, 1), 80)

fieldnames = [
    "exam_id", "patient_id", "name", "gender", "exam_date",
    "age", "blood_pressure_sys", "blood_pressure_dia", "heart_rate",
    "glucose", "cholesterol", "bmi",
    "hemoglobin", "creatinine", "wbc", "rbc",
]

output_path = os.path.join(os.path.dirname(__file__), "sample_data.csv")
with open(output_path, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f"Wygenerowano {len(rows)} badań dla 50 pacjentów → {output_path}")
