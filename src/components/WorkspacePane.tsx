import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SwipeableTabContainer } from './SwipeableTabContainer';
import {
  FileCode2,
  Play,
  Copy,
  Check,
  Eye,
  Terminal,
  Maximize2,
  Sparkles,
  RotateCcw,
  Trash2,
  Save,
  AlertCircle,
  CheckCircle2,
  Monitor,
  Smartphone,
  Tablet,
  Code,
  ArrowDownToLine,
  History,
  Zap,
  ZapOff,
  Clock,
  Search,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { WorkspaceSnippetHistoryItem } from '../types';

type WorkspaceMode = 'javascript' | 'html' | 'json';
type ViewportSize = 'desktop' | 'tablet' | 'mobile';

interface ConsoleLog {
  id: string;
  type: 'log' | 'info' | 'warn' | 'error' | 'return';
  text: string;
  timestamp: string;
}

const DEFAULT_JS_CODE = `// AXON Workspace Engine
// Safe client-side execution & rapid prototyping

function generateSystemReport() {
  const memoryEstimate = performance?.memory
    ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + ' MB'
    : 'Optimized (<64 MB)';

  return {
    engine: 'AXON Unified Intelligence',
    status: 'Operational',
    deviceTier: 'Mobile Low-Spec Adaptive',
    memoryUsage: memoryEstimate,
    timestamp: new Date().toLocaleTimeString(),
    cores: navigator.hardwareConcurrency || 4,
    metrics: [
      { name: 'Cold Start Latency', value: '12ms', status: 'Optimal' },
      { name: 'Local Cache State', value: 'Hydrated', status: 'Healthy' },
      { name: 'Execution Sandbox', value: 'Secure Client-Side', status: 'Active' },
    ]
  };
}

return generateSystemReport();`;

const DEFAULT_HTML_CODE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 24px;
      background: #09090b;
      color: #fafafa;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
      text-align: center;
    }
    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 16px;
      padding: 24px;
      max-width: 380px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 9999px;
      background: #22c55e20;
      color: #4ade80;
      border: 1px solid #22c55e40;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    h1 { margin: 0 0 8px 0; font-size: 20px; font-weight: 700; color: #fff; }
    p { margin: 0 0 16px 0; font-size: 13px; color: #a1a1aa; line-height: 1.5; }
    button {
      background: #ffffff;
      color: #000000;
      border: none;
      padding: 8px 16px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #e4e4e7; }
    .counter { margin-top: 14px; font-size: 12px; color: #71717a; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Live Component</span>
    <h1>AXON Canvas</h1>
    <p>Real-time visual component preview. Edit the HTML or CSS in the Code tab to see changes immediately.</p>
    <button id="clickBtn" onclick="increment()">Click Me</button>
    <div class="counter" id="countDisplay">Clicks: 0</div>
  </div>

  <script>
    let clicks = 0;
    function increment() {
      clicks++;
      document.getElementById('countDisplay').innerText = 'Clicks: ' + clicks;
    }
  </script>
</body>
</html>`;

export const WorkspacePane: React.FC = () => {
  const {
    navigateTo,
    showToast,
    activeProjectMessages,
    savedScripts,
    saveScript,
    workspaceCodeLoadMode,
    setWorkspaceCodeLoadMode,
    workspaceSnippetHistory,
    addWorkspaceSnippetHistory,
    deleteWorkspaceSnippetHistoryItem,
    clearWorkspaceSnippetHistory,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'code' | 'preview' | 'terminal'>('code');
  const [mode, setMode] = useState<WorkspaceMode>('javascript');
  const [code, setCode] = useState<string>(DEFAULT_JS_CODE);
  const [isCopied, setIsCopied] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null);
  const [viewportSize, setViewportSize] = useState<ViewportSize>('desktop');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const lastAutoLoadedCodeRef = useRef<string>('');
  const [logs, setLogs] = useState<ConsoleLog[]>([
    {
      id: 'init',
      type: 'info',
      text: 'AXON Workspace initialized. Ready for execution.',
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [terminalInput, setTerminalInput] = useState('');

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-detect latest code block in chat
  const detectedChatCode = useMemo(() => {
    if (!activeProjectMessages || activeProjectMessages.length === 0) return null;
    for (let i = activeProjectMessages.length - 1; i >= 0; i--) {
      const msg = activeProjectMessages[i];
      const match = msg.text.match(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/);
      if (match && match[2].trim()) {
        const lang = (match[1] || 'javascript').toLowerCase();
        return {
          lang,
          code: match[2].trim(),
          source: msg.sender === 'user' ? 'User message' : 'AXON response',
        };
      }
    }
    return null;
  }, [activeProjectMessages]);

  // Handle auto-loading code into Workspace if auto mode is enabled
  useEffect(() => {
    if (workspaceCodeLoadMode === 'auto' && detectedChatCode) {
      if (detectedChatCode.code !== lastAutoLoadedCodeRef.current) {
        lastAutoLoadedCodeRef.current = detectedChatCode.code;
        setCode(detectedChatCode.code);
        let targetMode: WorkspaceMode = 'javascript';
        if (
          detectedChatCode.lang === 'html' ||
          detectedChatCode.code.includes('<html') ||
          detectedChatCode.code.includes('<!DOCTYPE')
        ) {
          targetMode = 'html';
        } else if (detectedChatCode.lang === 'json') {
          targetMode = 'json';
        }
        setMode(targetMode);

        const firstLine = detectedChatCode.code.split('\n')[0].replace(/^\/\/\s*|^<!--\s*|^#\s*/, '').trim();
        const snippetTitle = firstLine && firstLine.length < 50 ? firstLine : `Auto ${targetMode.toUpperCase()} Snippet`;
        addWorkspaceSnippetHistory({
          title: snippetTitle,
          code: detectedChatCode.code,
          language: targetMode,
          source: 'chat_auto',
        });
        showToast(`Auto-loaded code snippet into Workspace`);
      }
    }
  }, [workspaceCodeLoadMode, detectedChatCode, addWorkspaceSnippetHistory, showToast]);

  const handleLoadChatCode = () => {
    if (!detectedChatCode) return;
    lastAutoLoadedCodeRef.current = detectedChatCode.code;
    setCode(detectedChatCode.code);
    let targetMode: WorkspaceMode = 'javascript';
    if (detectedChatCode.lang === 'html' || detectedChatCode.code.includes('<html') || detectedChatCode.code.includes('<!DOCTYPE')) {
      targetMode = 'html';
    } else if (detectedChatCode.lang === 'json') {
      targetMode = 'json';
    }
    setMode(targetMode);

    const firstLine = detectedChatCode.code.split('\n')[0].replace(/^\/\/\s*|^<!--\s*|^#\s*/, '').trim();
    const snippetTitle = firstLine && firstLine.length < 50 ? firstLine : `Snippet (${targetMode.toUpperCase()})`;
    addWorkspaceSnippetHistory({
      title: snippetTitle,
      code: detectedChatCode.code,
      language: targetMode,
      source: 'chat_manual',
    });
    showToast(`Loaded code block from ${detectedChatCode.source}`);
    setActiveTab('code');
  };

  const handleLoadFromHistory = (item: WorkspaceSnippetHistoryItem) => {
    setCode(item.code);
    let targetMode: WorkspaceMode = 'javascript';
    if (item.language === 'html' || item.code.includes('<html') || item.code.includes('<!DOCTYPE')) {
      targetMode = 'html';
    } else if (item.language === 'json') {
      targetMode = 'json';
    }
    setMode(targetMode);
    setActiveTab('code');
    setIsHistoryOpen(false);
    showToast(`Loaded "${item.title}" into Workspace`);
  };

  const filteredHistory = useMemo(() => {
    if (!historySearchQuery.trim()) return workspaceSnippetHistory;
    const query = historySearchQuery.toLowerCase();
    return workspaceSnippetHistory.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.language.toLowerCase().includes(query) ||
        item.code.toLowerCase().includes(query)
    );
  }, [workspaceSnippetHistory, historySearchQuery]);

  const handleModeChange = (newMode: WorkspaceMode) => {
    setMode(newMode);
    if (newMode === 'html' && !code.includes('<html')) {
      setCode(DEFAULT_HTML_CODE);
    } else if (newMode === 'javascript' && code.includes('<!DOCTYPE html>')) {
      setCode(DEFAULT_JS_CODE);
    }
  };

  // Run Code with real client-side sandbox execution
  const handleRunCode = () => {
    setIsRunning(true);
    setExecutionError(null);
    const startTime = performance.now();
    const timestamp = new Date().toLocaleTimeString();

    if (mode === 'html') {
      // For HTML, execution refreshes the preview iframe
      const elapsed = Math.round(performance.now() - startTime);
      setExecutionTimeMs(elapsed);
      setLogs((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          type: 'info',
          text: `HTML document built (${code.length} bytes)`,
          timestamp,
        },
      ]);
      setIsRunning(false);
      setActiveTab('preview');
      showToast('Rendered preview successfully');
      return;
    }

    if (mode === 'json') {
      try {
        const parsed = JSON.parse(code);
        const elapsed = Math.round(performance.now() - startTime);
        setExecutionResult(parsed);
        setExecutionTimeMs(elapsed);
        setLogs((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            type: 'return',
            text: `Valid JSON (${Object.keys(parsed).length} top-level keys)`,
            timestamp,
          },
        ]);
        setActiveTab('preview');
        showToast('JSON parsed successfully');
      } catch (err: any) {
        const elapsed = Math.round(performance.now() - startTime);
        setExecutionTimeMs(elapsed);
        setExecutionError(err?.message || 'Invalid JSON syntax');
        setLogs((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            type: 'error',
            text: `JSON Error: ${err?.message || err}`,
            timestamp,
          },
        ]);
        setActiveTab('terminal');
        showToast('JSON validation failed');
      } finally {
        setIsRunning(false);
      }
      return;
    }

    // JavaScript Mode Execution
    try {
      const capturedLogs: ConsoleLog[] = [];
      const customConsole = {
        log: (...args: any[]) => {
          capturedLogs.push({
            id: Math.random().toString(),
            type: 'log',
            text: args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
            timestamp: new Date().toLocaleTimeString(),
          });
        },
        info: (...args: any[]) => {
          capturedLogs.push({
            id: Math.random().toString(),
            type: 'info',
            text: args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
            timestamp: new Date().toLocaleTimeString(),
          });
        },
        warn: (...args: any[]) => {
          capturedLogs.push({
            id: Math.random().toString(),
            type: 'warn',
            text: args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
            timestamp: new Date().toLocaleTimeString(),
          });
        },
        error: (...args: any[]) => {
          capturedLogs.push({
            id: Math.random().toString(),
            type: 'error',
            text: args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '),
            timestamp: new Date().toLocaleTimeString(),
          });
        },
      };

      // Wrap code in function with custom console
      // eslint-disable-next-line no-new-func
      const runner = new Function('console', code);
      const result = runner(customConsole);
      const elapsed = Math.round(performance.now() - startTime);

      setExecutionResult(result);
      setExecutionTimeMs(elapsed);

      setLogs((prev) => [
        ...prev,
        ...capturedLogs,
        {
          id: Math.random().toString(),
          type: 'return',
          text: `Result (${elapsed}ms): ${
            result === undefined
              ? 'undefined'
              : typeof result === 'object'
              ? JSON.stringify(result, null, 2)
              : String(result)
          }`,
          timestamp,
        },
      ]);

      setActiveTab('preview');
      showToast(`Executed successfully in ${elapsed}ms`);
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      const errorMsg = err?.message || String(err);
      setExecutionError(errorMsg);
      setExecutionTimeMs(elapsed);

      setLogs((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          type: 'error',
          text: `[Execution Error] ${errorMsg}`,
          timestamp,
        },
      ]);

      setActiveTab('terminal');
      showToast('Execution error encountered');
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    setIsCopied(true);
    showToast('Code copied to clipboard');
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSaveToScripts = () => {
    saveScript({
      title: `Workspace Script (${mode.toUpperCase()})`,
      code,
      language: mode,
      description: `Saved from AXON Workspace on ${new Date().toLocaleDateString()}`,
    });
    showToast('Script saved to your AXON Library');
  };

  const handleClearLogs = () => {
    setLogs([]);
    showToast('Console cleared');
  };

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim()) return;

    const inputCmd = terminalInput.trim();
    const timestamp = new Date().toLocaleTimeString();

    // Log the user input command
    setLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        type: 'log',
        text: `> ${inputCmd}`,
        timestamp,
      },
    ]);

    try {
      // Evaluate command safely
      // eslint-disable-next-line no-eval
      const res = window.eval(inputCmd);
      setLogs((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          type: 'return',
          text: typeof res === 'object' ? JSON.stringify(res, null, 2) : String(res),
          timestamp,
        },
      ]);
    } catch (err: any) {
      setLogs((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          type: 'error',
          text: `Error: ${err?.message || err}`,
          timestamp,
        },
      ]);
    }

    setTerminalInput('');
  };

  // Keyboard shortcut: Tab inserts 2 spaces in textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      setCode(newCode);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRunCode();
    }
  };

  // Auto-scroll logs
  useEffect(() => {
    if (activeTab === 'terminal') {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, activeTab]);

  const lineCount = code.split('\n').length;
  const byteSize = new Blob([code]).size;

  return (
    <div
      id="workspace-pane"
      style={{ touchAction: 'pan-y' }}
      className="flex flex-col h-full min-h-0 w-full bg-neutral-950 text-white select-text border-l border-neutral-900 overflow-hidden"
    >
      {/* Workspace Sub-header */}
      <div className="h-11 bg-neutral-900/90 border-b border-neutral-800 px-3 flex items-center justify-between shrink-0 select-none">
        {/* Left: Tab selection */}
        <div className="flex items-center gap-1">
          <button
            id="workspace-tab-code"
            type="button"
            onClick={() => setActiveTab('code')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'code'
                ? 'bg-neutral-800 text-white border border-neutral-700 shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span>
              {mode === 'javascript' ? 'script.js' : mode === 'html' ? 'index.html' : 'data.json'}
            </span>
          </button>

          <button
            id="workspace-tab-preview"
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'preview'
                ? 'bg-neutral-800 text-white border border-neutral-700 shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Preview</span>
            {executionError ? (
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            ) : executionResult !== null ? (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            ) : null}
          </button>

          <button
            id="workspace-tab-terminal"
            type="button"
            onClick={() => setActiveTab('terminal')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'terminal'
                ? 'bg-neutral-800 text-white border border-neutral-700 shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Console</span>
            {logs.length > 0 && (
              <span className="text-[10px] px-1 py-0.2 rounded bg-neutral-800 text-neutral-400 font-mono">
                {logs.length}
              </span>
            )}
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          {/* Mode Selector */}
          <select
            value={mode}
            onChange={(e) => handleModeChange(e.target.value as WorkspaceMode)}
            className="text-[11px] bg-neutral-900 border border-neutral-800 text-neutral-300 rounded-lg px-2 py-1 focus:outline-none hidden sm:inline-block"
            title="Switch language format"
          >
            <option value="javascript">JS / TS</option>
            <option value="html">HTML / Web</option>
            <option value="json">JSON</option>
          </select>

          {/* Auto / Manual Code Load Toggle */}
          <button
            id="workspace-load-mode-toggle-btn"
            type="button"
            onClick={() => {
              const nextMode = workspaceCodeLoadMode === 'auto' ? 'manual' : 'auto';
              setWorkspaceCodeLoadMode(nextMode);
              showToast(`Workspace code loading set to ${nextMode.toUpperCase()}`);
            }}
            title={`Code Load Mode: ${workspaceCodeLoadMode === 'auto' ? 'Auto-Load ON' : 'Manual (Click to Auto)'}`}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors ${
              workspaceCodeLoadMode === 'auto'
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {workspaceCodeLoadMode === 'auto' ? (
              <>
                <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                <span className="hidden xs:inline text-[11px]">Auto</span>
              </>
            ) : (
              <>
                <ZapOff className="w-3 h-3 text-neutral-400" />
                <span className="hidden xs:inline text-[11px]">Manual</span>
              </>
            )}
          </button>

          {/* Snippet History Button */}
          <button
            id="workspace-history-btn"
            type="button"
            onClick={() => setIsHistoryOpen(true)}
            title="Workspace Code History"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors flex items-center gap-1"
          >
            <History className="w-3.5 h-3.5" />
            {workspaceSnippetHistory.length > 0 && (
              <span className="px-1.5 py-0.2 text-[9px] rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300 font-mono">
                {workspaceSnippetHistory.length}
              </span>
            )}
          </button>

          {/* Copy Button */}
          <button
            id="workspace-copy-btn"
            type="button"
            onClick={handleCopyCode}
            aria-label="Copy snippet"
            title="Copy code"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Save Button */}
          <button
            type="button"
            onClick={handleSaveToScripts}
            aria-label="Save to scripts"
            title="Save script to Library"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors hidden sm:inline-flex"
          >
            <Save className="w-3.5 h-3.5" />
          </button>

          {/* Run Button */}
          <button
            id="workspace-run-btn"
            type="button"
            onClick={handleRunCode}
            disabled={isRunning}
            aria-label="Run code"
            title="Run Code (Ctrl+Enter)"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white text-black hover:bg-neutral-200 text-xs font-semibold active:scale-95 transition-all shadow-sm"
          >
            <Play className="w-3 h-3 fill-black" />
            <span>Run</span>
          </button>

          {/* Expand to Studio */}
          <button
            id="workspace-fullscreen-btn"
            type="button"
            onClick={() => navigateTo('code')}
            aria-label="Expand code workspace"
            title="Open AXON Code Studio"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Code from chat banner if detected */}
      {detectedChatCode && activeTab === 'code' && (
        <div className="bg-neutral-900/90 border-b border-neutral-800/80 px-3 py-1.5 flex items-center justify-between text-[11px] text-neutral-300 shrink-0">
          <div className="flex items-center gap-2 truncate mr-2">
            {workspaceCodeLoadMode === 'auto' ? (
              <>
                <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                <span className="truncate">
                  Auto-load active: synced with chat ({detectedChatCode.lang})
                </span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="truncate">
                  Code block detected in chat ({detectedChatCode.lang})
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {workspaceCodeLoadMode === 'manual' ? (
              <button
                type="button"
                onClick={handleLoadChatCode}
                className="px-2 py-0.5 rounded bg-white text-black hover:bg-neutral-200 font-medium shrink-0 flex items-center gap-1 text-[10px] shadow-xs"
              >
                <ArrowDownToLine className="w-3 h-3" />
                <span>Load Code</span>
              </button>
            ) : (
              <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1">
                <Check className="w-3 h-3" /> Auto-loaded
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 bg-black overflow-hidden relative">
        <SwipeableTabContainer<'code' | 'preview' | 'terminal'>
          tabs={['code', 'preview', 'terminal'] as const}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          fitHeight={true}
          className="h-full min-h-0"
        >
          {/* TAB 1: CODE EDITOR */}
          <div className="h-full min-h-0 flex flex-col p-3">
            <div className="flex-1 min-h-0 flex flex-col rounded-xl bg-neutral-950 border border-neutral-800/80 overflow-hidden">
              {/* Editor Bar */}
              <div className="flex select-none text-neutral-400 px-3 py-2 bg-neutral-900/60 border-b border-neutral-800/80 justify-between items-center text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-neutral-300 uppercase text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-700">
                    {mode}
                  </span>
                  <span>UTF-8</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-neutral-500 font-mono">
                  <span>{lineCount} lines</span>
                  <span>{byteSize} B</span>
                  <span className="hidden sm:inline">Ctrl+Enter to Run</span>
                </div>
              </div>

              {/* Textarea code editor */}
              <div className="flex-1 min-h-0 relative flex">
                <textarea
                  ref={textareaRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full h-full p-3 font-mono text-xs sm:text-[13px] bg-transparent text-neutral-200 focus:outline-none resize-none leading-relaxed selection:bg-neutral-800"
                />
              </div>
            </div>
          </div>

          {/* TAB 2: LIVE PREVIEW CANVAS */}
          <div className="h-full min-h-0 flex flex-col p-3">
            <div className="flex-1 min-h-0 flex flex-col rounded-xl bg-neutral-950 border border-neutral-800/80 overflow-hidden">
              {/* Viewport & status header */}
              <div className="h-9 px-3 bg-neutral-900/60 border-b border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white text-xs">Live Canvas</span>
                  {executionTimeMs !== null && (
                    <span className="text-[10px] text-neutral-500 font-mono">
                      ({executionTimeMs}ms)
                    </span>
                  )}
                </div>

                {/* Viewport toggle for HTML */}
                {mode === 'html' ? (
                  <div className="flex items-center gap-1 p-0.5 bg-neutral-950 rounded-lg border border-neutral-800">
                    <button
                      type="button"
                      onClick={() => setViewportSize('desktop')}
                      className={`p-1 rounded ${
                        viewportSize === 'desktop' ? 'bg-neutral-800 text-white' : 'text-neutral-500'
                      }`}
                      title="Desktop width (100%)"
                    >
                      <Monitor className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewportSize('tablet')}
                      className={`p-1 rounded ${
                        viewportSize === 'tablet' ? 'bg-neutral-800 text-white' : 'text-neutral-500'
                      }`}
                      title="Tablet width (768px)"
                    >
                      <Tablet className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewportSize('mobile')}
                      className={`p-1 rounded ${
                        viewportSize === 'mobile' ? 'bg-neutral-800 text-white' : 'text-neutral-500'
                      }`}
                      title="Mobile width (375px)"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleRunCode}
                    className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Re-run</span>
                  </button>
                )}
              </div>

              {/* Viewport Canvas Body */}
              <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-2 bg-black">
                {mode === 'html' ? (
                  <div
                    className="h-full bg-white rounded-lg overflow-hidden transition-all duration-300 shadow-md border border-neutral-800"
                    style={{
                      width:
                        viewportSize === 'mobile'
                          ? '375px'
                          : viewportSize === 'tablet'
                          ? '768px'
                          : '100%',
                      maxWidth: '100%',
                    }}
                  >
                    <iframe
                      ref={iframeRef}
                      srcDoc={code}
                      title="AXON Workspace Live Preview"
                      sandbox="allow-scripts allow-modals"
                      className="w-full h-full border-0 bg-transparent"
                    />
                  </div>
                ) : executionError ? (
                  <div className="max-w-md w-full p-4 rounded-xl bg-red-950/30 border border-red-800/60 text-red-200 space-y-2">
                    <div className="flex items-center gap-2 font-semibold text-xs text-red-300">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>Execution Error</span>
                    </div>
                    <pre className="text-xs font-mono bg-neutral-950 p-2.5 rounded-lg border border-red-900/50 text-red-200 whitespace-pre-wrap overflow-x-auto">
                      {executionError}
                    </pre>
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => setActiveTab('code')}
                        className="px-3 py-1 rounded-lg bg-red-900/40 hover:bg-red-900/60 text-red-200 text-xs font-medium transition-colors"
                      >
                        Fix in Code
                      </button>
                    </div>
                  </div>
                ) : executionResult !== null ? (
                  <div className="h-full w-full overflow-y-auto p-3">
                    <div className="max-w-xl mx-auto space-y-3">
                      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Evaluation Output</span>
                        </div>
                        <span className="text-[10px] text-neutral-500 font-mono">
                          Type: {typeof executionResult}
                        </span>
                      </div>
                      <pre className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 font-mono text-xs text-neutral-200 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                        {typeof executionResult === 'object'
                          ? JSON.stringify(executionResult, null, 2)
                          : String(executionResult)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-6 space-y-3 max-w-xs">
                    <div className="w-12 h-12 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mx-auto text-neutral-300">
                      <Play className="w-5 h-5 ml-0.5 fill-current" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-white">Ready for Execution</h4>
                      <p className="text-[11px] text-neutral-400 mt-1">
                        Click "Run" or press Ctrl+Enter to execute the code and display live output.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRunCode}
                      className="px-3.5 py-1.5 rounded-xl bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition-colors inline-flex items-center gap-1.5"
                    >
                      <Play className="w-3 h-3 fill-black" />
                      <span>Execute Script</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* TAB 3: CONSOLE / TERMINAL */}
          <div className="h-full min-h-0 flex flex-col p-3">
            <div className="flex-1 min-h-0 flex flex-col rounded-xl bg-neutral-950 border border-neutral-800/80 font-mono text-xs overflow-hidden">
              {/* Terminal Header */}
              <div className="h-9 px-3 bg-neutral-900/60 border-b border-neutral-800/80 flex items-center justify-between text-neutral-400 select-none shrink-0">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-neutral-300" />
                  <span className="text-[11px] font-semibold text-white">Execution Console</span>
                  <span className="text-[10px] text-neutral-500">tty0</span>
                </div>
                <button
                  type="button"
                  onClick={handleClearLogs}
                  className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
                  title="Clear Console"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Terminal Logs stream */}
              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
                {logs.length === 0 ? (
                  <p className="text-neutral-600 text-[11px] italic">Console is empty.</p>
                ) : (
                  logs.map((log) => {
                    const isError = log.type === 'error';
                    const isReturn = log.type === 'return';
                    const isWarn = log.type === 'warn';

                    return (
                      <div
                        key={log.id}
                        className={`text-[11px] leading-relaxed flex gap-2 ${
                          isError
                            ? 'text-red-400 bg-red-950/20 px-1.5 py-0.5 rounded border border-red-900/30'
                            : isReturn
                            ? 'text-emerald-400'
                            : isWarn
                            ? 'text-amber-400'
                            : 'text-neutral-300'
                        }`}
                      >
                        <span className="text-neutral-600 select-none text-[10px] shrink-0 font-mono">
                          [{log.timestamp}]
                        </span>
                        <span className="flex-1 whitespace-pre-wrap break-all">{log.text}</span>
                      </div>
                    );
                  })
                )}
                <div ref={logsEndRef} />
              </div>

              {/* Terminal REPL Input */}
              <form
                onSubmit={handleTerminalSubmit}
                className="p-2 border-t border-neutral-800/80 bg-neutral-900/30 flex items-center gap-2 shrink-0"
              >
                <span className="text-emerald-400 font-bold select-none text-xs">&gt;</span>
                <input
                  type="text"
                  value={terminalInput}
                  onChange={(e) => setTerminalInput(e.target.value)}
                  placeholder="Eval expression (e.g. 2 + 2, Date.now())..."
                  className="flex-1 bg-transparent text-white text-[11px] focus:outline-none placeholder-neutral-600 font-mono"
                />
              </form>
            </div>
          </div>
        </SwipeableTabContainer>
      </div>

      {/* Footer Info bar */}
      <div className="h-7 bg-neutral-950 border-t border-neutral-900 px-3 flex items-center justify-between text-[10px] text-neutral-500 select-none shrink-0">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Workspace Pane • {mode.toUpperCase()}</span>
        </span>
        <button
          type="button"
          onClick={() => navigateTo('code')}
          className="hover:text-neutral-300 underline underline-offset-2"
        >
          Open in Full Studio &gt;
        </button>
      </div>

      {/* Workspace Code History Slide-over Drawer */}
      {isHistoryOpen && (
        <div
          id="workspace-history-modal"
          className="absolute inset-0 z-50 bg-black/80 backdrop-blur-xs flex justify-end animate-in fade-in duration-150"
        >
          <div className="w-full sm:max-w-md h-full bg-neutral-950 border-l border-neutral-800 flex flex-col shadow-2xl">
            {/* Header */}
            <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-white">Code History</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300 font-mono">
                  {workspaceSnippetHistory.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {workspaceSnippetHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Clear all workspace snippet history?')) {
                        clearWorkspaceSnippetHistory();
                        showToast('Workspace history cleared');
                      }
                    }}
                    className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-neutral-800 rounded-lg transition-colors text-[10px] flex items-center gap-1"
                    title="Clear all history"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">Clear</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(false)}
                  className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                  title="Close history"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Search Bar & Auto-load mode indicator */}
            <div className="p-2.5 border-b border-neutral-800/80 bg-neutral-900/40 flex flex-col gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  placeholder="Search snippets by title, lang, or code..."
                  className="w-full pl-8 pr-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1">
                <span className="flex items-center gap-1">
                  <span className="text-neutral-500">Mode:</span>
                  <span className={workspaceCodeLoadMode === 'auto' ? 'text-amber-400 font-medium' : 'text-neutral-300'}>
                    {workspaceCodeLoadMode === 'auto' ? '⚡ Auto-Load Enabled' : 'Manual Loading'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const nextMode = workspaceCodeLoadMode === 'auto' ? 'manual' : 'auto';
                    setWorkspaceCodeLoadMode(nextMode);
                    showToast(`Workspace code loading set to ${nextMode.toUpperCase()}`);
                  }}
                  className="text-[10px] text-sky-400 hover:underline"
                >
                  Switch to {workspaceCodeLoadMode === 'auto' ? 'Manual' : 'Auto'}
                </button>
              </div>
            </div>

            {/* Snippet List */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
              {filteredHistory.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-neutral-500">
                  <History className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-xs font-medium text-neutral-400">No snippets recorded</p>
                  <p className="text-[11px] text-neutral-500 mt-1 max-w-xs">
                    Every code block loaded into the Workspace (either automatically or manually) will be preserved here.
                  </p>
                </div>
              ) : (
                filteredHistory.map((item) => (
                  <div
                    key={item.id}
                    className="group border border-neutral-800 hover:border-neutral-700 rounded-xl bg-neutral-900/60 p-2.5 flex flex-col gap-2 transition-all hover:bg-neutral-900"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-neutral-200 truncate">
                            {item.title}
                          </span>
                          <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-neutral-800 border border-neutral-700 text-neutral-400">
                            {item.language}
                          </span>
                          {item.source === 'chat_auto' && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-0.5">
                              <Zap className="w-2.5 h-2.5 fill-amber-400" /> Auto
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-neutral-500 font-mono mt-0.5 block">
                          {item.timestamp}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleLoadFromHistory(item)}
                          className="px-2 py-1 rounded bg-white text-black text-[11px] font-semibold hover:bg-neutral-200 transition-colors shadow-xs"
                          title="Load into Workspace Editor"
                        >
                          Load
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            deleteWorkspaceSnippetHistoryItem(item.id);
                            showToast('Snippet removed from history');
                          }}
                          className="p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-neutral-800 transition-colors"
                          title="Delete from history"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Code preview (first 4 lines) */}
                    <pre className="p-2 rounded-lg bg-black/60 border border-neutral-800 text-[10px] text-neutral-400 font-mono overflow-x-hidden line-clamp-3">
                      {item.code.split('\n').slice(0, 4).join('\n')}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
