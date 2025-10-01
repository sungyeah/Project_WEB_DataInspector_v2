import tkinter as tk
from tkinter import scrolledtext, messagebox
import threading
import subprocess
import shutil
import sys
import os
import queue
import time
import signal
import platform
import socket

# ==== 설정 ====
SCRIPT_NAME = "ga_protobuf_viewer.py"   # 같은 폴더에 있어야 함
DEFAULT_PORT = "8080"

# ==== 전역 상태 ====
proc = None
log_q = queue.Queue()
stop_reader = threading.Event()

# ==== 유틸 ====
def find_mitmdump():
    path = shutil.which("mitmdump")
    if path:
        return path
    # check bundled mitmdump inside PyInstaller onefile temp dir
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        # common names
        for name in ("mitmdump.exe", "mitmdump"):
            p = os.path.join(meipass, name)
            if os.path.isfile(p) and os.access(p, os.X_OK):
                return p
        # fallback: scan
        for root, dirs, files in os.walk(meipass):
            for f in files:
                if f.lower().startswith("mitmdump"):
                    p = os.path.join(root, f)
                    if os.path.isfile(p) and os.access(p, os.X_OK):
                        return p
    return None

def build_command(port, script_path):
    mitmdump_path = find_mitmdump()
    if mitmdump_path:
        return [
            mitmdump_path,
            "-s", script_path,
            "-p", port,
            "-q",  # quiet: 불필요한 정보 출력 억제
            "--set", "console_eventlog_verbosity=error",  # error만 출력
            "--set", "log_verbose=false"
        ]
    return None

def get_primary_outbound_ip():
    """외부로 나가는 기본 경로(인터넷 향해)를 이용해 현재 장비의 대표 IPv4를 구함."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # 실제로 8.8.8.8에 연결하지 않고 소켓 로컬 주소만 조회
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return None

def get_all_local_ipv4s():
    """호스트에 바인딩된 모든 IPv4 주소(중복 제거)를 반환."""
    ips = set()
    # 1) 기본 outbound IP 추가 시도
    primary = get_primary_outbound_ip()
    if primary:
        ips.add(primary)
    # 2) getaddrinfo로 호스트에 바인딩된 주소들 수집
    try:
        infos = socket.getaddrinfo(socket.gethostname(), None)
        for info in infos:
            addr = info[4][0]
            # IPv4만 추가(IPv6 무시)
            if ":" not in addr:
                ips.add(addr)
    except Exception:
        pass
    # 3) fallback
    if not ips:
        ips.add("127.0.0.1")
    return sorted(list(ips))

# ==== 프로세스 시작/로그 읽기 ====
def start_mitm(port, append_log):
    global proc, stop_reader
    if proc is not None and proc.poll() is None:
        append_log("[!] DataInspector already running\n")
        return False

    script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), SCRIPT_NAME)
    if not os.path.isfile(script_path):
        append_log(f"[ERROR] Script not found: {script_path}\n")
        return False

    cmd = build_command(port, script_path)
    if not cmd:
        append_log("[ERROR] mitmdump not found. Please install mitmproxy or include mitmdump.exe in the bundle.\n")
        return False

    # Start subprocess with pipes; platform-specific flags to make termination easier
    try:
        if platform.system() == "Windows":
            CREATE_NO_WINDOW = 0x08000000
            proc = subprocess.Popen(
                cmd, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.STDOUT, 
                stdin=subprocess.DEVNULL,
                creationflags=CREATE_NO_WINDOW
            )
        else:
            # On Unix, set a new process group so we can kill whole group if needed
            proc = subprocess.Popen(
                cmd, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.STDOUT, 
                stdin=subprocess.DEVNULL, 
                preexec_fn=os.setsid
            )
    except Exception as e:
        append_log(f"[ERROR] Failed to start DataInspector: {e}\n")
        proc = None
        return False

    stop_reader.clear()
    t = threading.Thread(target=_reader_thread, args=(proc, append_log, stop_reader), daemon=True)
    t.start()
    append_log("[+] DataInspector start...\n")
    return True

def _reader_thread(process, append_log, stop_event):
    """읽어들이며 로그 큐에 푸시"""
    try:
        while True:
            if stop_event.is_set():
                break
            if process.stdout is None:
                break
            line = process.stdout.readline()
            if not line:
                # 프로세스 종료되었거나 스트림 닫힘
                break
            try:
                try:
                    text = line.decode("utf-8")
                except UnicodeDecodeError:
                    text = line.decode("cp949", errors="replace")
            except:
                text = str(line)
            append_log(text)
    except Exception as e:
        append_log(f"[ERROR] reader thread: {e}\n")
    finally:
        append_log("[*] reader thread exiting\n")

def stop_mitm(append_log, timeout=3.0):
    """안전하게 종료 시도: terminate -> wait(timeout) -> kill"""
    global proc, stop_reader
    if proc is None:
        append_log("[!] DataInspector not running\n")
        return
    if proc.poll() is not None:
        append_log("[*] DataInspector already exited\n")
        proc = None
        return

    append_log("[*] Stopping DataInspector...\n")
    stop_reader.set()
    try:
        # Unix: kill process group
        if platform.system() != "Windows":
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        else:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                creationflags=0x08000000
            )
            append_log("[+] DataInspector stopped (taskkill)\n")
    except Exception as e:
        append_log(f"[WARN] terminate error: {e}\n")

    # 기다렸다가 강제 종료
    start = time.time()
    while time.time() - start < timeout:
        if proc.poll() is not None:
            append_log("[+] DataInspector stopped gracefully\n")
            proc = None
            return
        time.sleep(0.1)

    # 강제 종료
    try:
        append_log("[!] Forcing kill...\n")
        if platform.system() != "Windows":
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        else:
            proc.kill()
    except Exception as e:
        append_log(f"[ERROR] kill error: {e}\n")
    finally:
        proc = None
        append_log("[+] DataInspector killed\n")

# ==== GUI ====
class App:

    def resource_path(filename):
        if hasattr(sys, "_MEIPASS"):
            return os.path.join(sys._MEIPASS, filename)
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)
    
    def __init__(self, root):
        self.root = root
        root.title("DataInspector")
        root.geometry("800x560")
        if sys.platform.startswith("win"):
            # Windows → .ico
            root.iconbitmap(os.path.join(sys._MEIPASS, "app.ico"))
        elif sys.platform == "darwin":
            # macOS → .icns (실제로는 잘 안 먹히므로 참고)
            try:
                root.iconbitmap(os.path.join(os.path.dirname(os.path.abspath(__file__)), "app.icns"))
            except Exception as e:
                self.append_log("mac icon set failed:", e)

        top = tk.Frame(root)
        top.pack(fill="x", padx=8, pady=6)

        tk.Label(top, text="Port:").pack(side="left")
        self.port_var = tk.StringVar(value=DEFAULT_PORT)
        tk.Entry(top, width=8, textvariable=self.port_var).pack(side="left", padx=4)

        # --- 여기에 IP 표시 추가 ---
        tk.Label(top, text="   IP:").pack(side="left")
        self.ip_var = tk.StringVar(value="...")   # 표시용 변수
        self.ip_label = tk.Label(top, textvariable=self.ip_var)
        self.ip_label.pack(side="left", padx=(0,8))
        # --- IP 표시 추가 끝 ---

        self.start_btn = tk.Button(top, text="Start", command=self.on_start, width=10)
        self.start_btn.pack(side="left", padx=6)
        self.stop_btn = tk.Button(top, text="Stop", command=self.on_stop, width=10, state="disabled")
        self.stop_btn.pack(side="left")

        self.status_label = tk.Label(top, text="Status: stopped", anchor="w")
        self.status_label.pack(side="left", padx=10)

        self.log = scrolledtext.ScrolledText(root, state="normal", wrap="word")
        self.log.pack(fill="both", expand=True, padx=8, pady=(0,8))

        # poll log queue
        self.root.after(200, self._poll_log_queue)

        # handle close
        root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.refresh_ip()

    def append_log(self, text):
        log_q.put(text)

    def _poll_log_queue(self):
        flushed = False
        while not log_q.empty():
            txt = log_q.get_nowait()
            self.log.insert(tk.END, txt)
            flushed = True
        if flushed:
            self.log.see(tk.END)
        # update status based on global proc
        if proc is not None and proc.poll() is None:
            self.status_label.config(text=f"Status: running (pid={proc.pid})")
            self.start_btn.config(state="disabled")
            self.stop_btn.config(state="normal")
        else:
            self.status_label.config(text="Status: stopped")
            self.start_btn.config(state="normal")
            self.stop_btn.config(state="disabled")
        self.root.after(200, self._poll_log_queue)

    def on_start(self):
        port = self.port_var.get().strip() or DEFAULT_PORT
        # start in worker thread to avoid blocking
        def worker():
            ok = start_mitm(port, self.append_log)
            if not ok:
                self.append_log("[ERROR] failed to start DataInspector\n")
        threading.Thread(target=worker, daemon=True).start()

    def on_stop(self):
        def worker():
            stop_mitm(self.append_log)
        threading.Thread(target=worker, daemon=True).start()

    def on_close(self):
        if proc is not None and proc.poll() is None:
            if not messagebox.askyesno("Confirm exit", "DataInspector is still running. Stop it and exit?"):
                return
            # stop and wait a bit
            stop_mitm(self.append_log, timeout=2.0)
        self.root.destroy()

    def refresh_ip(self):
        # UI 스레드에서 호출되므로 바로 사용 가능
        try:
            ips = get_all_local_ipv4s()
            # 대표(primary) + 전체 나열
            primary = get_primary_outbound_ip() or ips[0]
            display = primary
            # 전체가 여러개이면 괄호 안에 쉼표로 나열
            if len(ips) > 1:
                display += " (" + ", ".join(ips) + ")"
            self.ip_var.set(display)
        except Exception as e:
            self.ip_var.set("error")

# ==== helper for appending log from threads ====
def append_log_main(text):
    log_q.put(text)

# ==== main ====
if __name__ == "__main__":
    root = tk.Tk()
    app = App(root)
    root.mainloop()