@echo off
echo Starting backend development server...
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
pause
