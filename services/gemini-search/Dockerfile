FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends chromium && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml .
COPY gemini_search/ gemini_search/
COPY gemini_search_mcp/ gemini_search_mcp/
COPY mcp_server.py .

RUN pip install --no-cache-dir -e .

ENV BROWSER_CHANNEL=chromium
EXPOSE 8080

CMD ["python", "-m", "gemini_search", "--port", "8080"]
