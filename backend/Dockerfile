FROM python:3.12-slim

WORKDIR /app
# Project-root modules (config.py, db/, core/) must resolve when backend/* does `from config import …`
ENV PYTHONPATH=/app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY config.py email_sender.py db/ ./db/
COPY core/ ./core/
COPY backend/ ./backend/

RUN chmod +x backend/start.sh

RUN mkdir -p /data

EXPOSE 8000

CMD ["sh", "backend/start.sh"]
