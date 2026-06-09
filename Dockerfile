# ──── Stage 1: Build frontend ────
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ──── Stage 2: Production image ────
FROM python:3.11-slim

WORKDIR /app

# Dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend
COPY server/ ./server/

# Built frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Config
COPY .env.example ./env.example

ENV LIFEOS_ENABLE_SHELL=0
ENV PORT=8700

EXPOSE 8700

CMD ["python", "-m", "server.main"]
