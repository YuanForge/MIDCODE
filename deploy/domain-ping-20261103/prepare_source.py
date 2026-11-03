"""Apply this release to the exact production source snapshot, preserving other features.

Usage: python prepare_source.py SOURCE_ARCHIVE NEW_OUTPUT_DIRECTORY
The source archive is retained privately with the deployment, not committed.
"""
import hashlib
from pathlib import Path
import shutil
import sys
import tarfile

ARCHIVE_SHA256 = "bf47c37999b79ae656c938bdddc35c1e1987267f3937ffaca525ef5d1d73e4cf"
archive, output = Path(sys.argv[1]), Path(sys.argv[2])
assert hashlib.sha256(archive.read_bytes()).hexdigest() == ARCHIVE_SHA256
assert not output.exists(), "Use a new output directory"
output.mkdir(parents=True)
with tarfile.open(archive) as source:
    for member in source.getmembers():
        target = (output / member.name).resolve()
        assert target.is_relative_to(output.resolve())
        assert not member.issym() and not member.islnk()
    source.extractall(output, filter="data")

repository = Path(__file__).resolve().parents[2]
for relative in [
    "internal/handler/admin_ping.go",
    "internal/handler/admin_ping_test.go",
    "web/app/src/pages/admin/ServerPingCard.tsx",
    "web/app/src/pages/admin/AdminDashboardPage.tsx",
]:
    shutil.copyfile(repository / relative, output / relative)

api = output / "web/app/src/lib/api/admin.ts"
text = api.read_text(encoding="utf-8-sig")
if "export type AdminServerPing" not in text:
    text = text.replace(
        "const http = createHttpClient('admin')",
        "const http = createHttpClient('admin')\n\n"
        "export type AdminServerPing = { target: string; status: 'ok' | 'timeout' | 'error'; "
        "latency_ms: number | null; less_than: boolean; checked_at: string; message?: string }",
    )
if "getServerPing:" not in text:
    text = text.replace(
        "export const adminApi = {",
        "export const adminApi = {\n"
        "  getServerPing: (signal: AbortSignal) => http.get<AdminServerPing>"
        "('/admin/server-ping', { signal, timeout: 5000 }),",
    )
assert "getServerPing:" in text
api.write_text(text, encoding="utf-8", newline="\n")
router = (output / "internal/router/admin.go").read_text()
assert 'admin.GET("/server-ping", handler.GetAdminServerPing)' in router
print("Production source overlay ready")
