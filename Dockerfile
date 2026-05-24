# =============================================================================
# Stage 1 — data-builder
#   Generuje zaszyfrowaną bazę danych CKKS i klucze.
#   Ta warstwa jest współdzielona między compute_server i doctor_backend.
# =============================================================================
FROM python:3.11-slim AS data-builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir tenseal==0.3.16 numpy==1.26.4

COPY data_generator/ ./data_generator/

RUN mkdir -p compute_server/data doctor_backend/keys \
    && cd data_generator \
    && python generate_data.py \
    && python encrypt_data.py


# =============================================================================
# Stage 2 — compute_server
#   Serwer obliczeniowy (Flask :5002).
#   Posiada TYLKO klucz publiczny — nie może odszyfrować danych.
# =============================================================================
FROM python:3.11-slim AS compute_server

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY compute_server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY compute_server/ .

# Skopiuj wygenerowane zaszyfrowane dane i klucz publiczny
COPY --from=data-builder /build/compute_server/data/patients_encrypted.csv ./data/
COPY --from=data-builder /build/compute_server/data/public_context.bin      ./data/

EXPOSE 5002

HEALTHCHECK --interval=20s --timeout=8s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5002/health')" || exit 1

CMD ["python", "app.py"]


# =============================================================================
# Stage 3 — doctor_backend
#   Backend lekarza (Flask :5001).
#   Posiada klucz tajny — jedyny punkt odszyfrowywania danych.
# =============================================================================
FROM python:3.11-slim AS doctor_backend

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY doctor_backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY doctor_backend/ .

# Skopiuj klucz tajny — tylko ten serwis go posiada
COPY --from=data-builder /build/doctor_backend/keys/secret_context.bin ./keys/

EXPOSE 5001

HEALTHCHECK --interval=20s --timeout=8s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5001/meta/fields')" || exit 1

CMD ["python", "app.py"]


# =============================================================================
# Stage 4 — frontend-builder
#   Buduje produkcyjną paczkę React.
# =============================================================================
FROM node:18-alpine AS frontend-builder

WORKDIR /app

COPY frontend/package.json .
RUN npm install --silent

COPY frontend/ .
RUN npm run build


# =============================================================================
# Stage 5 — frontend
#   Serwuje zbudowany React przez nginx (:80 → mapowane na :3000).
# =============================================================================
FROM nginx:alpine AS frontend

COPY --from=frontend-builder /app/build /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
