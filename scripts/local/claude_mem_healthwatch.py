#!/usr/bin/env python3
"""Local healthwatch: pinned Codex primary, Gemini OAuth CLI fallback.
No Claude inference, probes, or automatic restoration. Worker dispatch owns fallback.
"""
import argparse
import datetime as dt
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

DATA = Path.home() / ".claude-mem"
SETTINGS = DATA / "settings.json"
HEALTH_FILE = DATA / "observer-health.json"
QUOTA_FILE = DATA / "quota-cooldown.json"
SUPERVISOR_FILE = DATA / "supervisor.json"
WORKER_PID = DATA / "worker.pid"
DB = DATA / "claude-mem.db"
SYNC_STATUS = DATA / "folder-sync" / "status.json"
HERE = DATA / "healthwatch"
STATE = HERE / "state.json"

RENOTIFY_S = 60 * 60
STALL_S = 2 * 60 * 60  # 有新会话但超过 2 小时没有成功写入
SELF = str(Path(__file__).resolve())



def switch_hint(provider):
    return "记忆固定使用 Codex，备用 Gemini（AGY 本机登录）；请检查本机登录状态。"


def log(msg):
    print("[%s] %s" % (dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), msg), flush=True)


def load_json(p, default=None):
    try:
        return json.loads(p.read_text())
    except (OSError, ValueError):
        return default


def worker_health():
    port = (load_json(WORKER_PID, {}) or {}).get("port", 37701)
    try:
        with urllib.request.urlopen("http://127.0.0.1:%s/api/health" % port, timeout=5) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"_error": repr(e)}


def latest_session_ms():
    try:
        con = sqlite3.connect("file:%s?mode=ro" % DB, uri=True, timeout=5)
        row = con.execute("select max(started_at_epoch) from sdk_sessions").fetchone()
        con.close()
        return row[0] or 0
    except sqlite3.Error:
        return 0


def check():
    """返回 {问题键: 说明}，空字典表示健康。"""
    issues = {}
    settings = load_json(SETTINGS, {}) or {}
    provider = settings.get("CLAUDE_MEM_PROVIDER", "claude")
    fallback = settings.get("CLAUDE_MEM_QUOTA_FALLBACK_PROVIDER", "")
    SWITCH_HINT = switch_hint(provider)

    h = worker_health()
    if "_error" in h:
        issues["worker_down"] = "worker 无法连接（%s）。请检查本机 worker 服务。" % h["_error"][:80]
    else:
        if h.get("status") != "ok" or not h.get("initialized"):
            issues["worker_unhealthy"] = "worker 状态异常：status=%s initialized=%s" % (h.get("status"), h.get("initialized"))
        if (h.get("dependencies") or {}).get("degraded"):
            issues["deps_degraded"] = "依赖降级：%s" % json.dumps(h["dependencies"].get("statuses"), ensure_ascii=False)[:150]
        last = (h.get("ai") or {}).get("lastInteraction") or {}
        if last and last.get("success") is False:
            issues["ai_last_failed"] = "%s 最近一次调用失败。%s" % (provider, SWITCH_HINT)

    oh = load_json(HEALTH_FILE, {}) or {}
    now_ms = time.time() * 1000
    last_ok = oh.get("lastSuccessAt") or 0
    last_err = oh.get("lastErrorAt") or 0
    if oh.get("consecutiveFailures", 0) >= 3 and last_err > last_ok:
        issues["observer_failing"] = "%s 连续失败 %s 次：%s。%s" % (
            oh.get("lastErrorProvider") or provider, oh["consecutiveFailures"],
            (oh.get("lastErrorMessage") or "")[:120], SWITCH_HINT)
    qc = oh.get("quotaCooldown") or {}
    if qc.get("active") and qc.get("provider") == provider and (qc.get("until") or 0) > now_ms:
        until = qc.get("until")
        until_s = dt.datetime.fromtimestamp(until / 1000).strftime("%H:%M") if isinstance(until, (int, float)) else "?"
        serving = (qc.get("notice") or {}).get("servingProvider") or qc.get("servingProvider")
        if serving:
            issues["quota_fallback"] = "%s 额度冷却至 %s，已由备选 %s（%s）接管。" % (
                qc.get("provider"), until_s, serving,
                settings.get("CLAUDE_MEM_QUOTA_FALLBACK_MODEL") or "默认模型")
        else:
            issues["quota_blocked"] = "%s 额度冷却至 %s，当前没有已接管的 provider，记忆暂停写入。%s" % (qc.get("provider"), until_s, SWITCH_HINT)

    sync = load_json(SYNC_STATUS) if SYNC_STATUS.exists() else None
    if sync is not None:
        try:
            age_s = time.time() - dt.datetime.fromisoformat(sync["checked_at"]).timestamp()
        except (KeyError, ValueError):
            age_s = None
        if sync.get("status") != "ok":
            hint = "（OneDrive 权限被拒：给 /Library/Developer/CommandLineTools/usr/bin/python3 开“完全磁盘访问”）" \
                if sync.get("error") == "PermissionError" else ""
            issues["sync_error"] = "跨设备同步失败：%s%s" % (sync.get("error") or sync.get("status"), hint)
        elif age_s is None or age_s > 15 * 60:
            issues["sync_stale"] = "跨设备同步已超过 15 分钟没有运行（ai.claude-mem.folder-sync）。"

    newest = latest_session_ms()
    # 时间戳均为毫秒；STALL_S 是秒
    if last_ok and newest > last_ok and now_ms - last_ok > STALL_S * 1000 and now_ms - newest < STALL_S * 1000:
        issues["stalled"] = "最近有新会话，但已 %d 分钟没有成功写入记忆。%s" % ((now_ms - last_ok) / 60000, SWITCH_HINT)
    return issues


def notify(title, body):
    script = "display notification %s with title %s sound name \"Basso\"" % (json.dumps(body), json.dumps(title))
    subprocess.run(["osascript", "-e", script], capture_output=True)


def backup_settings():
    backup = SETTINGS.with_name("settings.json.bak-%s" % dt.datetime.now().strftime("%Y%m%d%H%M%S"))
    shutil.copy2(SETTINGS, backup)
    return backup


def write_settings(s):
    """原子替换，避免 worker 读到写了一半的文件。"""
    tmp = SETTINGS.with_name(SETTINGS.name + ".tmp")
    tmp.write_text(json.dumps(s, ensure_ascii=False, indent=2) + "\n")
    os.chmod(tmp, SETTINGS.stat().st_mode & 0o777)
    os.replace(tmp, SETTINGS)


def write_json_atomic(p, data):
    tmp = p.with_name(p.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    if p.exists():
        os.chmod(tmp, p.stat().st_mode & 0o777)
    os.replace(tmp, p)


def nudge_worker():
    """唤醒 worker 立即处理挂起的会话队列，无需等待 60 秒 periodic-resume。"""
    port = (load_json(WORKER_PID, {}) or {}).get("port", 37777)
    req = urllib.request.Request(
        "http://127.0.0.1:%s/api/processing" % port,
        data=b'{"isProcessing":false}',
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=3):
            pass
    except Exception:
        pass


def error_signature(oh):
    """错误归类：优先用 lastErrorKind，否则取消息去掉数字后的前 80 字符。"""
    msg = re.sub(r"\d+", "#", (oh.get("lastErrorMessage") or "").strip())[:80]
    return "%s|%s" % (oh.get("lastErrorKind") or "", msg)


PINNED_POLICY = {
    "CLAUDE_MEM_PROVIDER": "codex",
    "CLAUDE_MEM_CODEX_MODEL": "gpt-6.1-sol",
    "CLAUDE_MEM_PROVIDER_BY_SOURCE": "",
    "CLAUDE_MEM_QUOTA_FALLBACK_PROVIDER": "gemini",
    "CLAUDE_MEM_QUOTA_FALLBACK_MODEL": "",
    "CLAUDE_MEM_QUOTA_FALLBACK_AUTH_METHOD": "",
    "CLAUDE_MEM_GEMINI_AUTH_METHOD": "cli",
    "CLAUDE_MEM_GEMINI_CLI_PATH": str(Path.home() / ".local/bin/agy"),
    "CLAUDE_MEM_GEMINI_MODEL": "gemini-4-hydrogen",
    "CLAUDE_MEM_WORK_VIEW_AGENT": "codex",
}


def auto_failover(state, force_probe=False, force_reason=None):
    """Enforce the owner's Codex primary; never probe or restore Claude."""
    settings = load_json(SETTINGS)
    if settings is None:
        return None
    cleared = state.pop("failover", None) is not None
    changed = any(settings.get(k) != v for k, v in PINNED_POLICY.items())
    if changed:
        backup_settings()
        settings.update(PINNED_POLICY)
        write_settings(settings)
        nudge_worker()
    return "Codex primary / Gemini CLI fallback policy applied" if changed or cleared else None


def handle_stop_failure_hook():
    # Claude session errors do not control this installation's memory provider.
    return 0


def switch(target):
    if target != "codex":
        raise ValueError("This installation permits only Codex primary and Gemini CLI fallback")
    state = load_json(STATE, {}) or {}
    action = auto_failover(state)
    write_json_atomic(STATE, state)
    print(action or "Codex primary already pinned")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--switch", choices=["codex"])
    ap.add_argument("--failover", action="store_true")
    ap.add_argument("--on-stop-failure", action="store_true")
    args = ap.parse_args()
    if args.on_stop_failure:
        return handle_stop_failure_hook()
    if args.switch:
        switch(args.switch)
        return 0

    if args.status:
        out = check() or {"ok": "claude-mem 健康"}
        fo = (load_json(STATE, {}) or {}).get("failover")
        if fo:
            out["auto_failover"] = "自 %s 起因 %s 由 Codex 接管" % (fo.get("since"), fo.get("reason"))
        print(json.dumps(out, ensure_ascii=False, indent=1))
        return 0

    state = load_json(STATE, {}) or {}
    action = auto_failover(state, force_probe=args.failover)
    if action:
        notify("claude-mem 自动切换", action)
    if args.failover:
        print(action or "无需切换")
    issues = check()
    notified = state.get("notified", {})
    now = time.time()
    for key, msg in issues.items():
        if now - notified.get(key, 0) >= RENOTIFY_S:
            notify("claude-mem 异常", msg)
            log("ALERT %s: %s" % (key, msg))
            notified[key] = now
    recovered = [k for k in notified if k not in issues]
    if recovered:
        notify("claude-mem 已恢复", "已恢复：" + "、".join(recovered))
        log("RECOVERED %s" % ", ".join(recovered))
        for k in recovered:
            notified.pop(k)
    state.update({"notified": notified, "last_check": dt.datetime.now().isoformat(timespec="seconds"),
                  "issues": issues})
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
