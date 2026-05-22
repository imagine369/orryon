FROM python:3.12-slim

# Primary app tree (may be shadowed if a Railway volume is mounted on /code).
# Immutable copy at /image-root — start.sh falls back here when config.py is missing.
WORKDIR /code
ENV PYTHONPATH=/code
ENV APP_ROOT=/code

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY config.py email_sender.py db/ ./db/
COPY core/ ./core/
COPY backend/ ./backend/

RUN chmod +x backend/start.sh \
 && cp -a /code /image-root \
 && mkdir -p /data

EXPOSE 8000

CMD ["sh", "backend/start.sh"]
