# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///

"""
验证侧车 JAR 版本 + 推送前清理测试残留。

检查:
  1. jacg-bridge.ts 中的 SIDECAR_JAR_REL 与实际构建的 JAR 版本一致
  2. 推送前清理 _jacg_o_er/ 测试输出目录和旧 .vsix 文件
  3. 清理 java-sidecar/ 侧车工作残留目录

用法: python -m uv run .claude/hooks/check-jar-version.py
"""

import glob
import os
import re
import shutil
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SIDECAR_DIR = os.path.join(PROJECT_ROOT, "java-sidecar", "target")
BRIDGE_FILE = os.path.join(PROJECT_ROOT, "src", "jacg-bridge.ts")

# 需要清理的残留目录/文件模式（相对于 PROJECT_ROOT）
CLEANUP_PATTERNS = [
    "_jacg_o_er",           # JACG 测试输出
    "_jacg_gen_all_call_graph",  # 测试配置文件
    "_jacg_config",          # 测试配置文件
]


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


def clean_residue() -> int:
    """清理测试残留，返回删除的文件/目录数"""
    cleaned = 0
    for pattern in CLEANUP_PATTERNS:
        path = os.path.join(PROJECT_ROOT, pattern)
        if os.path.isdir(path):
            shutil.rmtree(path, ignore_errors=True)
            print(f"  cleaned: {pattern}/")
            cleaned += 1
    # 清理 .vsix 构建产物
    for f in glob.glob(os.path.join(PROJECT_ROOT, "*.vsix")):
        os.remove(f)
        print(f"  cleaned: {os.path.basename(f)}")
        cleaned += 1
    # 清理 java-sidecar/target/ 下的旧版本 JAR
    jars = glob.glob(os.path.join(SIDECAR_DIR, "jacg-sidecar-*.jar"))
    # 保留最新那个，删旧的
    if len(jars) > 2:  # sidecar.jar + sidecar-jar-with-deps.jar = 2 个是正常的
        jars.sort(key=os.path.getmtime)
        for old in jars[:-2]:
            os.remove(old)
            print(f"  cleaned: java-sidecar/target/{os.path.basename(old)}")
            cleaned += 1
    return cleaned


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

    # 清理测试残留
    n = clean_residue()
    if n > 0:
        print(f"[OK] Cleaned {n} test residue file(s)")
    else:
        print("[OK] No test residue found")


if __name__ == "__main__":
    main()
