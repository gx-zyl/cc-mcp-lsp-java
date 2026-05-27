/**
 * MCP 工具定义 — 使用 VS Code LSP API 连接已有的 JDT.LS
 *
 * 不自己启动 LSP 进程，通过 vscode.commands.executeCommand 调用
 * VS Code 内置 LSP Provider（JDT.LS 已注册）。
 */

import * as vscode from 'vscode';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getCallers, getCallees, listMethods, scan, getStatus, isSidecarRunning, discoverProjectClasspath, cleanProjectCache, cleanAllCache } from './jacg-bridge.js';

/* ───────── 符号种类名称映射 ───────── */

const SYMBOL_KIND_LABEL: Record<number, string> = {
  [vscode.SymbolKind.Class]: 'Class',
  [vscode.SymbolKind.Interface]: 'Interface',
  [vscode.SymbolKind.Enum]: 'Enum',
  [vscode.SymbolKind.Method]: 'Method',
  [vscode.SymbolKind.Constructor]: 'Constructor',
  [vscode.SymbolKind.Field]: 'Field',
};

/* ───────── 工具注册 ───────── */

export function registerTools(server: McpServer, log: (msg: string) => void) {

  /* ─── Tool 1: searchJavaTypes ─── */
  server.tool(
    'searchJavaTypes',
    'Search for Java types (classes, interfaces, enums) in the workspace and dependencies',
    {
      name: z.string().describe('Type name or partial name to search for'),
      matchMode: z
        .enum(['strict', 'fuzzy'])
        .default('strict')
        .describe('"strict": exact match; "fuzzy": broader search'),
    },
    async ({ name, matchMode }) => {
      try {
        const query = matchMode === 'fuzzy' ? `*${name}*` : name;
        const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
          'vscode.executeWorkspaceSymbolProvider',
          query
        );

        if (!symbols || symbols.length === 0) {
          return { content: [{ type: 'text', text: `No Java types found matching "${name}".` }] };
        }

        // 过滤 Java 类型（类、接口、枚举）
        const typeKinds = new Set([
          vscode.SymbolKind.Class,
          vscode.SymbolKind.Interface,
          vscode.SymbolKind.Enum,
        ]);
        const types = symbols.filter((s) => typeKinds.has(s.kind));

        if (types.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `Found ${symbols.length} symbol(s), but none are Java types (class/interface/enum).`,
              },
            ],
          };
        }

        // 按来源分组：项目源码 vs JAR 依赖
        const projectTypes: string[] = [];
        const dependencyTypes: string[] = [];

        for (const sym of types) {
          const kindLabel = SYMBOL_KIND_LABEL[sym.kind] || `Kind(${sym.kind})`;
          const fqn = sym.containerName ? `${sym.containerName}.${sym.name}` : sym.name;
          const uriStr = sym.location.uri.toString();
          const line = sym.location.range.start.line + 1;

          if (uriStr.startsWith('file://')) {
            const filePath = sym.location.uri.fsPath;
            projectTypes.push(`  [src] ${kindLabel} ${fqn}  (${filePath}:${line})`);
          } else {
            dependencyTypes.push(`  [JAR] ${kindLabel} ${fqn}  (${uriStr.substring(0, 100)})`);
          }
        }

        const parts: string[] = [`Found ${types.length} type(s) matching "${name}":\n`];
        if (projectTypes.length > 0) {
          parts.push(`── Project Sources (${projectTypes.length}) ──`);
          parts.push(projectTypes.join('\n'));
          parts.push('');
        }
        if (dependencyTypes.length > 0) {
          parts.push(`── Dependencies / JDK (${dependencyTypes.length}) ──`);
          parts.push(dependencyTypes.join('\n'));
          parts.push('');
        }

        return { content: [{ type: 'text', text: parts.join('\n') }] };
      } catch (err) {
        log(`searchJavaTypes error: ${err}`);
        return {
          content: [{ type: 'text', text: `Error: ${err}` }],
          isError: true,
        };
      }
    }
  );

  /* ─── Tool 2: getSourceCodeByFQN ─── */
  server.tool(
    'getSourceCodeByFQN',
    'Get the full source code of a Java type by its fully qualified name',
    {
      fullyQualifiedName: z
        .string()
        .describe('Fully qualified class name, e.g. "java.util.ArrayList" or "com.example.MyService"'),
      methodNames: z
        .array(z.string())
        .optional()
        .describe('Optional: only return these method(s) from the source'),
    },
    async ({ fullyQualifiedName, methodNames }) => {
      try {
        const result = await getSourceByFqn(fullyQualifiedName, methodNames);
        return {
          content: [{ type: 'text', text: result }],
        };
      } catch (err) {
        log(`getSourceCodeByFQN error: ${err}`);
        return {
          content: [{ type: 'text', text: `Error: ${err}` }],
          isError: true,
        };
      }
    }
  );

  /* ─── Tool 3: analyzeCallGraph（调用图分析 - 需侧车） ─── */

  server.tool(
    'analyzeCallGraph',
    'Analyze method call relationships: upward callers, downward callees, or full call graph',
    {
      command: z
        .enum(['callers', 'callees', 'list', 'scan', 'status', 'clean', 'clean-all'])
        .describe('"callers": who calls me; "callees": who I call; "list": all methods; "scan": trigger analysis; "status": sidecar & project state; "clean": remove current project DB; "clean-all": remove all project DBs'),
      inputDir: z
        .string()
        .optional()
        .describe('DEPRECATED: For "scan", classpath is auto-discovered via redhat.java. This overrides auto-discovery if provided.'),
      className: z
        .string()
        .optional()
        .describe('Filter by class name (e.g. "com.example.MyService"). Only return methods of this class.'),
      methodName: z
        .string()
        .optional()
        .describe('Filter by method name (e.g. "getUserById"). Only return methods with this name.'),
      keyword: z
        .string()
        .optional()
        .describe('Filter method names containing this keyword (for callers/callees/list, combined with className/methodName).'),
    },
    async ({ command, inputDir, className, methodName, keyword }) => {
      const filter = (className || methodName) ? { className, methodName } as const : undefined;
      if (!isSidecarRunning()) {
        return {
          content: [{ type: 'text', text: 'Call-graph sidecar is not running. The Java sidecar process may have failed to start or is still initializing.' }],
        };
      }

      try {
        switch (command) {
          case 'scan': {
            let dirs: string[];
            if (inputDir) {
              // 手动覆盖
              dirs = [inputDir];
            } else {
              // 自动发现 classpath
              const cp = await discoverProjectClasspath(log);
              if (!cp || (cp.compileOutput.length === 0 && cp.dependencyJars.length === 0)) {
                return {
                  content: [{ type: 'text', text: 'Could not auto-discover project classpath. Ensure a Java project is open and redhat.java has finished indexing. You can also provide inputDir manually.' }],
                };
              }
              dirs = [...cp.compileOutput, ...cp.dependencyJars];
              log(`Auto-discovered ${cp.compileOutput.length} compile dir(s) and ${cp.dependencyJars.length} dep jar(s)`);
            }
            const ok = await scan(dirs, log);
            return {
              content: [{ type: 'text', text: ok ? `Scan complete. Analyzed ${dirs.length} path(s).` : 'Scan failed. Check extension logs.' }],
            };
          }
          case 'callers': {
            const nodes = await getCallers(filter);
            const filtered = keyword ? nodes.filter(n => n.method.includes(keyword)) : nodes;
            const lines = formatCallGraph('Upward Callers (who calls this method)', filtered);
            return { content: [{ type: 'text', text: lines }] };
          }
          case 'callees': {
            const nodes = await getCallees(filter);
            const filtered = keyword ? nodes.filter(n => n.method.includes(keyword)) : nodes;
            const lines = formatCallGraph('Downward Callees (who this method calls)', filtered);
            return { content: [{ type: 'text', text: lines }] };
          }
          case 'list': {
            const methods = await listMethods(filter);
            const filtered = keyword ? methods.filter(m => m.includes(keyword)) : methods;
            return {
              content: [{ type: 'text', text: `${filtered.length} methods:\n${filtered.join('\n')}` }],
            };
          }
          case 'status': {
            const s = await getStatus();
            return {
              content: [{ type: 'text', text: `Sidecar status:\n  Scanned: ${s.scanned}\n  DB: ${s.dbDir}\n  Project ID: ${s.projectId}` }],
            };
          }
          case 'clean': {
            const ok = await cleanProjectCache(log);
            return { content: [{ type: 'text', text: ok ? 'Project cache cleared. Run scan again to regenerate.' : 'Clean failed.' }] };
          }
          case 'clean-all': {
            const ok = await cleanAllCache(log);
            return { content: [{ type: 'text', text: ok ? 'All project caches cleared.' : 'Clean-all failed.' }] };
          }
        }
      } catch (err) {
        log(`analyzeCallGraph error: ${err}`);
        return { content: [{ type: 'text', text: `Error: ${err}` }], isError: true };
      }
    }
  );
}

function formatCallGraph(title: string, nodes: { method: string; related: string[] }[]): string {
  const lines: string[] = [`== ${title} ==`, `Total: ${nodes.length} nodes`, ''];
  for (const n of nodes) {
    lines.push(`  ${n.method}`);
    for (const r of n.related) {
      lines.push(`    → ${r}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/* ───────── 查询实现 ───────── */

async function getSourceByFqn(fqn: string, methodNames?: string[]): Promise<string> {
  const parts = fqn.split('.');
  const simpleName = parts.pop()!;

  // 搜索符号
  const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
    'vscode.executeWorkspaceSymbolProvider',
    simpleName
  );

  if (!symbols || symbols.length === 0) {
    return `Type "${fqn}" not found.\n\nPossible reasons:\n- The FQN is incorrect\n- JDT.LS hasn't finished indexing\n- The class doesn't exist in workspace or dependencies`;
  }

  // 匹配目标类型：优先按 containerName（包名）精确匹配
  const match = symbols.find(
    (s) => s.name === simpleName && s.containerName === parts.join('.')
  ) || symbols.find(
    (s) => s.name === simpleName
  );

  if (!match) {
    const candidates = symbols
      .filter((s) => s.name === simpleName)
      .map((s) => `  ${s.containerName ? `${s.containerName}.` : ''}${s.name}`)
      .join('\n');
    return `Exact match not found for "${fqn}". Candidates:\n${candidates || '  (none)'}`;
  }

  const uri = match.location.uri;

  // 处理 JAR 依赖（jdt:// URI）
  if (uri.scheme !== 'file') {
    return `"${fqn}" is from ${match.containerName || 'a dependency'}.\n` +
      `URI: ${uri.toString()}\n\n` +
      `Source is in a compiled JAR. To view source, add the source jar to your build configuration.`;
  }

  // 打开文档并读取源码
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    let source = doc.getText();

    // 可选：按方法名过滤
    if (methodNames && methodNames.length > 0) {
      source = await filterMethods(source, uri, methodNames);
    }

    const filePath = uri.fsPath;
    return `// ${fqn}\n// File: ${filePath}\n\n${source}`;
  } catch {
    return `Unable to open source file for "${fqn}" at ${uri.fsPath}`;
  }
}

/**
 * 按方法名过滤源码，只保留指定方法的代码
 */
async function filterMethods(source: string, uri: vscode.Uri, methodNames: string[]): Promise<string> {
  try {
    const docSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      uri
    );

    if (!docSymbols || docSymbols.length === 0) return source;

    // 收集匹配方法的行范围
    const lines = source.split('\n');
    const selectedLines = new Set<number>();

    for (const sym of flattenSymbols(docSymbols)) {
      if (
        (sym.kind === vscode.SymbolKind.Method || sym.kind === vscode.SymbolKind.Constructor) &&
        methodNames.some((n) => sym.name.includes(n))
      ) {
        for (
          let i = sym.range.start.line;
          i <= Math.min(sym.range.end.line, lines.length - 1);
          i++
        ) {
          selectedLines.add(i);
        }
      }
    }

    if (selectedLines.size === 0) return source;

    return Array.from(selectedLines)
      .sort((a, b) => a - b)
      .map((i) => lines[i])
      .join('\n');
  } catch {
    return source;
  }
}

function flattenSymbols(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
  const result: vscode.DocumentSymbol[] = [];
  for (const s of symbols) {
    result.push(s);
    if (s.children) {
      result.push(...flattenSymbols(s.children));
    }
  }
  return result;
}
