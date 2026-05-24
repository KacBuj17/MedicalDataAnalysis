# MedAnalytics HE — Analiza Danych Medycznych z Szyfrowaniem Homomorficznym

Platforma analizy danych medycznych z szyfrowaniem homomorficznym **CKKS** (TenSEAL/Microsoft SEAL).

## Architektura

```
Frontend (React :3000)
        │  JWT + plaintext
        ▼
Doctor Backend (Flask :5001)          ← posiada klucz tajny
        │  CKKS ciphertext (zaszyfrowane)
        ▼
Compute Server (Flask :5002)          ← tylko klucz publiczny, nie może odszyfrować
        │  dane w CSV (wbudowane w obraz Docker)
        ▼
patients_encrypted.csv                ← wartości zaszyfrowane CKKS
```

## Uruchomienie — Docker (zalecane)

Wymaganie: **Docker Desktop**

```bash
# Sklonuj repo i wejdź do katalogu
git clone <repo>
cd MedicalDataAnalysis

# Nadaj uprawnienia do skryptów (raz)
chmod +x scripts/*.sh

# 1. Zbuduj obrazy (generuje zaszyfrowaną bazę danych wewnątrz obrazu)
./scripts/install.sh

# 2. Uruchom
./scripts/run.sh

# 3. Otwórz http://localhost:3000
```

### Skrypty zarządzania

| Skrypt | Opis |
|--------|------|
| `./scripts/install.sh` | Buduje obrazy Docker (jednorazowo) |
| `./scripts/run.sh` | Uruchamia wszystkie kontenery |
| `./scripts/stop.sh` | Zatrzymuje kontenery (dane zachowane) |
| `./scripts/uninstall.sh` | Usuwa kontenery i obrazy |

### Dane w obrazie Docker

Zaszyfrowana baza danych (50 pacjentów, schemat CKKS) jest generowana podczas budowania obrazu.  
Nie trzeba instalować Pythona ani żadnych bibliotek — wszystko jest w kontenerze.

| Plik | Serwis | Zawartość |
|------|--------|-----------|
| `data/patients_encrypted.csv` | compute_server | Zaszyfrowane dane pacjentów |
| `data/public_context.bin` | compute_server | Klucz publiczny CKKS |
| `keys/secret_context.bin` | doctor_backend | **Klucz tajny** (tylko ten serwis) |

### Logowanie

| Login | Hasło | Specjalizacja |
|-------|-------|---------------|
| `dr_kowalski` | `Doctor123!` | Kardiologia |
| `dr_nowak` | `Doctor123!` | Diabetologia |

---

## Uruchomienie bez Dockera

```powershell
# Krok 1 — dane i klucze
cd data_generator
pip install tenseal numpy
python generate_data.py
python encrypt_data.py

# Krok 2-4 — trzy osobne terminale
cd compute_server && pip install -r requirements.txt && python app.py   # :5002
cd doctor_backend && pip install -r requirements.txt && python app.py   # :5001
cd frontend && npm install && npm start                                  # :3000
```

---

## Funkcjonalności

### Zakładka: Pacjenci
- Tabela z odszyfrowanymi wartościami + color-coding względem norm klinicznych
- Szczegółowy widok pacjenta z zakresami referencyjnymi
- Usuwanie pacjentów

### Zakładka: Nowy wpis
- Formularz z walidacją zakresów
- Szyfrowanie CKKS przed wysłaniem na serwer

### Zakładka: Analizy
1. **Statystyki populacji** — histogram, box plot, percentyle — obliczone na zaszyfrowanych danych
2. **Analiza profilu** — wykres radarowy z-score dla wszystkich parametrów
3. **Porównanie wartości** — z-score, percentyl, interpretacja kliniczna

---

## Schemat szyfrowania CKKS

```python
poly_modulus_degree = 4096       # rozmiar wielomianu
coeff_mod_bit_sizes = [40, 21, 40]  # 101-bit total, bezpieczne dla n=4096
global_scale = 2**21             # ~15-bitowa precyzja (wystarczająca dla danych med.)
# Głębokość mnożeń: 1 (wystarczy do sumy kwadratów)
```

- Compute Server: tylko klucz publiczny + klucze galois + relin
- Operacje HE: `Σ enc(x)`, `Σ enc(x²)` → średnia, wariancja, z-score po stronie lekarza