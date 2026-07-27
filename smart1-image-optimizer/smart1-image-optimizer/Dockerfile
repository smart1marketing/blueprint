FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends gifsicle pngquant \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

ENV PORT=10000
ENV MAX_UPLOAD_MB=40
EXPOSE 10000

CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:${PORT} --workers 2 --threads 4 --timeout 120"]
