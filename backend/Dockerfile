# Cloud Run: one container, listens on $PORT, no state on local disk.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Cloud Run injects PORT and expects the server on 0.0.0.0. The Memory Bank
# falls back to a JSON snapshot when MONGO_URI is unreachable, so the container
# boots and serves with or without a database attached.
ENV PORT=8080
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
