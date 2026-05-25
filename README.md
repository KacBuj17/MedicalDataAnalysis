# MedAnalytics HE — Analiza Danych Medycznych z Szyfrowaniem Homomorficznym

Platforma do analizy antropometrycznych danych medycznych z wykorzystaniem szyfrowania homomorficznego **CKKS** (biblioteka Pyfhel 3.5.0 / Microsoft SEAL). Dane pomiarowe pochodzą z badania **NHANES 2021–2023** (National Health and Nutrition Examination Survey), przeprowadzonego przez CDC (Centers for Disease Control and Prevention, USA).

---

## Spis treści

1. [Opis projektu](#opis-projektu)
2. [Architektura systemu](#architektura-systemu)
3. [Dane źródłowe — NHANES BMX\_L](#dane-źródłowe--nhanes-bmx_l)
4. [Schemat szyfrowania CKKS](#schemat-szyfrowania-ckks)
5. [Uruchomienie z Dockerem](#uruchomienie-z-dockerem)
6. [Uruchomienie lokalne (bez Dockera)](#uruchomienie-lokalne-bez-dockera)
7. [Struktura katalogów](#struktura-katalogów)
8. [API — Doctor Backend (:5001)](#api--doctor-backend-5001)
9. [API — Compute Server (:5002)](#api--compute-server-5002)
10. [Funkcjonalności frontendu](#funkcjonalności-frontendu)
11. [Konta testowe](#konta-testowe)
12. [Parametry medyczne i zakresy referencyjne](#parametry-medyczne-i-zakresy-referencyjne)
13. [Bezpieczeństwo i ograniczenia](#bezpieczeństwo-i-ograniczenia)

---

## Opis projektu

System demonstruje praktyczne zastosowanie **szyfrowania homomorficznego** w kontekście ochrony danych medycznych. Kluczowa właściwość: serwer obliczeniowy wykonuje operacje statystyczne (suma, suma kwadratów, porównania) na **zaszyfrowanych** danych — bez możliwości ich odczytania. Jedynym punktem, w którym dane są odszyfrowane, jest backend lekarza posiadający klucz tajny.

**Co system umożliwia:**

- Przechowywanie zaszyfrowanych pomiarów antropometrycznych pacjentów
- Obliczanie statystyk populacyjnych (średnia, odchylenie standardowe, percentyle) na zaszyfrowanych danych
- Porównywanie wyników pojedynczego pacjenta z populacją (z-score, percentyl)
- Pełną analizę profilu pacjenta na tle całej bazy — bez ujawniania danych serwerowi obliczeniowemu
- Dodawanie nowych pacjentów i badań z szyfrowaniem po stronie klienta (lekarza)

---

## Architektura systemu

```
Frontend React (:3000)
        │  JWT (plaintext)
        ▼
Doctor Backend — Flask (:5001)          ← klucz tajny CKKS
        │  CKKS ciphertext (zaszyfrowane)
        ▼
Compute Server — Flask (:5002)          ← tylko klucz publiczny
        │
        ▼
patients_encrypted.csv                  ← wartości zaszyfrowane CKKS
```

### Podział ról

| Komponent | Port | Klucze CKKS | Widzi dane jawne? |
|-----------|------|-------------|-------------------|
| Frontend (React) | 3000 | brak | tylko to, co lekarz odszyfrowuje |
| Doctor Backend (Flask) | 5001 | **klucz tajny + publiczny** | tak — odszyfrowuje wyniki |
| Compute Server (Flask) | 5002 | tylko klucz publiczny | **nie** — operuje wyłącznie na szyfrogramach |

### Przepływ danych przy dodawaniu badania

1. Lekarz wypełnia formularz w przeglądarce
2. Frontend wysyła dane jawne do Doctor Backend
3. Doctor Backend szyfruje każdy parametr kluczem CKKS i wysyła szyfrogram do Compute Server
4. Compute Server zapisuje szyfrogram do CSV — nigdy nie widzi wartości

### Przepływ danych przy analizie statystycznej

1. Doctor Backend żąda od Compute Server obliczenia sumy i sumy kwadratów zaszyfrowanych wartości
2. Compute Server zwraca zaszyfrowane wyniki (enc_sum, enc_sum_sq)
3. Doctor Backend odszyfrowuje wyniki kluczem tajnym i oblicza średnią, wariancję, z-score
4. Frontend wyświetla gotowe statystyki

---

## Dane źródłowe — NHANES BMX\_L

Dane pomiarowe pochodzą z pliku `BMX_L.xpt` — modułu **Body Measures** z badania NHANES 2021–2023.

- **Źródło:** [https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2021/DataFiles/BMX_L.htm](https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2021/DataFiles/BMX_L.htm)
- **Format pliku:** SAS Transport (XPT), odczytywany przez bibliotekę `pyreadstat`
- **Populacja:** dorośli i dzieci w USA, reprezentatywna próba krajowa
- **Rozmiar:** 8860 rekordów, z czego ~6694 ma kompletne pomiary dla wszystkich 7 parametrów

### Mapowanie kolumn NHANES → system

| Kolumna NHANES | Nazwa w systemie | Opis | Jednostka |
|----------------|------------------|------|-----------|
| `BMXWT` | `weight` | Masa ciała | kg |
| `BMXHT` | `height` | Wzrost (stojąca) | cm |
| `BMXBMI` | `bmi` | Wskaźnik masy ciała | kg/m² |
| `BMXWAIST` | `waist_circumference` | Obwód talii | cm |
| `BMXHIP` | `hip_circumference` | Obwód bioder | cm |
| `BMXLEG` | `upper_leg_length` | Długość uda | cm |
| `BMXARML` | `upper_arm_length` | Długość ramienia | cm |

### Uwaga o kolumnach z prefixem BMI\*

W zbiorze NHANES kolumny z prefixem `BMX` zawierają **wartości pomiarowe** (np. `BMXWT` = masa ciała w kg). Kolumny z prefixem `BMI` (np. `BMIWT`) to **kody statusu pomiaru** — przyjmują wartość NaN gdy pomiar przebiegł pomyślnie, a konkretną wartość gdy był problematyczny. Dlatego w systemie używamy kolumn `BMX*`, a NaN w kolumnach `BMI*` nie jest powodem do obaw.

### Przygotowanie danych

Skrypt `data_generator/generate_data.py`:
1. Wczytuje `BMX_L.xpt` przez `pyreadstat`
2. Odrzuca rekordy z brakującymi wartościami w którymkolwiek z 7 parametrów
3. Losuje 200 rekordów (ziarno `random_state=42` dla reprodukowalności)
4. Każdemu rekordowi przypisuje fikcyjne imię i płeć (NHANES jest zanonimizowane)
5. Zapisuje do `sample_data.csv`

---

## Schemat szyfrowania CKKS

CKKS (Cheon-Kim-Kim-Song) to schemat szyfrowania homomorficznego dla liczb zmiennoprzecinkowych, pozwalający wykonywać operacje arytmetyczne na zaszyfrowanych danych z kontrolowaną precyzją.

### Parametry kontekstu (Pyfhel)

```python
HE.contextGen(scheme="CKKS", n=8192, scale=2**40, qi_sizes=[60, 40, 40, 60])
HE.keyGen()
HE.relinKeyGen()
```

### Uzasadnienie parametrów

| Parametr | Wartość | Uzasadnienie |
|----------|---------|--------------|
| `n` (poly_modulus_degree) | 8192 | Bezpieczny poziom 128-bit, obsługuje głębokość mnożeń = 2 |
| `qi_sizes` (coeff_mod_bit_sizes) | [60,40,40,60] | Depth-3 ladder; suma 200 bitów wymagana dla n=8192 |
| `scale` | 2⁴⁰ | Odpowiada środkowym primom (40-bit) — konieczne dla poprawnego rescalingu po mnożeniu |
| Klucze relinearyzacji | tak | Wymagane do mnożenia szyfrogramów bez wzrostu rozmiaru |

### Operacje homomorficzne w systemie

System oblicza dwa akumulatory na zaszyfrowanych danych:

```
enc_sum    = Σ enc(xᵢ)          — zaszyfrowana suma wartości
enc_sum_sq = Σ enc(xᵢ²)         — zaszyfrowana suma kwadratów
```

Na podstawie odszyfrowanych akumulatorów lekarz oblicza jawnie:

```
mean     = enc_sum / n
variance = enc_sum_sq / n − mean²
std      = sqrt(variance)
z_score  = (x_patient − mean) / std
```

Głębokość mnożeń = 1 (tylko `enc(xᵢ) * enc(xᵢ)` przy liczeniu sum kwadratów), co mieści się w budżecie depth kontekstu. Po każdym mnożeniu wykonywana jest relinearyzacja i rescaling (`HE.relinearize`, `HE.rescale_to_next`).

---

## Uruchomienie z Dockerem

### Wymagania

- Docker Desktop (Windows/Mac/Linux)
- Plik `data_generator/BMX_L.xpt` (zawarty w repozytorium)

### Kroki

```bash
# 1. Sklonuj repozytorium
git clone <repo-url>
cd MedicalDataAnalysis

# 2. Nadaj uprawnienia skryptom (Linux/Mac)
chmod +x scripts/*.sh

# 3. Zbuduj obrazy (generuje zaszyfrowaną bazę danych wewnątrz obrazu)
./scripts/install.sh

# 4. Uruchom
./scripts/run.sh

# 5. Otwórz http://localhost:3000
```

### Skrypty zarządzania

| Skrypt | Opis |
|--------|------|
| `./scripts/install.sh` | Buduje obrazy Docker (jednorazowo lub po zmianie kodu) |
| `./scripts/run.sh` | Uruchamia wszystkie kontenery |
| `./scripts/stop.sh` | Zatrzymuje kontenery (dane zachowane) |
| `./scripts/uninstall.sh` | Usuwa kontenery i obrazy |

### Co dzieje się podczas `docker build`

Stage `data-builder` w Dockerfile:
1. Instaluje `Pyfhel` (kompiluje Microsoft SEAL z C++) oraz `numpy`, `pyreadstat`, `cryptography`
2. Kopiuje `data_generator/` (wraz z `BMX_L.xpt`)
3. Uruchamia `generate_data.py` — przetwarza NHANES → `sample_data.csv`
4. Uruchamia `encrypt_data.py` — szyfruje dane CKKS, generuje klucze
5. Wygenerowane pliki są kopiowane do kolejnych stage'y (compute_server, doctor_backend)

> **Uwaga:** Pierwsze budowanie wymaga kompilacji biblioteki Microsoft SEAL z C++ — trwa 15–25 minut. Kolejne budowania korzystają z cache Dockera i są znacznie szybsze.

---

## Uruchomienie lokalne (bez Dockera)

### Wymagania wstępne

- Python 3.10+
- Node.js 18+
- Kompilator C++ (g++ / MSVC) oraz cmake, make — wymagane do budowania Pyfhel
- Plik `data_generator/BMX_L.xpt` (zawarty w repozytorium)

### Krok 1 — Środowisko Python i generowanie danych

```bash
# Utwórz venv
python -m venv .venv
source .venv/bin/activate        # Linux/Mac
# .\.venv\Scripts\Activate.ps1  # Windows PowerShell

# Zainstaluj Pyfhel (kompiluje SEAL — kilka minut)
pip install Pyfhel numpy

# Zainstaluj pozostałe zależności
pip install pyreadstat cryptography flask flask-cors requests PyJWT

# Wygeneruj dane z NHANES
cd data_generator
python generate_data.py
python encrypt_data.py
cd ..
```

### Krok 2 — Uruchom trzy serwisy w osobnych terminalach

**Terminal 1 — Compute Server (port 5002)**
```bash
cd compute_server
python app.py
```

**Terminal 2 — Doctor Backend (port 5001)**
```bash
cd doctor_backend
python app.py
```

**Terminal 3 — Frontend React (port 3000)**
```bash
cd frontend
npm install
npm start
```

### Krok 3 — Otwórz przeglądarkę

```
http://localhost:3000
```

---

## Struktura katalogów

```
MedicalDataAnalysis/
├── data_generator/
│   ├── BMX_L.xpt              ← plik NHANES (w repozytorium)
│   ├── generate_data.py       ← przetwarza XPT → sample_data.csv
│   ├── encrypt_data.py        ← szyfruje CSV → patients_encrypted.csv + klucze
│   └── sample_data.csv        ← generowany automatycznie (w .gitignore)
│
├── compute_server/
│   ├── app.py                 ← Flask :5002, tylko klucz publiczny
│   ├── requirements.txt
│   └── data/
│       ├── patients_encrypted.csv   ← generowany przez encrypt_data.py
│       ├── context.bin              ← kontekst CKKS (Pyfhel)
│       ├── public_key.bin           ← klucz publiczny CKKS
│       └── relin_key.bin            ← klucz relinearyzacji CKKS
│
├── doctor_backend/
│   ├── app.py                 ← Flask :5001, klucz tajny + publiczny
│   ├── requirements.txt
│   └── keys/
│       ├── context.bin              ← kontekst CKKS (Pyfhel)
│       ├── public_key.bin           ← klucz publiczny CKKS
│       ├── secret_key.bin           ← klucz tajny CKKS (tylko ten serwis)
│       ├── relin_key.bin            ← klucz relinearyzacji CKKS
│       └── fernet_key.bin           ← klucz Fernet (szyfrowanie imion i płci)
│
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── components/
│   │   │   ├── Login.js
│   │   │   ├── Navbar.js
│   │   │   ├── PatientRecords.js
│   │   │   ├── InsertData.js
│   │   │   └── Analytics.js
│   │   └── services/api.js
│   └── package.json
│
├── scripts/
│   ├── install.sh
│   ├── run.sh
│   ├── stop.sh
│   └── uninstall.sh
│
├── Dockerfile                 ← multi-stage build
├── docker-compose.yml
└── README.md
```

---

## API — Doctor Backend (:5001)

Wszystkie endpointy (poza `/auth/login` i `/meta/fields`) wymagają nagłówka:
```
Authorization: Bearer <jwt_token>
```

### Autoryzacja

| Metoda | Endpoint | Opis |
|--------|----------|------|
| POST | `/auth/login` | Logowanie, zwraca JWT (ważny 8h) |
| GET | `/auth/verify` | Weryfikacja tokenu |

**Przykład logowania:**
```bash
curl -X POST http://localhost:5001/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"dr_kowalski","password":"Doctor123!"}'
```

### Pacjenci

| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/patients` | Lista wszystkich pacjentów |
| GET | `/patients/{id}` | Dane pojedynczego pacjenta |
| POST | `/patients` | Dodaj nowego pacjenta z pierwszym badaniem |
| DELETE | `/patients/{id}` | Usuń pacjenta i wszystkie jego badania |

**Body POST `/patients`:**
```json
{
  "name": "Jan Kowalski",
  "gender": "M",
  "exam_date": "2025-01-15",
  "weight": 82.5,
  "height": 178.0,
  "bmi": 26.0,
  "waist_circumference": 88.0,
  "hip_circumference": 102.0,
  "upper_leg_length": 42.0,
  "upper_arm_length": 36.0
}
```

### Badania

| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/patients/{id}/examinations` | Lista badań pacjenta (odszyfrowane) |
| POST | `/patients/{id}/examinations` | Dodaj nowe badanie do istniejącego pacjenta |
| DELETE | `/examinations/{exam_id}` | Usuń pojedyncze badanie |

### Analizy statystyczne (HE)

| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/analyze/statistics/{field}` | Statystyki populacji dla wybranego parametru |
| POST | `/analyze/compare` | Porównaj wartość pacjenta z populacją |
| POST | `/analyze/full_profile` | Pełna analiza profilu (wszystkie parametry naraz) |
| GET | `/meta/fields` | Metadane parametrów (etykiety, jednostki, zakresy) |

**GET `/analyze/statistics/bmi` — przykładowa odpowiedź:**
```json
{
  "field": "bmi",
  "label": "BMI",
  "unit": "kg/m²",
  "normal_range": [18.5, 25],
  "count": 200,
  "mean": 29.11,
  "std": 6.78,
  "variance": 45.91,
  "min": 16.6,
  "max": 58.6,
  "p25": 24.4,
  "median": 28.3,
  "p75": 32.5,
  "values": [...]
}
```

**POST `/analyze/compare` — body:**
```json
{ "field": "weight", "value": 95.0 }
```

**POST `/analyze/full_profile` — body:**
```json
{
  "weight": 82.5,
  "height": 178.0,
  "bmi": 26.0,
  "waist_circumference": 88.0,
  "hip_circumference": 102.0,
  "upper_leg_length": 42.0,
  "upper_arm_length": 36.0
}
```

---

## API — Compute Server (:5002)

Serwer obliczeniowy nie wymaga uwierzytelniania (jest izolowany — dostępny tylko wewnętrznie z Docker network lub localhosta). Operuje wyłącznie na zaszyfrowanych danych.

| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/health` | Status serwera i gotowości danych |
| GET | `/patients` | Lista pacjentów (plaintext metadata) |
| GET | `/patients/{id}` | Dane pacjenta (plaintext) |
| DELETE | `/patients/{id}` | Usuń pacjenta |
| GET | `/examinations` | Wszystkie badania (zaszyfrowane wartości) |
| POST | `/examinations` | Zapisz nowe badanie (zaszyfrowane) |
| DELETE | `/examinations/{exam_id}` | Usuń badanie |
| POST | `/compute/statistics` | Oblicz enc_sum + enc_sum_sq dla pola |
| POST | `/compute/compare` | Oblicz enc_sum + enc_sum_sq dla pola (porównanie) |
| POST | `/compute/batch_statistics` | Oblicz statystyki dla wielu pól naraz |

**POST `/compute/statistics` i `/compute/compare` — body:**
```json
{ "field": "bmi" }
```

**Odpowiedź:**
```json
{
  "count": 200,
  "enc_sum": "<base64 CKKS ciphertext>",
  "enc_sum_sq": "<base64 CKKS ciphertext>"
}
```

---

## Funkcjonalności frontendu

### Zakładka: Pacjenci

- Tabela z listą wszystkich pacjentów — ID, imię, płeć, liczba badań, data ostatniego badania
- Wyszukiwarka (filtruje po nazwisku lub ID)
- Widok szczegółowy pacjenta:
  - Lista badań posortowana od najnowszego
  - Każdy parametr z color-codingiem (zielony/żółty/czerwony) względem zakresów referencyjnych
  - Licznik anomalii na badanie (ile parametrów poza normą)
  - Możliwość usunięcia pojedynczego badania lub całego pacjenta

### Zakładka: Nowy wpis

- Tryb **Nowy pacjent**: formularz z imieniem, płcią, datą badania i 7 parametrami pomiarowymi
- Tryb **Dodaj badanie**: wybierz istniejącego pacjenta z listy i wprowadź nowe pomiary
- Walidacja zakresów wartości po stronie klienta
- Dane są szyfrowane CKKS po stronie Doctor Backend przed zapisem

### Zakładka: Analizy

**Statystyki populacji** — wybierz parametr i załaduj:
- Karta ze średnią, odchyleniem std., min/max, mediana, P25/P75
- Histogram rozkładu z kolorowaniem bins: niebieskie = w normie klinicznej, czerwone = poza normą
- Linia średniej na histogramie
- Alert o przekroczeniu normy przez średnią populacji

**Analiza profilu pacjenta** — wprowadź wartości dla wszystkich 7 parametrów:
- Wykres radarowy z-score (od -3 do +3) dla wszystkich parametrów
- Pasek postępu z-score dla każdego parametru z kolorem wg ciężkości
- Tabela szczegółowa: wartość pacjenta, średnia populacji, odch. std., z-score, percentyl, status kliniczny
- Podsumowanie: ile parametrów w normie / lekko poza / znacznie poza

**Porównanie wartości** — wybierz parametr i podaj jedną wartość:
- Natychmiastowe porównanie z populacją
- Z-score, percentyl, interpretacja słowna
- Informacja o tym, czy wartość mieści się w zakresie klinicznym

---

## Konta testowe

| Login | Hasło | Specjalizacja |
|-------|-------|---------------|
| `dr_kowalski` | `Doctor123!` | Kardiologia |
| `dr_nowak` | `Doctor123!` | Diabetologia |

---

## Parametry medyczne i zakresy referencyjne

| Parametr | Jednostka | Zakres referencyjny | Źródło |
|----------|-----------|---------------------|--------|
| Masa ciała | kg | 50–90 | Ogólny zakres zdrowej masy dla dorosłych |
| Wzrost | cm | 152–193 | Typowy zakres wzrostu dorosłych (P5–P95) |
| BMI | kg/m² | 18,5–25,0 | WHO: norma dla dorosłych |
| Obwód talii | cm | 60–94 | WHO: wartość graniczna ryzyka sercowo-naczyniowego u mężczyzn |
| Obwód bioder | cm | 80–115 | Zakres typowy dla dorosłych |
| Długość uda | cm | 32–50 | Zakres typowy dla dorosłych |
| Długość ramienia | cm | 30–42 | Zakres typowy dla dorosłych |

**Uwaga:** Zakresy referencyjne to wartości orientacyjne stosowane do color-codingu w interfejsie. Nie zastępują klinycznej oceny lekarskiej. Dane populacyjne są oparte na próbie amerykańskiej (NHANES), która może różnić się od populacji europejskiej.

---

## Bezpieczeństwo i ograniczenia

### Co system chroni

- Compute Server **nigdy** nie ma dostępu do klucza tajnego — nawet kompromitacja serwera obliczeniowego nie ujawnia danych pacjentów
- Wszystkie wartości pomiarowe przechowywane są jako szyfrogramy CKKS (pliki `.bin` i `.csv` zawierają tylko dane zaszyfrowane)
- JWT ogranicza dostęp do Doctor Backend do uwierzytelnionych lekarzy (ważność 8h)

### Znane ograniczenia (środowisko demonstracyjne)

| Ograniczenie | Opis |
|--------------|------|
| Brak TLS | Komunikacja HTTP bez szyfrowania transportowego. W produkcji wymagany HTTPS. |
| Hasło w kodzie | JWT secret i hasła lekarzy zakodowane w `app.py`. W produkcji użyć zmiennych środowiskowych / vault. |
| Brak rate limiting | Doctor Backend nie ogranicza liczby żądań. |
| CKKS precyzja | Global scale 2⁴⁰ daje ~12–15 bitów precyzji po operacjach. Wystarczające dla pomiarów ciała (dokładność 0,01), niewystarczające dla operacji wielokrotnego mnożenia. |
| Jednokrotne badanie | Każdy respondent NHANES pojawia się w danych jako jeden pacjent z jednym badaniem. System obsługuje wiele badań na pacjenta, ale dane historyczne nie są w zbiorze NHANES BMX. |
