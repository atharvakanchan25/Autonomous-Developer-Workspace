FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --timeout=120 -i https://pypi.org/simple -r requirements.txt

COPY . .

EXPOSE 4000

CMD ["python", "run.py"]
