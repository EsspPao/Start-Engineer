import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { dirname } from "node:path";
import { createServer, type Server, type Socket } from "node:net";
import { createInterface, type Interface as ReadLineInterface } from "node:readline";
import { normalizeNativeLaunchResult, type NativeHelperCommand, type NativeLaunchRequest } from "./native-helper.js";

const protocolVersion = 1;
const maximumPidCount = 64;

export type ElevatedTerminationStatus = "disabled" | "starting" | "ready" | "cancelled" | "failed";

export type ElevatedTerminationState = {
  status: ElevatedTerminationStatus;
  message?: string;
};

type ElevatedHello = {
  type?: unknown;
  protocol?: unknown;
  pid?: unknown;
  parentPid?: unknown;
  nonce?: unknown;
  isElevated?: unknown;
};

type RuntimeResponse = { id?: unknown; ok?: unknown; result?: unknown; error?: unknown };
type PendingRequest = { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: NodeJS.Timeout };
type AuthenticatedConnection = { socket: Socket; lines: ReadLineInterface };

type ElevatedTerminationHostOptions = {
  runNativeHelper: (command: NativeHelperCommand, payload: unknown, timeoutMs?: number) => Promise<string>;
  resolveNativeHelperPath: () => string;
  parentPid?: number;
  handshakeTimeoutMs?: number;
  requestTimeoutMs?: number;
};

export function normalizeTerminationPids(pids: readonly number[]) {
  const normalized = [...new Set(pids.filter((pid) => Number.isSafeInteger(pid) && pid > 0))].sort((a, b) => a - b);
  if (normalized.length > maximumPidCount) throw new Error(`一次最多结束 ${maximumPidCount} 个进程`);
  return normalized;
}

export function isValidElevatedHello(hello: ElevatedHello, expected: { pid: number; parentPid: number; nonce: string }) {
  if (hello.type !== "hello" || hello.protocol !== protocolVersion || hello.pid !== expected.pid || hello.parentPid !== expected.parentPid || hello.isElevated !== true) return false;
  if (typeof hello.nonce !== "string" || !/^[a-f\d]{64}$/i.test(hello.nonce) || !/^[a-f\d]{64}$/i.test(expected.nonce)) return false;
  const actual = Buffer.from(hello.nonce, "hex");
  const wanted = Buffer.from(expected.nonce, "hex");
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

export class ElevatedTerminationHost {
  private state: ElevatedTerminationState = { status: "disabled" };
  private readonly listeners = new Set<(state: ElevatedTerminationState) => void>();
  private readonly candidates = new Set<Socket>();
  private readonly pending = new Map<number, PendingRequest>();
  private server: Server | null = null;
  private socket: Socket | null = null;
  private lines: ReadLineInterface | null = null;
  private helperPid = 0;
  private nextId = 1;
  private startPromise: Promise<void> | null = null;
  private stopping = false;

  constructor(private readonly options: ElevatedTerminationHostOptions) {}

  snapshot() {
    return { ...this.state };
  }

  ownProcessIds() {
    return this.helperPid > 0 ? new Set([this.helperPid]) : new Set<number>();
  }

  subscribe(listener: (state: ElevatedTerminationState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start() {
    if (this.socket && this.state.status === "ready") return;
    if (this.startPromise) return this.startPromise;
    this.stopping = false;
    this.startPromise = this.startInternal().finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  async terminate(pids: number[]) {
    const normalized = normalizeTerminationPids(pids);
    if (!normalized.length) return;
    await this.start();
    await this.request("terminate", normalized, this.options.requestTimeoutMs ?? 15_000);
  }

  stop() {
    this.stopping = true;
    if (this.socket && !this.socket.destroyed) {
      const id = this.nextId++;
      this.socket.end(`${JSON.stringify({ id, command: "shutdown", pids: [] })}\n`);
      const socket = this.socket;
      const timer = setTimeout(() => socket.destroy(), 250);
      timer.unref();
    }
    this.closeTransport(new Error("privileged process control stopped"));
    this.setState({ status: "disabled" });
  }

  private async startInternal() {
    this.closeTransport(new Error("privileged process control restarting"));
    this.setState({ status: "starting" });
    const parentPid = this.options.parentPid ?? process.pid;
    const nonce = randomBytes(32).toString("hex");
    const pipeName = `start-engineer-terminate-${parentPid}-${randomUUID()}`;
    const pipePath = `\\\\.\\pipe\\${pipeName}`;
    let resolveExpectedPid!: (pid: number) => void;
    const expectedPid = new Promise<number>((resolve) => { resolveExpectedPid = resolve; });
    let resolveAuthenticated!: (connection: AuthenticatedConnection) => void;
    const authenticated = new Promise<AuthenticatedConnection>((resolve) => { resolveAuthenticated = resolve; });

    try {
      await this.listen(pipePath, (socket) => this.authenticateCandidate(socket, expectedPid, parentPid, nonce, resolveAuthenticated));
      const executablePath = this.options.resolveNativeHelperPath();
      if (!executablePath) throw new Error("native helper unavailable");
      const raw = await this.options.runNativeHelper("launch", {
        executablePath,
        workingDirectory: dirname(executablePath),
        arguments: ["terminate-server", "--pipe", pipeName, "--parent-pid", String(parentPid), "--nonce", nonce],
        elevated: true,
        waitForExit: false
      } satisfies NativeLaunchRequest, 120_000);
      const launch = normalizeNativeLaunchResult(JSON.parse(raw));
      if (!launch.ok) {
        if (launch.errorCode === 1223) throw Object.assign(new Error("管理员授权已取消"), { code: "ELEVATION_CANCELLED" });
        throw new Error(`高权限进程控制启动失败${launch.errorCode ? `（错误 ${launch.errorCode}）` : ""}`);
      }
      if (!launch.pid || !Number.isSafeInteger(launch.pid) || launch.pid <= 0) throw new Error("高权限进程控制未返回有效进程标识");
      this.helperPid = launch.pid;
      resolveExpectedPid(launch.pid);
      const connection = await withTimeout(authenticated, this.options.handshakeTimeoutMs ?? 15_000, "高权限进程控制连接超时");
      this.server?.close();
      this.server = null;
      this.attach(connection);
      this.setState({ status: "ready" });
    } catch (reason) {
      resolveExpectedPid(0);
      this.closeTransport(asError(reason));
      if (hasErrorCode(reason, "ELEVATION_CANCELLED")) {
        this.setState({ status: "cancelled", message: "本次未启用高权限进程控制；资源管理器拖放仍可用，需要结束高权限应用时可重新授权。" });
      } else {
        this.setState({ status: "failed", message: "高权限进程控制未能启动；资源管理器拖放仍可用，可稍后在设置中重试。" });
      }
      throw reason;
    }
  }

  private listen(pipePath: string, onConnection: (socket: Socket) => void) {
    return new Promise<void>((resolve, reject) => {
      const server = createServer(onConnection);
      this.server = server;
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        server.on("error", (error) => this.handleDisconnect(error));
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(pipePath);
    });
  }

  private authenticateCandidate(socket: Socket, expectedPid: Promise<number>, parentPid: number, nonce: string, accept: (connection: AuthenticatedConnection) => void) {
    this.candidates.add(socket);
    const lines = createInterface({ input: socket, crlfDelay: Infinity });
    const timer = setTimeout(() => socket.destroy(), this.options.handshakeTimeoutMs ?? 15_000);
    timer.unref();
    const reject = () => {
      clearTimeout(timer);
      this.candidates.delete(socket);
      lines.close();
      socket.destroy();
    };
    socket.once("error", reject);
    socket.once("close", () => {
      clearTimeout(timer);
      this.candidates.delete(socket);
    });
    lines.once("line", (line) => {
      void expectedPid.then((pid) => {
        let hello: ElevatedHello;
        try { hello = JSON.parse(line) as ElevatedHello; }
        catch { reject(); return; }
        if (!isValidElevatedHello(hello, { pid, parentPid, nonce }) || this.socket) { reject(); return; }
        clearTimeout(timer);
        socket.removeListener("error", reject);
        this.candidates.delete(socket);
        accept({ socket, lines });
      });
    });
  }

  private attach(connection: AuthenticatedConnection) {
    this.socket = connection.socket;
    this.lines = connection.lines;
    connection.lines.on("line", (line) => this.handleResponse(line));
    connection.socket.once("error", (error) => this.handleDisconnect(error));
    connection.socket.once("close", () => this.handleDisconnect(new Error("高权限进程控制连接已断开")));
  }

  private request(command: "terminate", pids: number[], timeoutMs: number) {
    const socket = this.socket;
    if (!socket || socket.destroyed || this.state.status !== "ready") return Promise.reject(new Error("高权限进程控制尚未就绪"));
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("高权限进程控制请求超时"));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      socket.write(`${JSON.stringify({ id, command, pids })}\n`, (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.reject(error);
      });
    });
  }

  private handleResponse(line: string) {
    let response: RuntimeResponse;
    try { response = JSON.parse(line) as RuntimeResponse; }
    catch { return; }
    if (typeof response.id !== "number") return;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    if (response.ok === true) pending.resolve(response.result);
    else pending.reject(new Error(typeof response.error === "string" ? response.error : "高权限进程控制请求失败"));
  }

  private handleDisconnect(reason: Error) {
    if (this.stopping || (!this.socket && !this.server)) return;
    this.closeTransport(reason);
    this.setState({ status: "failed", message: "高权限进程控制连接已断开；资源管理器拖放不受影响，下次结束高权限应用时可重新授权。" });
  }

  private closeTransport(reason: Error) {
    this.server?.close();
    this.server = null;
    this.lines?.close();
    this.lines = null;
    const socket = this.socket;
    this.socket = null;
    socket?.destroy();
    for (const candidate of this.candidates) candidate.destroy();
    this.candidates.clear();
    this.helperPid = 0;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(reason);
    }
    this.pending.clear();
  }

  private setState(state: ElevatedTerminationState) {
    this.state = state;
    for (const listener of this.listeners) listener(this.snapshot());
  }
}

function hasErrorCode(reason: unknown, code: string) {
  return reason instanceof Error && "code" in reason && reason.code === code;
}

function asError(reason: unknown) {
  return reason instanceof Error ? reason : new Error(String(reason));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (reason) => { clearTimeout(timer); reject(reason); });
  });
}
