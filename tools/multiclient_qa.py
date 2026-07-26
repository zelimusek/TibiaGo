"""TibiaGo Multi-Client QA Panel.

Standalone Windows QA utility. It uses the normal TibiaGo login endpoint and
WebSocket protocol to test connections, packet traffic and controlled movement
of accounts you own. Credentials stay only in this process memory.

This tool deliberately has no chat, combat, item-use, targeting or spell APIs.
"""

from __future__ import annotations

import json
import queue
import threading
import time
import tkinter as tk
from dataclasses import dataclass, field
from tkinter import messagebox, ttk
from typing import Callable
from urllib.parse import urlencode, urljoin, urlparse, parse_qsl, urlunparse
from urllib.request import urlopen

import websocket


CLIENT_MOVE = 2
CLIENT_LOGOUT = 1
SERVER_CREATURE_PROPERTY = 37

PROPERTY_NAMES = {
    0: "name", 1: "health", 2: "max health", 3: "mana", 4: "max mana",
    5: "capacity", 6: "max capacity", 7: "attack", 8: "defense",
    9: "attack speed", 10: "speed", 12: "direction", 13: "role",
    14: "sex", 15: "vocation", 18: "magic", 19: "fist", 20: "club",
    21: "sword", 22: "axe", 23: "distance", 24: "shielding",
    25: "fishing", 26: "experience",
}
DIRECTION_NAMES = {0: "north", 1: "east", 2: "south", 3: "west", 4: "south-east", 5: "south-west", 6: "north-east", 7: "north-west"}


def read_u32(data: bytes, offset: int) -> int:
    return int.from_bytes(data[offset:offset + 4], "little")


@dataclass
class AccountRow:
    account: tk.StringVar
    password: tk.StringVar
    status: tk.StringVar
    client: "QAClient | None" = None


@dataclass
class QAClient:
    account: str
    password: str
    base_url: str
    report: Callable[[str], None]
    socket: websocket.WebSocketApp | None = None
    running: bool = False
    walking: bool = False
    move_index: int = 0
    move_thread: threading.Thread | None = None
    status: str = field(default="Connecting")

    def connect(self) -> None:
        threading.Thread(target=self._connect_worker, daemon=True).start()

    def _connect_worker(self) -> None:
        try:
            login_url = urljoin(self.base_url.rstrip("/") + "/", "api/login")
            request_url = login_url + "?" + urlencode({"account": self.account, "password": self.password})
            with urlopen(request_url, timeout=12) as response:
                if response.status != 200:
                    raise RuntimeError(f"login returned HTTP {response.status}")
                login = json.loads(response.read().decode("utf-8"))

            parsed = urlparse(login["host"])
            query = dict(parse_qsl(parsed.query))
            query["token"] = login["token"]
            socket_url = urlunparse(parsed._replace(query=urlencode(query)))
            self.report(f"{self.account}: connecting through {urlparse(socket_url).scheme.upper()}.")
            self.socket = websocket.WebSocketApp(
                socket_url,
                on_open=lambda ws: self._on_open(),
                on_message=lambda ws, message: self._on_message(message),
                on_error=lambda ws, error: self._on_error(error),
                on_close=lambda ws, code, reason: self._on_close(code, reason),
            )
            self.socket.run_forever(ping_interval=20, ping_timeout=10)
        except Exception as error:  # UI reports network/auth errors without exposing passwords.
            self.status = "Error"
            self.report(f"{self.account}: connection error — {error}")

    def _on_open(self) -> None:
        self.running = True
        self.status = "Connected"
        self.report(f"{self.account}: connected. Monitoring own incoming packets.")

    def _on_message(self, message: bytes | str) -> None:
        data = message.encode() if isinstance(message, str) else bytes(message)
        if not data:
            return
        if data[0] == SERVER_CREATURE_PROPERTY and len(data) >= 10:
            self._decode_property_batch(data)
        else:
            self.report(f"{self.account}: <- frame {len(data)} bytes, first opcode {data[0]}")

    def _decode_property_batch(self, data: bytes) -> None:
        index = 0
        while index < len(data) and data[index] == SERVER_CREATURE_PROPERTY and index + 10 <= len(data):
            creature_id = read_u32(data, index + 1)
            property_id = data[index + 5]
            value = read_u32(data, index + 6)
            property_name = PROPERTY_NAMES.get(property_id, f"property #{property_id}")
            if property_id == 12:
                value_text = DIRECTION_NAMES.get(value, str(value))
            else:
                value_text = str(value)
            self.report(f"{self.account}: property for {creature_id}: {property_name} = {value_text}")
            index += 10
        if index < len(data):
            self.report(f"{self.account}: <- frame {len(data)} bytes, first opcode {data[0]}")

    def _on_error(self, error: object) -> None:
        self.status = "Error"
        self.report(f"{self.account}: WebSocket error — {error}")

    def _on_close(self, code: int | None, reason: str | None) -> None:
        self.running = False
        self.walking = False
        self.status = "Disconnected"
        self.report(f"{self.account}: disconnected ({code or 'no code'}).")

    def send_move(self, direction: int) -> None:
        if not self.running or not self.socket:
            return
        try:
            self.socket.send(bytes([CLIENT_MOVE, direction]), opcode=websocket.ABNF.OPCODE_BINARY)
            self.report(f"{self.account}: -> move {DIRECTION_NAMES[direction]}")
        except Exception as error:
            self.report(f"{self.account}: unable to send movement — {error}")

    def start_square(self) -> None:
        if not self.running or self.walking:
            return
        self.walking = True
        self.move_thread = threading.Thread(target=self._walk_square, daemon=True)
        self.move_thread.start()

    def _walk_square(self) -> None:
        route = (0, 1, 2, 3)
        while self.running and self.walking:
            self.send_move(route[self.move_index % len(route)])
            self.move_index += 1
            time.sleep(0.9)

    def stop_square(self) -> None:
        self.walking = False

    def disconnect(self) -> None:
        self.walking = False
        if self.socket and self.running:
            try:
                self.socket.send(bytes([CLIENT_LOGOUT]), opcode=websocket.ABNF.OPCODE_BINARY)
                self.socket.close()
            except Exception:
                pass


class MultiClientQAPanel:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("TibiaGo Multi-Client QA")
        self.root.minsize(860, 540)
        self.events: queue.Queue[str] = queue.Queue()
        self.rows: list[AccountRow] = []
        self.base_url = tk.StringVar(value="https://tibiago.cyrk.fun")

        self._build()
        self.add_row()
        self.root.after(100, self._flush_events)
        self.root.protocol("WM_DELETE_WINDOW", self._close)

    def _build(self) -> None:
        wrapper = ttk.Frame(self.root, padding=12)
        wrapper.pack(fill="both", expand=True)

        top = ttk.Frame(wrapper)
        top.pack(fill="x")
        ttk.Label(top, text="Server URL:").pack(side="left")
        ttk.Entry(top, textvariable=self.base_url, width=42).pack(side="left", padx=(6, 14))
        ttk.Label(top, text="Only accounts you own. No combat, spells, targets or chat are sent.").pack(side="left")

        self.accounts = ttk.LabelFrame(wrapper, text="Test accounts (credentials remain only in memory)", padding=8)
        self.accounts.pack(fill="x", pady=10)
        self.account_grid = ttk.Frame(self.accounts)
        self.account_grid.pack(fill="x")
        for column, title, width in ((0, "Account", 24), (1, "Password", 24), (2, "Status", 16)):
            ttk.Label(self.account_grid, text=title, width=width).grid(row=0, column=column, sticky="w", padx=3)

        controls = ttk.Frame(wrapper)
        controls.pack(fill="x", pady=(0, 10))
        ttk.Button(controls, text="Add account", command=self.add_row).pack(side="left")
        ttk.Button(controls, text="Connect all", command=self.connect_all).pack(side="left", padx=5)
        ttk.Button(controls, text="Start square walk", command=self.start_walk_all).pack(side="left", padx=5)
        ttk.Button(controls, text="Stop movement", command=self.stop_walk_all).pack(side="left", padx=5)
        ttk.Button(controls, text="Disconnect all", command=self.disconnect_all).pack(side="left", padx=5)

        log_frame = ttk.LabelFrame(wrapper, text="QA event log", padding=6)
        log_frame.pack(fill="both", expand=True)
        self.log = tk.Text(log_frame, height=20, background="#111", foreground="#d8f8ff", insertbackground="white", state="disabled")
        scrollbar = ttk.Scrollbar(log_frame, command=self.log.yview)
        self.log.configure(yscrollcommand=scrollbar.set)
        self.log.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

    def add_row(self) -> None:
        row = AccountRow(tk.StringVar(), tk.StringVar(), tk.StringVar(value="Idle"))
        self.rows.append(row)
        index = len(self.rows)
        ttk.Entry(self.account_grid, textvariable=row.account, width=25).grid(row=index, column=0, sticky="ew", padx=3, pady=2)
        ttk.Entry(self.account_grid, textvariable=row.password, width=25, show="•").grid(row=index, column=1, sticky="ew", padx=3, pady=2)
        ttk.Label(self.account_grid, textvariable=row.status, width=16).grid(row=index, column=2, sticky="w", padx=3, pady=2)
        ttk.Button(self.account_grid, text="Connect", command=lambda current=row: self.connect_row(current)).grid(row=index, column=3, padx=3)
        ttk.Button(self.account_grid, text="Disconnect", command=lambda current=row: self.disconnect_row(current)).grid(row=index, column=4, padx=3)

    def report(self, message: str) -> None:
        self.events.put(time.strftime("%H:%M:%S ") + message)

    def _flush_events(self) -> None:
        while not self.events.empty():
            self.log.configure(state="normal")
            self.log.insert("end", self.events.get_nowait() + "\n")
            self.log.see("end")
            self.log.configure(state="disabled")
        self._update_statuses()
        self.root.after(100, self._flush_events)

    def _update_statuses(self) -> None:
        for row in self.rows:
            if row.client:
                row.status.set(row.client.status)

    def connect_row(self, row: AccountRow) -> None:
        if row.client and row.client.running:
            return
        if not row.account.get().strip() or not row.password.get():
            messagebox.showwarning("Missing credentials", "Enter account and password for this test account.")
            return
        row.client = QAClient(row.account.get().strip(), row.password.get(), self.base_url.get().strip(), self.report)
        row.status.set("Connecting")
        row.client.connect()

    def disconnect_row(self, row: AccountRow) -> None:
        if row.client:
            row.client.disconnect()

    def connect_all(self) -> None:
        for row in self.rows:
            if row.account.get().strip() and row.password.get():
                self.connect_row(row)

    def start_walk_all(self) -> None:
        for row in self.rows:
            if row.client:
                row.client.start_square()

    def stop_walk_all(self) -> None:
        for row in self.rows:
            if row.client:
                row.client.stop_square()

    def disconnect_all(self) -> None:
        for row in self.rows:
            self.disconnect_row(row)

    def _close(self) -> None:
        self.disconnect_all()
        self.root.destroy()


if __name__ == "__main__":
    MultiClientQAPanel(tk.Tk()).root.mainloop()
