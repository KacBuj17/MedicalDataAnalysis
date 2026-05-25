FROM python:3.11-slim AS pyfhel-base

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 cmake g++ make git \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch v3.5.0 --recurse-submodules \
    https://github.com/ibarrond/Pyfhel.git /tmp/Pyfhel && \
    pip install --no-cache-dir /tmp/Pyfhel && \
    rm -rf /tmp/Pyfhel


FROM pyfhel-base AS data-builder

WORKDIR /build

RUN pip install --no-cache-dir pyreadstat==1.2.8 cryptography==42.0.8

COPY data_generator/ ./data_generator/

RUN mkdir -p compute_server/data doctor_backend/keys \
    && cd data_generator \
    && python generate_data.py \
    && python encrypt_data.py


FROM pyfhel-base AS compute_server

WORKDIR /app

COPY compute_server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY compute_server/ .

COPY --from=data-builder /build/compute_server/data/patients_encrypted.csv ./data/
COPY --from=data-builder /build/compute_server/data/context.bin             ./data/
COPY --from=data-builder /build/compute_server/data/public_key.bin          ./data/
COPY --from=data-builder /build/compute_server/data/relin_key.bin           ./data/

EXPOSE 5002

HEALTHCHECK --interval=20s --timeout=10s --start-period=60s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5002/health')" || exit 1

CMD ["python", "app.py"]


FROM pyfhel-base AS doctor_backend

WORKDIR /app

COPY doctor_backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY doctor_backend/ .

COPY --from=data-builder /build/doctor_backend/keys/context.bin    ./keys/
COPY --from=data-builder /build/doctor_backend/keys/public_key.bin ./keys/
COPY --from=data-builder /build/doctor_backend/keys/secret_key.bin ./keys/
COPY --from=data-builder /build/doctor_backend/keys/relin_key.bin  ./keys/
COPY --from=data-builder /build/doctor_backend/keys/fernet_key.bin ./keys/

EXPOSE 5001

HEALTHCHECK --interval=20s --timeout=10s --start-period=60s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5001/meta/fields')" || exit 1

CMD ["python", "app.py"]


FROM node:18-alpine AS frontend-builder

WORKDIR /app

COPY frontend/package.json .
RUN npm install --silent

COPY frontend/ .
RUN npm run build


FROM nginx:alpine AS frontend

COPY --from=frontend-builder /app/build /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
