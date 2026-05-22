FROM python:3.12-slim

# Keep application code outside /app so a Railway volume mounted at /app cannot
# hide config.py, db/, and core/ (a common misconfiguration).
WORKDIR /srv/orryon
ENV PYTHONPATH=/srv/orryon

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY config.py email_sender.py db/ ./db/
COPY core/ ./core/
COPY backend/ ./backend/

RUN chmod +x backend/start.sh
RUN mkdir -p /data

EXPOSE 8000

CMD ["sh", "backend/start.sh"]
