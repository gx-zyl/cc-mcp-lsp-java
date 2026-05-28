# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///

"""
验证侧车 JAR 版本与 jacg-bridge.ts 中 SIDECAR_JAR_REL 配置一致。
在 git push 前执行，避免版本不匹配导致扩展加载失败。

用法: uv run .claude/hooks/check-jar-version.py
"""

import glob
import os
import re
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SIDECAR_DIR = os.path.join(PROJECT_ROOT, "java-sidecar", "target")
BRIDGE_FILE = os.path.join(PROJECT_ROOT, "src", "jacg-bridge.ts")


def find_built_jar_version() -> str | None:
    jars = glob.glob(os.path.join(SIDECAR_DIR, "*-jar-with-dependencies.jar"))
    if not jars:
        return None
    newest = max(jars, key=os.path.getmtime)
    m = re.search(r"jacg-sidecar-(.*)-jar-with-dependencies\.jar", os.path.basename(newest))
    return m.group(1) if m else None


def find_configured_version() -> str | None:
    if not os.path.isfile(BRIDGE_FILE):
        return None
    with open(BRIDGE_FILE, encoding="utf-8") as f:
        for line in f:
            m = re.search(r"SIDECAR_JAR_REL\s*=.*jacg-sidecar-(.*?)-jar-with-dependencies", line)
            if m:
                return m.group(1)
    return None


def main():
    built = find_built_jar_version()
    configured = find_configured_version()

    if not built:
        print("[!] No sidecar JAR found in java-sidecar/target/")
        print("  Run: cd java-sidecar && mvn package -DskipTests")
        sys.exit(1)

    if not configured:
        print("[!] SIDECAR_JAR_REL not found in src/jacg-bridge.ts")
        sys.exit(1)

    if built != configured:
        print(f"[ERR] JAR version mismatch!")
        print(f"   Build:    java-sidecar/target/jacg-sidecar-{built}-jar-with-dependencies.jar")
        print(f"   Config:   SIDECAR_JAR_REL = '...jacg-sidecar-{configured}-jar-with-dependencies.jar'")
        print(f"\n   Fix: update src/jacg-bridge.ts line to use version '{built}'")
        sys.exit(1)

    print(f"[OK] JAR version check passed: {built}")


if __name__ == "__main__":
    main()
