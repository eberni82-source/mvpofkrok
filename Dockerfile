FROM python:3.13-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt && useradd --create-home cursor
COPY --chown=cursor:cursor backend backend
COPY --chown=cursor:cursor alembic.ini index.html ./
COPY --chown=cursor:cursor src src
COPY --chown=cursor:cursor assets assets
USER cursor
CMD ["sh", "-c", "exec uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
