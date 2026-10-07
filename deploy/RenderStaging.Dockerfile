# The frontend stage never declares backend secret ARGs or copies .env files.
FROM node:22-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile --non-interactive
COPY frontend/ ./
COPY shared/catalogs /app/shared/catalogs
RUN node scripts/staging.cjs

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app/backend
COPY backend/requirements-runtime.txt ./
RUN pip install --no-cache-dir -r requirements-runtime.txt
COPY backend/*.py ./
COPY backend/common_passwords.txt ./
COPY backend/routes ./routes
COPY frontend/src/lib/*.json /app/frontend/src/lib/
COPY shared/catalogs /app/shared/catalogs
COPY --from=frontend /app/deploy/cloudflare/dist /app/frontend/build
COPY deploy/render_staging.py ./render_staging.py
RUN useradd --create-home --uid 10001 app
USER app
CMD ["sh", "-c", "uvicorn render_staging:app --host 0.0.0.0 --port ${PORT:-8000}"]
