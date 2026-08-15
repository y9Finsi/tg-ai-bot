FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SEMANTICA_BACKEND=semantica \
    SEMANTICA_STATE_PATH=/data/semantica-state.json

WORKDIR /app

COPY pyproject.toml README.md ./
COPY src ./src

ARG INSTALL_SEMANTICA=1
RUN python -m pip install --no-cache-dir --upgrade pip \
    && if [ "$INSTALL_SEMANTICA" = "1" ]; then \
         python -m pip install --no-cache-dir ".[semantica]"; \
       else \
         python -m pip install --no-cache-dir .; \
       fi

RUN useradd --create-home --uid 10001 sidecar \
    && mkdir -p /data \
    && chown sidecar:sidecar /data

USER sidecar

EXPOSE 8081

CMD ["uvicorn", "semantica_service.main:app", "--host", "0.0.0.0", "--port", "8081"]

