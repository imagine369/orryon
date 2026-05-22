FROM python:3.12-slim

# Application code lives under /opt/orryon. Persist data only at /data (Railway volume).
# Never mount orryon-volume at /opt/orryon, /srv/orryon, or /app.
WORKDIR /opt/orryon
ENV PYTHONPATH=/opt/orryon

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY config.py email_sender.py db/ ./db/
COPY core/ ./core/
COPY backend/ ./backend/

RUN chmod +x backend/start.sh
RUN mkdir -p /data

EXPOSE 8000

CMD ["sh", "backend/start.sh"]
