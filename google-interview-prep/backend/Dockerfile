FROM python:3.12-slim

WORKDIR /app

# System deps some Python packages need (build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Cloud Run injects $PORT at runtime (defaults to 8080); fall back for local docker
ENV PORT=8080
EXPOSE 8080

# Use shell form so $PORT is expanded at container start time
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT}
