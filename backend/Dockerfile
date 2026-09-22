FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app/backend
COPY backend/requirements-runtime.txt ./
RUN pip install --no-cache-dir -r requirements-runtime.txt
COPY backend/*.py ./
COPY backend/routes ./routes
COPY frontend/src/lib/grcRules.json /app/frontend/src/lib/grcRules.json
COPY frontend/src/lib/managementRules.json /app/frontend/src/lib/managementRules.json
COPY frontend/src/lib/aiGovernanceCatalog.json /app/frontend/src/lib/aiGovernanceCatalog.json
COPY frontend/src/lib/frameworkDefinitions.json frontend/src/lib/cisIG1.json /app/frontend/src/lib/
COPY frontend/src/lib/evidenceSources.json /app/frontend/src/lib/evidenceSources.json
COPY frontend/src/lib/onboardingHandoffFields.json /app/frontend/src/lib/onboardingHandoffFields.json
RUN useradd --create-home --uid 10001 app
USER app
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
