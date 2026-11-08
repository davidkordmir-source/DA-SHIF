"""Package the self-contained build; no network or runtime dependencies."""
from pathlib import Path
from shutil import copyfile
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
dist = root / 'dist'
copyfile(dist / 'index.html', dist / 'hamshift.html')
with ZipFile(dist / 'hamshift-offline.zip', 'w', compression=ZIP_DEFLATED) as bundle:
    bundle.write(dist / 'hamshift.html', 'hamshift.html')
    for name in ['شروع-هم‌شیفت.bat', 'راهنما.txt']:
        bundle.write(root / 'release' / name, name)
print('Offline HTML and ZIP ready in dist/')
