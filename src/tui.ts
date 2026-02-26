/**
 * Custom ANSI TUI — scrolling conversation region + fixed status/input footer.
 *
 * Layout (top to bottom):
 *   ┌─────────────────────────────┐
 *   │  Scrolling conversation     │  ← ANSI scroll region, rows 1..N-2
 *   │  (tokens stream here)       │
 *   ├─────────────────────────────┤
 *   │  Status bar                 │  ← Fixed at row N-1
 *   │  > input                    │  ← Fixed at row N (readline)
 *   └─────────────────────────────┘
 *
 * The scroll region means text written at the bottom pushes content up
 * naturally, like a normal terminal. Status bar and input stay fixed.
 */

import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import type { AgentFramework } from '@connectome/agent-framework';
import type { SubagentModule, ActiveSubagent } from './modules/subagent-module.js';
import { handleCommand } from './commands.js';

// ANSI escape helpers
const ESC = '\x1b[';
const alt = (on: boolean) => ESC + (on ? '?1049h' : '?1049l');  // alternate screen
const clear = () => ESC + '2J' + ESC + 'H';
const scrollRegion = (top: number, bottom: number) => `${ESC}${top};${bottom}r`;
const moveTo = (row: number, col: number) => `${ESC}${row};${col}H`;
const eraseLine = () => ESC + '2K';
const sgr = (code: string) => `${ESC}${code}m`;
const RESET = sgr('0');
const DIM = sgr('2');
const BOLD = sgr('1');
const FG_GREEN = sgr('32');
const FG_YELLOW = sgr('33');
const FG_CYAN = sgr('36');
const FG_MAGENTA = sgr('35');
const FG_RED = sgr('31');
const FG_GRAY = sgr('90');
const SHOW_CURSOR = ESC + '?25h';
const HIDE_CURSOR = ESC + '?25l';
const SAVE_CURSOR = ESC + 's';
const RESTORE_CURSOR = ESC + 'u';

interface TuiState {
  status: string;
  tool: string | null;
  subagents: ActiveSubagent[];
  showSubagents: boolean;
  inputBuffer: string;
}

export async function runTui(framework: AgentFramework): Promise<void> {
  const { stdout, stdin } = process;
  if (!stdout.isTTY) throw new Error('TUI requires a TTY');

  let rows = stdout.rows ?? 24;
  let cols = stdout.columns ?? 80;

  const state: TuiState = {
    status: 'idle',
    tool: null,
    subagents: [],
    showSubagents: false,
    inputBuffer: '',
  };

  // Track whether we're mid-stream (tokens flowing) to know whether to newline
  let streaming = false;

  // -- Layout calculation --
  const statusRow = () => rows - 1;
  const inputRow = () => rows;
  const scrollBottom = () => rows - 2;

  // -- Screen setup --
  function setupScreen() {
    stdout.write(alt(true));        // alternate screen
    stdout.write(clear());
    stdout.write(scrollRegion(1, scrollBottom()));
    drawStatusBar();
    drawInputLine();
  }

  function teardownScreen() {
    stdout.write(scrollRegion(1, rows)); // reset scroll region
    stdout.write(alt(false));            // back to main screen
  }

  // -- Writing to scroll region --
  // Positions cursor in the scroll region and writes. Text naturally scrolls up.
  function writeToScroll(text: string) {
    stdout.write(SAVE_CURSOR + HIDE_CURSOR);
    stdout.write(moveTo(scrollBottom(), 1));  // bottom of scroll region
    stdout.write(text);
    stdout.write(RESTORE_CURSOR + SHOW_CURSOR);
  }

  function scrollWrite(text: string, style?: string) {
    const prefix = style ?? '';
    const suffix = style ? RESET : '';
    // Ensure previous line is terminated
    writeToScroll('\n' + prefix + text + suffix);
  }

  function scrollWriteRaw(text: string) {
    // Write raw text into scroll region (for streaming tokens)
    writeToScroll(text);
  }

  // -- Status bar --
  function drawStatusBar() {
    stdout.write(SAVE_CURSOR + HIDE_CURSOR);
    stdout.write(moveTo(statusRow(), 1) + eraseLine());

    const statusColor = state.status === 'idle' ? FG_GREEN
      : state.status === 'error' ? FG_RED
      : FG_YELLOW;

    let bar = `${FG_GRAY}[${RESET}${statusColor}${state.status}${RESET}`;
    if (state.tool) bar += `${FG_YELLOW} | ${state.tool}${RESET}`;

    const running = state.subagents.filter(s => s.status === 'running').length;
    if (running > 0) {
      bar += `${FG_MAGENTA} | ${running} subagent${running > 1 ? 's' : ''}${RESET}`;
      if (!state.showSubagents) bar += `${FG_GRAY}${DIM} Tab: details${RESET}`;
    }

    bar += `${FG_GRAY}]${RESET}`;

    // Subagent details (inline, after the bar)
    if (state.showSubagents && state.subagents.length > 0) {
      const details = state.subagents
        .filter(s => s.status === 'running')
        .map(s => {
          const elapsed = Math.floor((Date.now() - s.startedAt) / 1000);
          const msg = s.statusMessage ? `: ${s.statusMessage}` : '';
          return `${FG_CYAN}${s.name}${RESET}${FG_GRAY}(${elapsed}s${msg})${RESET}`;
        })
        .join(' ');
      if (details) bar += ' ' + details;
    }

    stdout.write(bar);
    stdout.write(RESTORE_CURSOR + SHOW_CURSOR);
  }

  // -- Input line --
  function drawInputLine() {
    stdout.write(SAVE_CURSOR + HIDE_CURSOR);
    stdout.write(moveTo(inputRow(), 1) + eraseLine());
    stdout.write(`${BOLD}${FG_CYAN}> ${RESET}`);
    stdout.write(RESTORE_CURSOR + SHOW_CURSOR);
  }

  // -- Trace listener --
  function onTrace(event: Record<string, unknown>) {
    switch (event.type) {
      case 'inference:started': {
        const agent = event.agentName as string;
        // Only show newline for main agent, subagent starts are quieter
        if (agent === 'researcher') {
          state.status = 'thinking';
          streaming = true;
          scrollWrite('', undefined); // blank line before response
        } else {
          // Subagent started — update status
          const sa = state.subagents.find(s => s.name === agent || `spawn-${s.name}` === agent || `fork-${s.name}` === agent);
          if (sa) sa.statusMessage = 'thinking';
        }
        drawStatusBar();
        break;
      }

      case 'inference:tokens': {
        const content = event.content as string;
        const agent = event.agentName as string;
        if (content && agent === 'researcher') {
          scrollWriteRaw(content);
        }
        // Subagent tokens are silent in the main scroll — they report results
        break;
      }

      case 'inference:completed': {
        const agent = event.agentName as string;
        if (agent === 'researcher') {
          state.status = 'idle';
          state.tool = null;
          if (streaming) {
            streaming = false;
            scrollWriteRaw('\n');
          }
        }
        drawStatusBar();
        break;
      }

      case 'inference:failed': {
        const err = event.error as string;
        const agent = event.agentName as string;
        if (agent === 'researcher') {
          state.status = 'error';
          streaming = false;
          scrollWrite(`Error: ${err}`, FG_RED);
        } else {
          scrollWrite(`[${agent}] Error: ${err}`, FG_RED + DIM);
        }
        drawStatusBar();
        break;
      }

      case 'inference:tool_calls_yielded': {
        const calls = event.calls as Array<{ name: string }>;
        const agent = event.agentName as string;
        const names = calls.map(c => c.name).join(', ');

        if (agent === 'researcher') {
          state.status = 'tools';
          state.tool = names;
          if (streaming) {
            streaming = false;
            scrollWriteRaw('\n');
          }
          scrollWrite(`[tools] ${names}`, FG_YELLOW + DIM);
        } else {
          // Subagent tool call — show dimmed
          const shortAgent = agent.replace(/^(spawn|fork)-/, '').replace(/-\d+$/, '');
          scrollWrite(`  [${shortAgent}] ${names}`, FG_GRAY);
          const sa = state.subagents.find(s =>
            agent.includes(s.name)
          );
          if (sa) {
            sa.toolCallsCount += calls.length;
            sa.statusMessage = names.split(':').pop();
          }
        }
        drawStatusBar();
        break;
      }

      case 'inference:stream_resumed': {
        const agent = event.agentName as string;
        if (agent === 'researcher') {
          state.status = 'thinking';
          state.tool = null;
          streaming = true;
        }
        drawStatusBar();
        break;
      }

      case 'tool:started': {
        const tool = event.tool as string;
        const agent = event.agentName as string;
        if (agent === 'researcher') {
          state.tool = tool;
          drawStatusBar();
        }
        break;
      }
    }
  }

  // -- Subagent polling --
  const subagentModule = framework.getAllModules().find(m => m.name === 'subagent') as SubagentModule | undefined;
  const pollInterval = setInterval(() => {
    if (subagentModule) {
      state.subagents = [...subagentModule.activeSubagents.values()];
      drawStatusBar();
    }
  }, 500);

  // -- Resize handler --
  function onResize() {
    rows = stdout.rows ?? 24;
    cols = stdout.columns ?? 80;
    stdout.write(scrollRegion(1, scrollBottom()));
    drawStatusBar();
    drawInputLine();
  }
  stdout.on('resize', onResize);

  // -- Readline setup --
  // We use readline in raw-ish mode but positioned on the input row
  stdin.setRawMode(true);
  const rl = createInterface({
    input: stdin,
    output: stdout,
    prompt: '',
    terminal: true,
  });

  // Position readline's cursor on the input row
  function positionInput() {
    stdout.write(moveTo(inputRow(), 3)); // after "> "
  }

  // -- Screen init --
  setupScreen();
  scrollWrite('Zulip Knowledge App. Type /help for commands.', FG_GRAY);
  positionInput();

  // -- Trace registration --
  framework.onTrace(onTrace as (e: unknown) => void);

  // -- Input handling --
  // Tab key for subagent panel toggle — need to intercept before readline
  stdin.on('data', (data: Buffer) => {
    if (data[0] === 0x09) { // Tab
      state.showSubagents = !state.showSubagents;
      drawStatusBar();
    }
  });

  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    drawInputLine();
    positionInput();

    if (!trimmed) return;

    if (trimmed.startsWith('/')) {
      const result = handleCommand(trimmed, framework);
      if (result.quit) {
        rl.close();
        return;
      }
      if (trimmed === '/clear') {
        stdout.write(SAVE_CURSOR);
        stdout.write(scrollRegion(1, scrollBottom()));
        // Clear the scroll region
        for (let i = 1; i <= scrollBottom(); i++) {
          stdout.write(moveTo(i, 1) + eraseLine());
        }
        stdout.write(RESTORE_CURSOR);
      } else {
        for (const l of result.lines) {
          scrollWrite(l.text, FG_GRAY);
        }
      }
    } else {
      scrollWrite(`You: ${trimmed}`, FG_GREEN);
      framework.pushEvent({
        type: 'external-message',
        source: 'tui',
        content: trimmed,
        metadata: {},
        triggerInference: true,
      });
    }
    positionInput();
  });

  // -- Wait for exit --
  await new Promise<void>((resolve) => {
    rl.on('close', resolve);
  });

  // -- Cleanup --
  clearInterval(pollInterval);
  stdout.removeListener('resize', onResize);
  framework.offTrace(onTrace as (e: unknown) => void);
  teardownScreen();
  await framework.stop();
}
