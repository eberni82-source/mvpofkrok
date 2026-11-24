import os,sys
from pathlib import Path
root=Path(__file__).resolve().parent.parent
python=root/'.venv/bin/python'
if not python.exists():
    print('Сначала: python3 -m venv .venv && .venv/bin/python -m pip install -r backend/requirements.txt');sys.exit(1)
os.chdir(root)
env_args=['--env-file',str(root/'.env')] if (root/'.env').exists() else []
os.execv(str(python),[str(python),'-m','uvicorn','backend.app:app','--host','127.0.0.1','--port',os.getenv('PORT','4173')]+env_args)
