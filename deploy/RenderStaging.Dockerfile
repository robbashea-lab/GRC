# The frontend stage never declares backend secret ARGs or copies .env files.
FROM node:22-bookworm-slim AS frontend
RUN npm install --global npm@12.2.3
WORKDIR /app/frontend
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile --non-interactive
COPY frontend/ ./
COPY shared/catalogs /app/shared/catalogs
RUN node scripts/staging.cjs

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends --only-upgrade libc6=2.41-12+deb13u5 libc-bin=2.41-12+deb13u5 zlib1g=1:1.3.dfsg+really1.3.1-1+deb13u1 && rm -rf /var/lib/apt/lists/*
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app/backend
COPY backend/requirements-runtime.txt ./
RUN python -m pip install --no-cache-dir --only-binary=:all: --upgrade pip==26.3 && python -m pip install --no-cache-dir -r requirements-runtime.txt
COPY backend/*.py ./
COPY backend/fonts ./fonts
COPY backend/common_passwords.txt ./
COPY backend/routes ./routes
COPY frontend/src/lib/*.json /app/frontend/src/lib/
COPY shared/catalogs /app/shared/catalogs
COPY --from=frontend /app/deploy/cloudflare/dist /app/frontend/build
COPY deploy/render_staging.py ./render_staging.py
RUN useradd --create-home --uid 10001 app
USER app
CMD ["sh", "-c", "uvicorn render_staging:app --host 0.0.0.0 --port ${PORT:-8000}"]
