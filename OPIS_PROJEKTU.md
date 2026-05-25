# MedAnalytics HE — Opis projektu

## Co to jest?

System do analizy antropometrycznych danych medycznych pacjentów, który używa **szyfrowania homomorficznego** (schemat CKKS). Kluczowa cecha: serwer obliczeniowy wykonuje obliczenia statystyczne na **zaszyfrowanych danych**, nigdy nie widząc ich wartości. Jedynym miejscem, gdzie dane są odszyfrowywane, jest backend lekarza posiadający klucz tajny.

Dane źródłowe pochodzą z badania **NHANES 2021–2023** (Centers for Disease Control and Prevention, USA) — 200 pacjentów z 7 parametrami antropometrycznymi: waga, wzrost, BMI, obwód talii, obwód bioder, długość uda, długość ramienia.

---

## Architektura — trzy serwisy

```
[Przeglądarka / Frontend React :3000]
          |
          | JSON + JWT token
          |
[Doctor Backend Flask :5001]     ← MA klucz tajny CKKS
          |
          | zaszyfrowane szyfrogramy CKKS
          |
[Compute Server Flask :5002]     ← MA TYLKO klucz publiczny
          |
          | patients_encrypted.csv (zaszyfrowane dane)
```

| Serwis | Technologia | Port | Posiada klucz tajny? | Widzi dane jawne? |
|---|---|---|---|---|
| Frontend | React 18, Recharts | 3000 | NIE | Tylko to co lekarz zwróci |
| Doctor Backend | Flask, PyJWT, Pyfhel | 5001 | **TAK** | **TAK** — odszyfrowuje wyniki |
| Compute Server | Flask, Pyfhel | 5002 | **NIE** | **NIE** — tylko szyfrogramy |

Wszystkie serwisy działają w jednej sieci Docker (`mednet`). Frontend komunikuje się z Doctor Backend przez internet (przeglądarka), Doctor Backend komunikuje się z Compute Server wewnątrz sieci Docker.

---

## Dane i skąd pochodzą

### Plik źródłowy: `BMX_L.xpt`

Plik w formacie SAS Transport (`.xpt`) z badania NHANES. Zawiera pomiary antropometryczne tysięcy Amerykanów. Python odczytuje go biblioteką `pyreadstat`.

Mapowanie kolumn NHANES:
| Kolumna NHANES | Parametr w systemie | Jednostka |
|---|---|---|
| BMXWT | weight | kg |
| BMXHT | height | cm |
| BMXBMI | bmi | kg/m² |
| BMXWAIST | waist_circumference | cm |
| BMXHIP | hip_circumference | cm |
| BMXLEG | upper_leg_length | cm |
| BMXARML | upper_arm_length | cm |

`generate_data.py` losuje 200 pacjentów (seed=42), odrzuca rekordy z brakującymi wartościami i przypisuje fikcyjne imiona.

---

## Szyfrowanie homomorficzne CKKS

### Czym jest szyfrowanie homomorficzne?

Zwykłe szyfrowanie: żeby cokolwiek obliczyć, trzeba najpierw odszyfrować dane.
Szyfrowanie homomorficzne: można **wykonywać operacje matematyczne bezpośrednio na szyfrogramach** — wynik jest zaszyfrowanym wynikiem tej operacji.

```
enc(5) + enc(3) = enc(8)   ← dodawanie na szyfrogramach
enc(5) × enc(5) = enc(25)  ← mnożenie na szyfrogramach
```

Nikt po drodze nie widzi liczb 5, 3, 8, 25 — tylko zaszyfrowane bloki bajtów.

### Schemat CKKS (Cheon-Kim-Kim-Song)

CKKS to wariant dla **liczb zmiennoprzecinkowych** (jak waga 82.3 kg, BMI 26.1). Dopuszcza małe błędy zaokrągleń, ale jest wystarczająco precyzyjny dla danych medycznych.

### Parametry kontekstu w projekcie

```python
HE.contextGen(scheme="CKKS", n=8192, scale=2**40, qi_sizes=[60, 40, 40, 60])
HE.keyGen()       # generuje parę: klucz publiczny + klucz tajny
HE.relinKeyGen()  # klucze relinearyzacji — redukują rozmiar szyfrogramu po mnożeniu
```

| Parametr | Wartość | Co oznacza |
|---|---|---|
| `n` | 8192 | Stopień wielomianu — bezpieczeństwo 128-bit |
| `scale` | 2⁴⁰ | Precyzja ~12–15 cyfr — wystarczy dla pomiarów ciała |
| `qi_sizes` | [60,40,40,60] | Budżet na operacje — pozwala na ~1 mnożenie |

### Klucze kryptograficzne

- **Klucz publiczny** (`public_key.bin`) — do szyfrowania danych. Mają go: Doctor Backend i Compute Server.
- **Klucz tajny** (`secret_key.bin`) — do odszyfrowania. Ma go **wyłącznie Doctor Backend**.
- **Klucze relinearyzacji** (`relin_key.bin`) — potrzebne po mnożeniu homomorficznym. Mają go obie strony.
- **Klucz Fernet** (`fernet_key.bin`) — symetryczne szyfrowanie imion i płci (AES-CBC). Ma go tylko Doctor Backend.

---

## Dokładnie jakie operacje wykonuje Compute Server na zaszyfrowanych danych

Cała logika homomorficzna Compute Servera to jedna funkcja `_enc_sum_and_sumsq`. Wykonuje dokładnie **dwie operacje**:

### Operacja 1 — homomorficzne dodawanie

```python
enc_sum = ciphers[0]
for c in ciphers[1:]:
    enc_sum = enc_sum + c   # operator + na szyfrogramach PyCtxt
```

Dodaje kolejno wszystkie 200 zaszyfrowanych wartości (np. BMI). Wynik `enc_sum` to zaszyfrowana suma wszystkich wartości w populacji. Compute Server nie widzi żadnej liczby — operuje wyłącznie na blokach bajtów.

Dodawanie w CKKS nie zużywa "budżetu głębokości" — można je wykonywać bez ograniczeń.

### Operacja 2 — homomorficzne mnożenie + relinearyzacja + rescaling

```python
sq = c * c              # podnosi zaszyfrowaną wartość do kwadratu
HE.relinearize(sq)      # zmniejsza rozmiar szyfrogramu po mnożeniu
HE.rescale_to_next(sq)  # wyrównuje skalę (mnożenie podnosi ją do kwadratu: 2^40 × 2^40 = 2^80, trzeba cofnąć)
```

Każda wartość jest podnoszona do kwadratu osobno. Potem kwadraty są sumowane tak samo jak w operacji 1:

```python
enc_sum_sq = squares[0]
for sq in squares[1:]:
    enc_sum_sq = enc_sum_sq + sq
```

Wynik `enc_sum_sq` to zaszyfrowana suma kwadratów wszystkich wartości.

### Dlaczego akurat suma i suma kwadratów?

Z tych dwóch liczb Doctor Backend może wyliczyć wszystkie potrzebne statystyki. To wzór na wariancję z definicji:

```
mean     = suma / n
variance = suma_kwadratów / n  −  mean²       ← wzór: Var(X) = E[X²] − E[X]²
std      = sqrt(variance)
z-score  = (wartość_pacjenta − mean) / std
```

Dlatego wystarczą dokładnie dwie homomorficzne operacje — nie ma potrzeby liczenia niczego więcej po stronie Compute Servera.

### Co Compute Server zwraca

```json
{
  "count": 200,
  "enc_sum":    "base64 zaszyfrowanej sumy",
  "enc_sum_sq": "base64 zaszyfrowanej sumy kwadratów"
}
```

Dwa zaszyfrowane szyfrogramy i liczba elementów. Doctor Backend odbiera je i odszyfrowuje kluczem tajnym — dopiero wtedy pojawiają się konkretne liczby.

---

## Przepływ danych — krok po kroku

### 1. Przygotowanie danych (jednorazowe)

```
BMX_L.xpt
  → generate_data.py
  → sample_data.csv (200 pacjentów, dane jawne)
  → encrypt_data.py
  → patients_encrypted.csv (zaszyfrowane CKKS) → compute_server/data/
  → klucze kryptograficzne → doctor_backend/keys/
                           → compute_server/data/ (bez secret_key!)
```

### 2. Dodawanie nowego pacjenta

```
[Frontend]
  POST /patients {name, gender, weight: 82.3, height: 178, bmi: 26.0, ...}
  + JWT token w nagłówku

[Doctor Backend]
  1. Weryfikuj JWT
  2. Zaszyfruj każde pole CKKS:
     enc_weight = HE.encryptFrac(np.array([82.3]))
     enc_height = HE.encryptFrac(np.array([178.0]))
     ...
  3. Zaszyfruj imię i płeć Fernetem
  4. Wyślij do Compute Server

[Compute Server]
  1. Zapisz do patients_encrypted.csv
     - jawne: exam_id, patient_id, exam_date
     - zaszyfrowane: name, gender, weight_enc, height_enc, ...
  2. Nie może odczytać żadnych wartości medycznych

[Compute Server nie wie]: imię, płeć, waga, wzrost ani żaden parametr
```

### 3. Obliczanie statystyk populacji (np. BMI)

```
[Frontend]
  GET /analyze/statistics/bmi + JWT

[Doctor Backend]
  POST http://compute_server:5002/compute/statistics {"field": "bmi"}

[Compute Server — operuje wyłącznie na szyfrogramach]
  1. Wczytaj wszystkie 200 zaszyfrowanych wartości bmi z CSV
  2. Homomorficzne dodawanie:
     enc_sum = enc_bmi_1 + enc_bmi_2 + ... + enc_bmi_200
  3. Homomorficzne kwadraty + sumowanie:
     sq_1 = enc_bmi_1 * enc_bmi_1 → relinearize → rescale
     sq_2 = enc_bmi_2 * enc_bmi_2 → relinearize → rescale
     ...
     enc_sum_sq = sq_1 + sq_2 + ... + sq_200
  4. Zwróć enc_sum i enc_sum_sq jako base64
     ← przez cały czas żadna wartość nie jest odszyfrowana

[Doctor Backend — jedyne miejsce odszyfrowania w całym systemie]
  1. Odszyfruj kluczem tajnym:
     total    = HE.decryptFrac(enc_sum)    → np. 5822.4
     total_sq = HE.decryptFrac(enc_sum_sq) → np. 174512.8
  2. Oblicz statystyki na jawnych liczbach:
     mean     = 5822.4 / 200       = 29.11
     variance = 174512.8 / 200 − 29.11²  = 45.97
     std      = √45.97             = 6.78
  3. Aby obliczyć percentyle: wczytaj i odszyfruj wszystkie 200 wartości
     indywidualnie, posortuj, weź odpowiednie indeksy (P25, P50, P75)
  4. Zwróć do frontendu: mean, std, min, max, P25, median, P75 + tablicę 200 wartości

[Frontend]
  Rysuje histogram + kartę statystyk
```

### 4. Jak powstaje histogram na froncie

Backend zwraca tablicę 200 odszyfrowanych wartości. Frontend sam buduje histogram w przeglądarce:

```
1. Wyznacz zakres: min=16.6, max=58.6
2. Podziel na 15 równych przedziałów: szerokość = (58.6 − 16.6) / 15 = 2.8
3. Dla każdej z 200 wartości: oblicz do którego przedziału należy
   np. BMI=22.3 → (22.3 − 16.6) / 2.8 = 2.03 → przedział nr 2
4. Policz ile wartości wpadło w każdy przedział → to jest wysokość słupka
5. Każdy słupek: niebieski jeśli lewa granica mieści się w normie klinicznej (18.5–25),
   czerwony jeśli poza normą
```

Wysokość słupka to **liczba pacjentów** w danym przedziale — nie żadna średnia. Całe obliczenie dzieje się lokalnie w JavaScript.

### 5. Porównanie pacjenta z populacją

```
[Frontend]
  POST /analyze/compare {"field": "bmi", "value": 35.5}

[Doctor Backend]
  1. Pobierz enc_sum i enc_sum_sq od Compute Server (identycznie jak w pkt. 3)
  2. Odszyfruj → mean=29.11, std=6.78
  3. Oblicz z-score:
     z = (35.5 − 29.11) / 6.78 = 0.94
  4. Oblicz percentyl (dystrybuanta normalna):
     percentyl = Φ(0.94) × 100 = 82.6%
     (Φ to całka pod krzywą Gaussa od −∞ do z)
  5. Klasyfikacja:
     |z| < 1 → "normal"   (w granicach ±1 odchylenia standardowego)
     |z| < 2 → "warning"
     |z| ≥ 2 → "danger"

[Frontend]
  Wyświetl: wartość 35.5, średnia 29.11, z-score 0.94, percentyl 82.6%, status "normal"
```

### 6. Pełny profil pacjenta (wszystkie 7 pól naraz)

```
[Frontend]
  POST /analyze/full_profile {weight: ..., height: ..., bmi: ..., ...}

[Doctor Backend]
  POST /compute/batch_statistics {"fields": ["weight","height","bmi",...]}
  → Compute Server wykonuje _enc_sum_and_sumsq dla każdego z 7 pól
  → Zwraca enc_sum i enc_sum_sq dla każdego pola w jednej odpowiedzi
  → Doctor Backend odszyfrowuje wszystkie 14 szyfrgramów (7 sum + 7 sum kwadratów)
  → Dla każdego pola oblicza mean, std, z-score, percentyl, klasyfikację

[Frontend]
  Wykres radarowy z-score dla 7 parametrów + tabela z wartościami, średnimi, statusem
```

---

## Klucze kryptograficzne — kiedy są tworzone i kto z nich korzysta

### Kiedy klucze powstają

Klucze są generowane **jednorazowo** przez skrypt `data_generator/encrypt_data.py`. Uruchamia się go ręcznie przed pierwszym uruchomieniem systemu. Nie ma żadnego mechanizmu rotacji kluczy — jeśli klucze zostaną skasowane, nie da się odszyfrować istniejących danych.

```
python data_generator/encrypt_data.py
```

Co dzieje się w środku:

```python
HE = Pyfhel()
HE.contextGen(scheme="CKKS", n=8192, scale=2**40, qi_sizes=[60, 40, 40, 60])
HE.keyGen()       # generuje parę: klucz publiczny + klucz tajny
HE.relinKeyGen()  # generuje klucze relinearyzacji
fernet_key = Fernet.generate_key()  # generuje klucz AES dla imion/płci
```

### Gdzie każdy klucz ląduje po wygenerowaniu

Skrypt kopiuje pliki do dwóch katalogów — celowo z różnym zestawem:

```
doctor_backend/keys/          compute_server/data/
  context.bin        ←——————→   context.bin
  public_key.bin     ←——————→   public_key.bin
  relin_key.bin      ←——————→   relin_key.bin
  secret_key.bin     ✗ (tylko tu, nigdy do Compute Server)
  fernet_key.bin     ✗ (tylko tu, Compute Server nie potrzebuje)
```

Klucz tajny CKKS i klucz Fernet **nigdy nie opuszczają** katalogu `doctor_backend/keys/`.

### Co każdy klucz robi i kto go używa

| Plik | Algorytm | Kto ma | Do czego służy |
|---|---|---|---|
| `context.bin` | parametry CKKS | Doctor Backend + Compute Server | Oba serwisy muszą używać identycznego kontekstu (te same parametry `n`, `scale`, `qi_sizes`), inaczej szyfrogramy byłyby niekompatybilne |
| `public_key.bin` | CKKS klucz publiczny | Doctor Backend + Compute Server | Doctor Backend używa do **szyfrowania** nowych danych pacjentów; Compute Server ładuje go tylko po to, żeby mieć poprawnie zainicjalizowany obiekt `HE` do operacji na szyfrogramach |
| `secret_key.bin` | CKKS klucz tajny | **tylko Doctor Backend** | Do **odszyfrowania** wyników (enc_sum, enc_sum_sq) i indywidualnych wartości pacjentów |
| `relin_key.bin` | klucze relinearyzacji | Doctor Backend + Compute Server | Potrzebne po mnożeniu homomorficznym (`c * c`), żeby zmniejszyć rozmiar szyfrogramu z powrotem do normalnego |
| `fernet_key.bin` | AES-CBC (Fernet) | **tylko Doctor Backend** | Do szyfrowania imion i płci przed wysłaniem do Compute Server, i do ich odszyfrowania przy pobieraniu |

### Jak Doctor Backend ładuje klucze przy każdym żądaniu

Klucze są wczytywane z dysku **przy każdym żądaniu** (nie trzymane w pamięci między żądaniami):

```python
def _load_he_full() -> Pyfhel:
    HE = Pyfhel()
    HE.load_context(CONTEXT_PATH)
    HE.load_public_key(PUBLIC_KEY_PATH)
    HE.load_secret_key(SECRET_KEY_PATH)   # ← klucz tajny
    HE.load_relin_key(RELIN_KEY_PATH)
    return HE

def _load_fernet() -> Fernet:
    with open(FERNET_KEY_PATH, "rb") as f:
        return Fernet(f.read())
```

Compute Server analogicznie ładuje swój niepełny zestaw (bez `secret_key`):

```python
def _load_he() -> Pyfhel:
    HE = Pyfhel()
    HE.load_context(CONTEXT_PATH)
    HE.load_public_key(PUBLIC_KEY_PATH)
    HE.load_relin_key(RELIN_KEY_PATH)
    return HE
    # brak load_secret_key — celowo
```

---

## Autoryzacja lekarza — JWT

### Co to JWT

JWT (JSON Web Token) to podpisany cyfrowo token. Składa się z trzech części oddzielonych kropką:
```
nagłówek.payload.podpis
```
Payload zawiera jawne dane (username, imię, specjalizacja, czas wygaśnięcia). Podpis jest generowany kluczem `JWT_SECRET` przechowywanym tylko na Doctor Backend — nikt z zewnątrz nie może sfałszować tokenu.

### Jak lekarz się loguje

```
[Przeglądarka]
  POST /auth/login {"username": "dr_kowalski", "password": "Doctor123!"}

[Doctor Backend]
  1. Sprawdza w słowniku DOCTORS czy username i password się zgadzają
  2. Jeśli tak — tworzy token:
     jwt.encode(
       {
         "username":  "dr_kowalski",
         "name":      "Dr Jan Kowalski",
         "specialty": "Kardiologia",
         "exp":       teraz + 8 godzin    ← token wygasa po 8h
       },
       JWT_SECRET,
       algorithm="HS256"
     )
  3. Zwraca token do przeglądarki

[Przeglądarka]
  Zapisuje token w localStorage
```

### Jak każde kolejne żądanie jest chronione

Każdy endpoint (poza `/auth/login`) jest opatrzony dekoratorem `@token_required`:

```python
def token_required(f):
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return 401  # brak tokenu

        token = auth[7:]  # wyciągnij token po "Bearer "
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        # jwt.decode rzuci wyjątek jeśli:
        #   - token jest sfałszowany (zły podpis)
        #   - token wygasł (exp < teraz)
        request.doctor = payload  # udostępnij dane lekarza w handlerze
    return decorated
```

Frontend wysyła token automatycznie w każdym żądaniu dzięki interceptorowi Axios:

```javascript
// services/api.js
axiosInstance.interceptors.request.use(config => {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

axiosInstance.interceptors.response.use(
    res => res,
    err => {
        if (err.response?.status === 401) {
            localStorage.removeItem("token");
            window.location.reload();  // wyrzuć na stronę logowania
        }
        return Promise.reject(err);
    }
);
```

### Konta testowe (hardcoded w app.py — tylko demo)

```python
DOCTORS = {
    "dr_kowalski": {"password": "Doctor123!", "name": "Dr Jan Kowalski",  "specialty": "Kardiologia"},
    "dr_nowak":    {"password": "Doctor123!", "name": "Dr Anna Nowak",    "specialty": "Diabetologia"},
}
```

W produkcji hasła powinny być hashowane (bcrypt) i trzymane w bazie danych, a `JWT_SECRET` powinien być losowym ciągiem z zmiennych środowiskowych.

### Compute Server nie ma autoryzacji

Compute Server nie sprawdza żadnych tokenów — zakłada, że jedynym klientem jest Doctor Backend działający w tej samej sieci Docker. Użytkownik z zewnątrz nie ma do niego dostępu (port 5002 nie jest wystawiony na zewnątrz w `docker-compose.yml`).

---

## Frontend — co widzi lekarz

**Zakładka: Pacjenci**
- Lista wszystkich pacjentów (imię, płeć, liczba badań)
- Widok szczegółowy: historia badań z color-codingiem każdego parametru
  - Zielony = w normie klinicznej
  - Żółty = blisko granicy normy
  - Czerwony = poza normą

**Zakładka: Nowy wpis**
- Formularz do dodania nowego pacjenta lub nowego badania istniejącego pacjenta
- 7 pól numerycznych + walidacja zakresów po stronie klienta
- Szyfrowanie wykonuje Doctor Backend (nie frontend!)

**Zakładka: Analizy**
- Statystyki populacji: histogram z color-codingiem, karta ze średnią/std/percentylami
- Porównanie wartości: z-score, percentyl, interpretacja słowna
- Profil pacjenta: wykres radarowy (z-score) + tabela dla wszystkich 7 pól

---

## Technologie

| Warstwa | Technologia | Do czego |
|---|---|---|
| Backend | Python 3.11 + Flask 3.0 | Serwery HTTP |
| HE | **Pyfhel 3.5.0** (wrapper na Microsoft SEAL w C++) | Szyfrowanie CKKS |
| Symetryczne | Cryptography (Fernet = AES-CBC + HMAC) | Szyfrowanie imion/płci |
| Auth | PyJWT 2.8.0 | Tokeny JWT |
| HTTP | Requests 2.31.0 | Komunikacja między serwisami |
| Dane NHANES | pyreadstat 1.2.8 | Odczyt pliku .xpt |
| Frontend | React 18, Axios, Recharts | UI i wykresy |
| Infrastruktura | Docker + Docker Compose + nginx | Konteneryzacja |

---

## Czego projekt NIE robi (ograniczenia demonstracyjne)

- Brak TLS/HTTPS — komunikacja HTTP (wystarczy dla demo lokalnego)
- Hasła lekarzy i JWT secret hardcoded w `app.py` (w produkcji: baza danych + zmienne środowiskowe)
- CKKS obsługuje maksymalnie ~1 mnożenie — wystarczy dla sumy i sumy kwadratów, ale nie dla bardziej złożonych operacji
- Każdy pacjent z NHANES pojawia się jeden raz w danych startowych (system obsługuje wiele badań, ale generowane dane mają po jednym)

---

## Podsumowanie w jednym zdaniu

System pokazuje, że serwer obliczeniowy może wyliczać statystyki (sumę, sumę kwadratów, a z nich: średnią, odchylenie standardowe, z-score, percentyle) **bez wiedzy o wartościach danych** — dzięki czemu kompromitacja serwera obliczeniowego nie ujawnia żadnych informacji o pacjentach.
