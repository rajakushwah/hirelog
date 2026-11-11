# Single image: builds the React app, then serves it and the API from one origin.
FROM node:24-alpine AS frontend
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    HIRELOG_ENV=production \
    HIRELOG_STORAGE_DIR=/data/uploads \
    HIRELOG_ANDROID_APK_PATH=/data/downloads/hirelog.apk \
    HIRELOG_FRONTEND_DIST=/app/frontend/dist
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
COPY backend/app ./app
COPY backend/migrations ./migrations
COPY backend/alembic.ini ./
COPY --from=frontend /src/dist /app/frontend/dist
RUN useradd --system --uid 10001 --home /nonexistent hirelog \
 && mkdir -p /data/uploads /data/downloads && chown -R hirelog /data && chmod 700 /data
USER hirelog
VOLUME ["/data"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
# --proxy-headers so client IPs (rate limiting) come from the TLS proxy in front; single worker because the rate limiter is in-memory.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*", "--workers", "1"]
