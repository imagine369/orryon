FROM python:3.12-slim

ARG CACHEBUST=1
WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY config.py email_sender.py db.py ./
COPY core/ ./core/
COPY backend/ ./backend/

EXPOSE 8000

CMD ["sh", "-c", "echo 'Starting orryon backend on port ${PORT:-8000}...' && python -c 'import backend.main; print(\"Imports OK\")' && exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
