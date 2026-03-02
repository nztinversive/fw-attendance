@echo off
py -m uvicorn main:app --host 0.0.0.0 --port 5557 --reload
