"""System service management — install/uninstall/status for launchd (macOS) or systemd (Linux).

Borrowed from openilink-app-runner's daemon.js design. Generates plist/unit files
automatically with correct PATH, working directory, and environment variables.
"""
from __future__ import annotations

import os
import sys
import platform
import subprocess
from pathlib import Path

# ── Service metadata ──

SERVICE_NAME = "com.welian.bot"
AGENT_SERVICE_NAME = "com.welian.agent"
WELIAN_HOME = Path(os.environ.get("WELIAN_HOME", os.path.expanduser("~/.welian")))
LOG_DIR = WELIAN_HOME / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

# Python executable
PYTHON_BIN = sys.executable or "/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/bin/python3"

# Full PATH including ~/.local/bin (where devin lives) and homebrew
FULL_PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/{}/.local/bin:/Users/{}/Library/Python/3.9/bin".format(
    os.environ.get("USER", "cyingfang"),
    os.environ.get("USER", "cyingfang"),
)


def _get_env_vars() -> dict:
    """Collect environment variables for the service."""
    env = {}
    for key in ("WELIAN_BOT_TOKEN", "WELIAN_CLOUD_URL", "WELIAN_USER_TOKEN",
                "WELIAN_SYNC_SECRET", "WELIAN_HOME"):
        val = os.environ.get(key, "")
        if val:
            env[key] = val
    env["PATH"] = FULL_PATH
    return env


# ── macOS launchd ──

def _launchd_plist(service_name: str, program_args: list, env: dict, work_dir: str) -> str:
    """Generate a launchd plist XML string."""
    env_xml = "\n".join(
        f"        <key>{k}</key>\n        <string>{v}</string>"
        for k, v in env.items()
    )

    args_xml = "\n".join(f"        <string>{a}</string>" for a in program_args)

    log_prefix = LOG_DIR / service_name.replace("com.welian.", "")

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{service_name}</string>

    <key>ProgramArguments</key>
    <array>
{args_xml}
    </array>

    <key>EnvironmentVariables</key>
    <dict>
{env_xml}
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
        <key>Crashed</key>
        <true/>
    </dict>

    <key>ThrottleInterval</key>
    <integer>10</integer>

    <key>StandardOutPath</key>
    <string>{log_prefix}-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>{log_prefix}-stderr.log</string>

    <key>WorkingDirectory</key>
    <string>{work_dir}</string>
</dict>
</plist>
"""


def install_launchd(service_name: str, plist_path: Path, program_args: list,
                    env: dict, work_dir: str):
    """Install a launchd service."""
    plist_xml = _launchd_plist(service_name, program_args, env, work_dir)
    plist_path.parent.mkdir(parents=True, exist_ok=True)
    plist_path.write_text(plist_xml, encoding="utf-8")

    # Unload if already loaded
    try:
        subprocess.run(["launchctl", "unload", str(plist_path)],
                       capture_output=True, timeout=5)
    except Exception:
        pass

    subprocess.run(["launchctl", "load", str(plist_path)], check=True, timeout=10)
    print(f"✅ 已安装 launchd 服务: {service_name}")
    print(f"   plist: {plist_path}")
    print(f"   日志: {LOG_DIR}/{service_name.replace('com.welian.', '')}-stdout.log")


def uninstall_launchd(service_name: str, plist_path: Path):
    """Uninstall a launchd service."""
    try:
        subprocess.run(["launchctl", "unload", str(plist_path)],
                       capture_output=True, timeout=5)
    except Exception:
        pass
    if plist_path.exists():
        plist_path.unlink()
    print(f"✅ 已卸载 launchd 服务: {service_name}")


def status_launchd(service_name: str) -> str:
    """Check launchd service status."""
    try:
        result = subprocess.run(
            ["launchctl", "list"],
            capture_output=True, text=True, timeout=5,
        )
        for line in result.stdout.split("\n"):
            if service_name in line:
                parts = line.split()
                pid = parts[0] if parts else "?"
                if pid != "-":
                    return f"🟢 运行中 (PID {pid})"
                return "⚫ 已停止"
        return "⚪ 未安装"
    except Exception as e:
        return f"❓ 查询失败: {e}"


# ── Linux systemd ──

def _systemd_unit(service_name: str, program_args: list, env: dict, work_dir: str) -> str:
    """Generate a systemd user unit file."""
    unit_name = service_name.replace(".", "-")
    env_lines = "\n".join(f"Environment={k}={v}" for k, v in env.items())
    exec_start = " ".join(program_args)

    return f"""[Unit]
Description=Welian Bot Service ({service_name})
After=network.target

[Service]
Type=simple
ExecStart={exec_start}
WorkingDirectory={work_dir}
Restart=always
RestartSec=5
{env_lines}

[Install]
WantedBy=default.target
"""


def install_systemd(service_name: str, unit_path: Path, program_args: list,
                    env: dict, work_dir: str):
    """Install a systemd user service."""
    unit_content = _systemd_unit(service_name, program_args, env, work_dir)
    unit_path.parent.mkdir(parents=True, exist_ok=True)
    unit_path.write_text(unit_content, encoding="utf-8")

    unit_name = unit_path.stem
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "--user", "enable", unit_name], check=True)
    subprocess.run(["systemctl", "--user", "start", unit_name], check=True)

    # Enable lingering
    try:
        username = os.environ.get("USER", "")
        subprocess.run(["loginctl", "enable-linger", username],
                       capture_output=True, timeout=5)
    except Exception:
        pass

    print(f"✅ 已安装 systemd 服务: {unit_name}")
    print(f"   unit: {unit_path}")


def uninstall_systemd(service_name: str, unit_path: Path):
    """Uninstall a systemd user service."""
    unit_name = unit_path.stem
    try:
        subprocess.run(["systemctl", "--user", "stop", unit_name], capture_output=True)
    except Exception:
        pass
    try:
        subprocess.run(["systemctl", "--user", "disable", unit_name], capture_output=True)
    except Exception:
        pass
    if unit_path.exists():
        unit_path.unlink()
        subprocess.run(["systemctl", "--user", "daemon-reload"], capture_output=True)
    print(f"✅ 已卸载 systemd 服务: {unit_name}")


def status_systemd(service_name: str, unit_path: Path) -> str:
    """Check systemd service status."""
    if not unit_path.exists():
        return "⚪ 未安装"
    unit_name = unit_path.stem
    try:
        result = subprocess.run(
            ["systemctl", "--user", "status", unit_name],
            capture_output=True, text=True, timeout=5,
        )
        if "active (running)" in result.stdout:
            return "🟢 运行中"
        elif "inactive" in result.stdout:
            return "⚫ 已停止"
        elif "failed" in result.stdout:
            return "🔴 已崩溃"
        return "❓ " + result.stdout[:100]
    except Exception as e:
        return f"❓ 查询失败: {e}"


# ── Public API ──

def install(service: str = "bot"):
    """Install welian service as system service."""
    env = _get_env_vars()
    home = os.path.expanduser("~")
    is_mac = platform.system() == "Darwin"

    if service == "bot":
        service_name = SERVICE_NAME
        program_args = [PYTHON_BIN, "-m", "welian.bot.handler"]
    elif service == "agent":
        service_name = AGENT_SERVICE_NAME
        program_args = [PYTHON_BIN, "-m", "welian.cli", "agent",
                        "--port", "9800", "--token", "welian2026", "--tunnel"]
    else:
        print(f"未知服务: {service}（可选: bot, agent）")
        return

    if is_mac:
        plist_path = Path(home) / "Library/LaunchAgents" / f"{service_name}.plist"
        install_launchd(service_name, plist_path, program_args, env, home)
    else:
        unit_name = service_name.replace(".", "-")
        unit_path = Path(home) / ".config/systemd/user" / f"{unit_name}.service"
        install_systemd(service_name, unit_path, program_args, env, home)


def uninstall(service: str = "bot"):
    """Uninstall welian service."""
    home = os.path.expanduser("~")
    is_mac = platform.system() == "Darwin"

    if service == "bot":
        service_name = SERVICE_NAME
    elif service == "agent":
        service_name = AGENT_SERVICE_NAME
    else:
        print(f"未知服务: {service}（可选: bot, agent）")
        return

    if is_mac:
        plist_path = Path(home) / "Library/LaunchAgents" / f"{service_name}.plist"
        uninstall_launchd(service_name, plist_path)
    else:
        unit_name = service_name.replace(".", "-")
        unit_path = Path(home) / ".config/systemd/user" / f"{unit_name}.service"
        uninstall_systemd(service_name, unit_path)


def status(service: str = "all"):
    """Check service status."""
    is_mac = platform.system() == "Darwin"
    home = os.path.expanduser("~")

    services = ["bot", "agent"] if service == "all" else [service]

    for svc in services:
        if svc == "bot":
            name = SERVICE_NAME
        elif svc == "agent":
            name = AGENT_SERVICE_NAME
        else:
            continue

        if is_mac:
            s = status_launchd(name)
        else:
            unit_name = name.replace(".", "-")
            unit_path = Path(home) / ".config/systemd/user" / f"{unit_name}.service"
            s = status_systemd(name, unit_path)

        print(f"  {svc}: {s}")


# ── CLI entry ──

def main():
    """CLI: python -m welian.bot.service [install|uninstall|status] [bot|agent|all]"""
    if len(sys.argv) < 2:
        print("用法: python -m welian.bot.service <install|uninstall|status> [bot|agent|all]")
        print("  install   — 注册为系统服务（launchd/systemd），开机自启")
        print("  uninstall — 卸载系统服务")
        print("  status    — 查看服务状态")
        sys.exit(1)

    action = sys.argv[1]
    target = sys.argv[2] if len(sys.argv) > 2 else "all"

    if action == "install":
        if target == "all":
            install("bot")
            install("agent")
        else:
            install(target)
    elif action == "uninstall":
        if target == "all":
            uninstall("bot")
            uninstall("agent")
        else:
            uninstall(target)
    elif action == "status":
        status(target)
    else:
        print(f"未知操作: {action}")
        print("可用: install, uninstall, status")
        sys.exit(1)


if __name__ == "__main__":
    main()
