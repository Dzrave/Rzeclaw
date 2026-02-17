/**
 * WO-IDE-009 / WO-IDE-010: L2 程序化 UI 自动化。
 * 仅在 config.ideOperation.uiAutomation === true 且 process.platform === 'win32' 时注册。
 * ui_act 执行前检查 allowedApps。
 */

import { spawn } from "node:child_process";
import type { RzeclawConfig } from "../config.js";
import type { ToolDef, ToolResult } from "./types.js";

const IS_WIN = process.platform === "win32";

function runPowerShell(
  script: string,
  timeoutMs = 15000,
  env?: Record<string, string>
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => { stdout += d.toString(); });
    child.stderr?.on("data", (d) => { stderr += d.toString(); });
    const t = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ stdout, stderr, code: null });
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ stdout, stderr, code });
    });
    child.on("error", () => resolve({ stdout: "", stderr: "spawn error", code: 1 }));
  });
}

/** 检查目标应用是否在 allowedApps 白名单中（不区分大小写） */
function isAllowedApp(processName: string, allowedApps: string[] | undefined): boolean {
  if (!allowedApps || allowedApps.length === 0) return true;
  const lower = processName.toLowerCase();
  return allowedApps.some((a) => a.toLowerCase() === lower);
}

export function getIdeOperationTools(config: RzeclawConfig): ToolDef[] {
  const tools: ToolDef[] = [];
  if (!IS_WIN) return tools;

  const allowedApps = config.ideOperation?.allowedApps;
  const uiAutomation = config.ideOperation?.uiAutomation === true;
  const keyMouse = config.ideOperation?.keyMouse === true;

  if (uiAutomation) {

  const uiDescribeTool: ToolDef = {
    name: "ui_describe",
    description:
      "Get a summary of top-level windows (process name, window title, process id). Use to discover which app/window to operate on. Windows only; requires ideOperation.uiAutomation.",
    usageHint: "Use when: you need to see open windows or find an IDE/terminal window before ui_act or ui_focus.",
    inputSchema: {
      type: "object",
      properties: {
        processName: { type: "string", description: "Optional: filter by process name (e.g. Code, cmd)" },
      },
      required: [],
    },
    async handler(args, _cwd): Promise<ToolResult> {
      const filter = typeof args.processName === "string" && args.processName.trim() ? args.processName.trim() : "";
      const script = `
$ErrorActionPreference = 'Stop'
$filter = $env:UI_DESCRIBE_FILTER
Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | ForEach-Object {
  if (($filter -eq '') -or ($_.ProcessName -like "*$filter*")) {
    [PSCustomObject]@{ ProcessName = $_.ProcessName; MainWindowTitle = $_.MainWindowTitle; Id = $_.Id }
  }
} | ConvertTo-Json -Compress
`;
      const { stdout, stderr, code } = await runPowerShell(script, 10000, { UI_DESCRIBE_FILTER: filter });
      if (code !== 0) return { ok: false, error: stderr || stdout || "PowerShell failed", code: "UI_DESCRIBE_ERROR" };
      const content = stdout.trim() || "[]";
      return { ok: true, content, channel_used: "ui_describe" };
    },
    timeoutMs: 10000,
  };

  const uiActTool: ToolDef = {
    name: "ui_act",
    description:
      "Perform an action on a UI element: click (InvokePattern) or set value. Target by process name and element name. Windows only; app must be in ideOperation.allowedApps.",
    usageHint: "Use after ui_describe to get process names. Pass processName (e.g. Code) and elementName (button text or AutomationId).",
    inputSchema: {
      type: "object",
      properties: {
        processName: { type: "string", description: "Process name of the target app (e.g. Code, cmd)" },
        elementName: { type: "string", description: "Name or AutomationId of the control to act on" },
        action: { type: "string", description: "click or set_value" },
        value: { type: "string", description: "For set_value: the text to set" },
      },
      required: ["processName", "elementName", "action"],
    },
    async handler(args, _cwd): Promise<ToolResult> {
      const processName = String(args.processName ?? "").trim();
      const elementName = String(args.elementName ?? "").trim();
      const action = String(args.action ?? "click").toLowerCase();
      const value = typeof args.value === "string" ? args.value : "";

      if (!processName || !elementName)
        return { ok: false, error: "processName and elementName are required", code: "INVALID_ARGS" };
      if (!isAllowedApp(processName, allowedApps))
        return {
          ok: false,
          error: `App "${processName}" is not in allowedApps. Add it in config.ideOperation.allowedApps to allow.`,
          code: "APP_NOT_ALLOWED",
        };

      const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$procName = $env:UI_ACT_PROCESS
$elName = $env:UI_ACT_ELEMENT
$act = $env:UI_ACT_ACTION
$val = $env:UI_ACT_VALUE
$proc = Get-Process -Name $procName -ErrorAction SilentlyContinue
if (-not $proc) { Write-Error "Process not found: $procName"; exit 1 }
$pid = $proc.Id
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = [System.Windows.Automation.Condition]::TrueCondition
$windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
$targetWindow = $null
foreach ($w in $windows) { if ($w.Current.ProcessId -eq $pid) { $targetWindow = $w; break } }
if (-not $targetWindow) { Write-Error "Window for process $procName not found"; exit 2 }
$nameCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $elName)
$idCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, $elName)
$orCond = New-Object System.Windows.Automation.OrCondition($nameCond, $idCond)
$elements = $targetWindow.FindAll([System.Windows.Automation.TreeScope]::Descendants, $orCond)
if ($elements.Count -eq 0) { Write-Error "Element not found: $elName"; exit 3 }
$el = $elements[0]
if ($act -eq 'set_value') {
  $valPattern = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern) -as [System.Windows.Automation.ValuePattern]
  if (-not $valPattern) { Write-Error "Element does not support Value pattern"; exit 4 }
  $valPattern.SetValue($val)
  Write-Output 'OK: set_value'
} else {
  $invPattern = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern) -as [System.Windows.Automation.InvokePattern]
  if (-not $invPattern) { Write-Error "Element does not support Invoke pattern (not clickable)"; exit 4 }
  $invPattern.Invoke()
  Write-Output 'OK: click'
}
`;
      const { stdout, stderr, code } = await runPowerShell(script, 15000, {
        UI_ACT_PROCESS: processName,
        UI_ACT_ELEMENT: elementName,
        UI_ACT_ACTION: action,
        UI_ACT_VALUE: value,
      });
      if (code !== 0) {
        return {
          ok: false,
          error: (stderr || stdout || "PowerShell failed").trim(),
          code: "UI_ACT_ERROR",
          suggestion: "Confirm process name and element name with ui_describe first.",
        };
      }
      return { ok: true, content: stdout.trim() || "Done", channel_used: "ui_act" };
    },
    timeoutMs: 15000,
  };

  const uiFocusTool: ToolDef = {
    name: "ui_focus",
    description: "Bring a window to foreground by process name. Windows only.",
    usageHint: "Use to focus an IDE or terminal before ui_act or key input.",
    inputSchema: {
      type: "object",
      properties: {
        processName: { type: "string", description: "Process name (e.g. Code, WindowsTerminal)" },
      },
      required: ["processName"],
    },
    async handler(args, _cwd): Promise<ToolResult> {
      const processName = String(args.processName ?? "").trim();
      if (!processName) return { ok: false, error: "processName is required", code: "INVALID_ARGS" };
      if (!isAllowedApp(processName, allowedApps))
        return {
          ok: false,
          error: `App "${processName}" is not in allowedApps. Add it in config.ideOperation.allowedApps.`,
          code: "APP_NOT_ALLOWED",
        };

      const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition '
  using System; using System.Runtime.InteropServices;
  public class Win {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    public static void Focus(IntPtr h) { ShowWindow(h, 9); SetForegroundWindow(h); }
  }
'
$p = Get-Process -Name $env:UI_FOCUS_PROCESS -ErrorAction SilentlyContinue
if (-not $p) { Write-Error "Process not found"; exit 1 }
[Win]::Focus($p.MainWindowHandle)
Write-Output 'OK'
`;
      const { stdout, stderr, code } = await runPowerShell(script, 5000, { UI_FOCUS_PROCESS: processName });
      if (code !== 0)
        return { ok: false, error: (stderr || stdout || "PowerShell failed").trim(), code: "UI_FOCUS_ERROR" };
      return { ok: true, content: stdout.trim() || "OK", channel_used: "ui_focus" };
    },
    timeoutMs: 5000,
  };

  tools.push(uiDescribeTool, uiActTool, uiFocusTool);
  }

  if (keyMouse) {
    const keymouseTool: ToolDef = {
      name: "keymouse",
      description:
        "Send key sequence to the current foreground window (e.g. Ctrl+S, Enter). Windows only; requires ideOperation.keyMouse. The foreground app must be in allowedApps.",
      usageHint: "Use when: you need to send a shortcut to the focused app (e.g. save, run). Check allowedApps first.",
      inputSchema: {
        type: "object",
        properties: {
          keys: { type: "string", description: "Key sequence: use + for combine (e.g. ^s = Ctrl+S), {ENTER}, {TAB}" },
        },
        required: ["keys"],
      },
      async handler(args, _cwd): Promise<ToolResult> {
        const keys = String(args.keys ?? "").trim();
        if (!keys) return { ok: false, error: "keys is required", code: "INVALID_ARGS" };
        const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition '
  using System; using System.Runtime.InteropServices;
  public class Win {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int pid);
  }
'
$h = [Win]::GetForegroundWindow()
$pid = 0
[Win]::GetWindowThreadProcessId($h, [ref]$pid) | Out-Null
$proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
$procName = if ($proc) { $proc.ProcessName } else { "" }
Write-Output $procName
`;
        const { stdout: procNameOut, code: code1 } = await runPowerShell(script, 5000);
        if (code1 !== 0) return { ok: false, error: "Could not get foreground window process", code: "KEYMOUSE_ERROR" };
        const procName = procNameOut.trim();
        if (!isAllowedApp(procName, allowedApps)) {
          return {
            ok: false,
            error: `Foreground app "${procName}" is not in allowedApps. Focus an allowed app first.`,
            code: "APP_NOT_ALLOWED",
          };
        }
        const sendScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait($env:KEYMOUSE_KEYS)
Write-Output 'OK'
`;
        const { stdout, stderr, code } = await runPowerShell(sendScript, 5000, { KEYMOUSE_KEYS: keys });
        if (code !== 0) return { ok: false, error: (stderr || stdout || "SendKeys failed").trim(), code: "KEYMOUSE_ERROR" };
        return { ok: true, content: stdout.trim() || "OK", channel_used: "keymouse" };
      },
      timeoutMs: 5000,
    };
    tools.push(keymouseTool);
  }

  return tools;
}
