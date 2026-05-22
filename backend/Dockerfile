FROM python:3.12-slim

# App lives at /.orryon — not /code, /app, or /image-root (Railway volumes often mount those).
COPY backend/requirements.txt /.orryon/backend/requirements.txt
RUN pip install --no-cache-dir -r /.orryon/backend/requirements.txt

COPY config.py email_sender.py /.orryon/
COPY db/ /.orryon/db/
COPY core/ /.orryon/core/
COPY backend/ /.orryon/backend/

RUN chmod +x /.orryon/backend/start.sh \
 && test -f /.orryon/config.py \
 && mkdir -p /data

ENV PYTHONPATH=/.orryon
WORKDIR /.orryon

EXPOSE 8000

CMD ["sh", "/.orryon/backend/start.sh"]
