FROM python:3.12-slim

# Application code lives outside common Railway volume mount paths (/app, /opt/orryon).
# Persist data only at /data — never mount a volume over /usr/local/lib/orryon.
WORKDIR /usr/local/lib/orryon
ENV PYTHONPATH=/usr/local/lib/orryon
ENV APP_ROOT=/usr/local/lib/orryon

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY config.py email_sender.py db/ ./db/
COPY core/ ./core/
COPY backend/ ./backend/

RUN chmod +x backend/start.sh
RUN mkdir -p /data

EXPOSE 8000

CMD ["sh", "backend/start.sh"]
