import importlib.util
from pathlib import Path


root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "deploy_tibiago",
    root / "scripts" / "deploy-tibiago.py",
)
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)

merged = deploy.merge_preserved_remote_env(
    "USE_EMBEDDED_DB=false\nPORT=2530\n",
    "USE_EMBEDDED_DB=true\nDATABASE_URL=postgresql://secret\nHMAC_SHARED_SECRET=secret2\n",
)
assert "USE_EMBEDDED_DB=false\n" in merged
assert "DATABASE_URL=postgresql://secret\n" in merged
assert "HMAC_SHARED_SECRET=secret2\n" in merged

explicit = deploy.merge_preserved_remote_env(
    "DATABASE_URL=postgresql://local\n",
    "DATABASE_URL=postgresql://remote\n",
)
assert "DATABASE_URL=postgresql://local\n" in explicit
assert "postgresql://remote" not in explicit

print("Deploy runtime environment preservation tests passed.")
