"""Standalone TibiaGo Chrome WebSocket inspector (does not modify the game)."""
import json, queue, subprocess, tempfile, threading, time, tkinter as tk
from pathlib import Path
from tkinter import ttk
from urllib.request import urlopen
import websocket

CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
DEBUG_PORT = 9222
GAME_URL = "https://tibiago.cyrk.fun"

class Inspector:
    def __init__(self, root):
        self.root, self.events, self.ws, self.process = root, queue.Queue(), None, None
        self.root.title("TibiaGo Chrome Packet Inspector")
        self.root.geometry("920x560")
        bar = ttk.Frame(root, padding=10); bar.pack(fill="x")
        ttk.Button(bar, text="1. Open Chrome", command=self.open_chrome).pack(side="left")
        ttk.Button(bar, text="2. Attach inspector", command=self.attach).pack(side="left", padx=6)
        ttk.Label(bar, text="Log in and play manually in Chrome. This program only observes frames.").pack(side="left", padx=8)
        self.log = tk.Text(root, bg="#101216", fg="#c9faff", font=("Consolas", 10), state="disabled")
        self.log.pack(fill="both", expand=True, padx=10, pady=(0,10))
        self.root.after(100, self.flush)

    def report(self, text): self.events.put(time.strftime("%H:%M:%S ") + text)
    def flush(self):
        while not self.events.empty():
            self.log.configure(state="normal"); self.log.insert("end", self.events.get_nowait()+"\n"); self.log.see("end"); self.log.configure(state="disabled")
        self.root.after(100, self.flush)

    def open_chrome(self):
        if not CHROME.exists(): return self.report("Chrome was not found.")
        profile = Path(tempfile.gettempdir()) / "TibiaGoPacketInspectorChrome"
        self.process = subprocess.Popen([str(CHROME), f"--remote-debugging-port={DEBUG_PORT}", f"--remote-allow-origins=http://127.0.0.1:{DEBUG_PORT}", f"--user-data-dir={profile}", "--new-window", GAME_URL])
        self.report("Chrome started. Log in manually, then click Attach inspector.")

    def attach(self): threading.Thread(target=self.attach_worker, daemon=True).start()
    def attach_worker(self):
        try:
            with urlopen(f"http://127.0.0.1:{DEBUG_PORT}/json", timeout=4) as response: pages = json.load(response)
            page = next((p for p in pages if p.get("type") == "page" and "tibiago" in p.get("url", "").lower()), None)
            if not page: raise RuntimeError("Open TibiaGo in the Chrome window first.")
            self.ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=10)
            self.ws.send(json.dumps({"id": 1, "method": "Network.enable"}))
            self.report("Attached. WebSocket frames will appear below.")
            while True:
                message = json.loads(self.ws.recv())
                method = message.get("method", "")
                if method not in ("Network.webSocketFrameReceived", "Network.webSocketFrameSent"): continue
                response = message["params"]["response"]
                payload = response.get("payloadData", "")
                direction = "<-" if method.endswith("Received") else "->"
                preview = payload[:72].replace("\n", " ")
                self.report(f"{direction} WS opcode={response.get('opcode')} bytes={len(payload)}  {preview!r}")
        except Exception as error: self.report(f"Inspector error: {error}")

if __name__ == "__main__":
    Inspector(tk.Tk()).root.mainloop()
