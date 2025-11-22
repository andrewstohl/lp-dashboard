FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code - maintain backend directory structure
COPY . ./backend

# Set Python path so imports work
ENV PYTHONPATH=/app

# Expose port
EXPOSE 8004

# Run the application
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8004"]
