import { useState, useEffect } from 'react'
import { useVscodeListener, postMessage, useRequestStatus } from '../shared/hooks'
import type { ServerInfo } from '../shared/types'

export default function DocPanel() {
  const [endpoint, setEndpoint] = useState('http://localhost:38765/mcp')

  useRequestStatus()

  useVscodeListener((msg) => {
    if (msg.type === 'status') {
      const info = msg.data as ServerInfo
      if (info?.running) {
        setEndpoint(`http://${info.host}:${info.port}/mcp`)
      }
    }
  })

  return (
    <div className="doc-body">
      <h1>CC MCP LSP Java — 接口说明</h1>
      <p className="subtitle">
        Streamable HTTP 协议 MCP 服务器，通过 VS Code 内置 LSP API 桥接 JDT.LS (Eclipse Java Language Server)。
        {' '}<a href="https://spec.modelcontextprotocol.io/specification/2025-03-26/" target="_blank">MCP 规范</a>
        {' · '}
        <a href="https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/" target="_blank">LSP 3.17 规范</a>
        {' · '}
        <a href="https://github.com/redhat-developer/vscode-java" target="_blank">JDT.LS (redhat.java)</a>
      </p>

      <TOC />

      <Section id="overview" title="一、架构概述">
        <SubSection title="服务信息">
          <InfoBox items={[
            { label: '协议', value: 'Streamable HTTP (MCP)' },
            { label: '端点', value: endpoint },
            { label: '方法', value: 'POST /mcp' },
            { label: 'Session', value: 'Mcp-Session-Id header 自动管理' },
            { label: '健康检查', value: 'GET /health → { status, sessions }' },
          ]} />
        </SubSection>
        <SubSection title="LSP 桥接原理">
          <p>本扩展<strong>不直接启动 JDT.LS 进程</strong>，而是复用 VS Code 已集成的 JDT.LS。当打开 Java 项目时 <code>redhat.java</code> 扩展自动启动 JDT.LS 并与编辑器建立 LSP 连接。本扩展通过 VS Code 的 <code>commands.executeCommand</code> 调用内置 LSP Provider，底层向 JDT.LS 发送 LSP 请求并返回结果。</p>
          <p>链路：AI Client → MCP → cc-mcp-lsp-java → VS Code API → JDT.LS → LSP → Eclipse JDT</p>
          <p>参考：<a href="https://code.visualstudio.com/api/language-extensions/language-server-extension-guide" target="_blank">VS Code LSP 扩展指南</a> · <a href="https://github.com/eclipse-jdtls/eclipse.jdt.ls" target="_blank">Eclipse JDT.LS</a></p>
        </SubSection>
      </Section>

      <Section id="config" title="二、客户端配置">
        <p>在 Claude Desktop、Cursor 或其他 MCP 客户端中配置：</p>
        <CodeBlock code={`{
  "mcpServers": {
    "cc-mcp-lsp-java": {
      "url": "${endpoint}"
    }
  }
}`} />
        <p><a href="https://modelcontextprotocol.io/quickstart/user" target="_blank">MCP 客户端快速开始 →</a></p>
      </Section>

      <Section id="tools" title="三、工具参考">
        <SubSection id="tool-search" title="1. searchJavaTypes — 搜索 Java 类型">
          <p>调用 <code>executeWorkspaceSymbolProvider</code>，对应 LSP <a href="https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_symbol" target="_blank">workspace/symbol</a>。适用于查找不确定完整路径的类、探索项目中的类型分布。</p>
          <table><tbody>
            <tr><th>参数</th><th>类型</th><th>说明</th></tr>
            <tr><td>name</td><td><Tag type="req">必填</Tag></td><td>类型名称或名称片段，fuzzy 模式自动加通配符 <code>*name*</code></td></tr>
            <tr><td>matchMode</td><td><Tag type="opt">可选</Tag></td><td><code>strict</code> 精确匹配（默认）/ <code>fuzzy</code> 模糊搜索</td></tr>
          </tbody></table>
          <p>返回：类型种类、全限定名、文件路径、行号、来源（项目源码 <code>[src]</code> / JAR <code>[JAR]</code>）</p>
          <CodeBlock code={`// 精确查找 ArrayList
searchJavaTypes({ name: "ArrayList", matchMode: "strict" })

// 模糊搜索项目中所有含 "Controller" 的类
searchJavaTypes({ name: "Controller", matchMode: "fuzzy" })`} />
        </SubSection>

        <SubSection id="tool-source" title="2. getSourceCodeByFQN — 获取源码">
          <p>按全限定名获取 Java 类型源码。先调用 <code>executeWorkspaceSymbolProvider</code> 定位文件，再用 <code>executeDocumentSymbolProvider</code>（LSP <a href="https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_documentSymbol" target="_blank">textDocument/documentSymbol</a>）按方法名过滤。</p>
          <table><tbody>
            <tr><th>参数</th><th>类型</th><th>说明</th></tr>
            <tr><td>fullyQualifiedName</td><td><Tag type="req">必填</Tag></td><td>全限定类名，如 <code>java.util.ArrayList</code></td></tr>
            <tr><td>methodNames</td><td><Tag type="opt">可选</Tag></td><td>字符串数组，只返回这些方法的源码片段</td></tr>
          </tbody></table>
          <p>项目 .java 文件返回完整源码；JAR 依赖返回签名信息。</p>
          <CodeBlock code={`// 获取完整源码
getSourceCodeByFQN({ fullyQualifiedName: "java.util.ArrayList" })

// 只获取 findById 和 save 方法
getSourceCodeByFQN({
  fullyQualifiedName: "com.example.MyService",
  methodNames: ["findById", "save"]
})`} />
        </SubSection>
      </Section>

      <Section id="lsp-methods" title="四、LSP 方法映射">
        <table><tbody>
          <tr><th>VS Code 命令</th><th>LSP 方法</th><th>用途</th><th>MCP 工具</th></tr>
          <tr><td><code>executeWorkspaceSymbolProvider</code></td><td><a href="https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_symbol">workspace/symbol</a></td><td>工作区符号搜索</td><td>searchJavaTypes<br/>getSourceCodeByFQN</td></tr>
          <tr><td><code>executeDocumentSymbolProvider</code></td><td><a href="https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_documentSymbol">textDocument/documentSymbol</a></td><td>文档符号列表</td><td>getSourceCodeByFQN</td></tr>
          <tr><td><code>executeDefinitionProvider</code></td><td><a href="https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_definition">textDocument/definition</a></td><td>跳转到定义</td><td><span className="dim">规划中</span></td></tr>
          <tr><td><code>executeReferenceProvider</code></td><td><a href="https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_references">textDocument/references</a></td><td>查找引用</td><td><span className="dim">规划中</span></td></tr>
          <tr><td><code>executeHoverProvider</code></td><td><a href="https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_hover">textDocument/hover</a></td><td>悬停提示</td><td><span className="dim">规划中</span></td></tr>
          <tr><td><code>executeCompletionItemProvider</code></td><td><a href="https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_completion">textDocument/completion</a></td><td>代码补全</td><td><span className="dim">规划中</span></td></tr>
        </tbody></table>
        <p><a href="https://code.visualstudio.com/api/references/commands" target="_blank">VS Code 命令参考 →</a></p>
      </Section>

      <Section id="use-cases" title="五、使用场景">
        <h3>场景 1：在新项目中探索代码结构</h3>
        <CodeBlock code={`// 1. 模糊搜索了解有哪些 Service
searchJavaTypes({ name: "Service", matchMode: "fuzzy" })

// 2. 查看核心 Service 的完整源码
getSourceCodeByFQN({ fullyQualifiedName: "com.acme.order.OrderService" })`} />
        <h3>场景 2：理解第三方库用法</h3>
        <CodeBlock code={`// 搜索 JAR 中的工具类
searchJavaTypes({ name: "StringUtils", matchMode: "fuzzy" })

// 获取签名（JAR 中只返回签名）
getSourceCodeByFQN({ fullyQualifiedName: "org.apache.commons.lang3.StringUtils" })`} />
      </Section>

      <Section id="limits" title="六、限制与注意事项">
        <table><tbody>
          <tr><th>限制项</th><th>说明</th></tr>
          <tr><td>JDT.LS 依赖</td><td>需要 <code>redhat.java</code> 安装并激活，VS Code 必须打开 Java 项目</td></tr>
          <tr><td>索引进度</td><td>JDT.LS 索引完成前搜索结果可能不完整</td></tr>
          <tr><td>JAR 源码</td><td>编译依赖只返回方法签名，无完整实现</td></tr>
          <tr><td>端口配置</td><td>默认 38765，设置 <code>cc-mcp-lsp-java.port</code></td></tr>
          <tr><td>Session</td><td>管理面板可查看活跃会话和连接历史；重启后所有会话断开</td></tr>
          <tr><td>网络</td><td>仅监听 localhost，不暴露到网络</td></tr>
        </tbody></table>
      </Section>
    </div>
  )
}

/* ───────── 子组件 ───────── */

function TOC() {
  return (
    <div className="toc">
      <a href="#overview">一、架构概述</a>
      <a href="#server-info" className="l2">服务信息</a>
      <a href="#lsp-bridge" className="l2">LSP 桥接原理</a>
      <a href="#config">二、客户端配置</a>
      <a href="#tools">三、工具参考</a>
      <a href="#tool-search" className="l2">1. searchJavaTypes</a>
      <a href="#tool-source" className="l2">2. getSourceCodeByFQN</a>
      <a href="#lsp-methods">四、LSP 方法映射</a>
      <a href="#use-cases">五、使用场景</a>
      <a href="#limits">六、限制与注意事项</a>
    </div>
  )
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <>
      <h2 id={id}>{title}</h2>
      {children}
    </>
  )
}

function SubSection({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <>
      <h3 id={id}>{title}</h3>
      {children}
    </>
  )
}

function InfoBox({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="info-box">
      {items.map((item, i) => (
        <div className="row" key={i}>
          <span className="label">{item.label}</span>
          <span className="value">{item.value}</span>
        </div>
      ))}
    </div>
  )
}

function Tag({ type, children }: { type: 'req' | 'opt'; children: React.ReactNode }) {
  return <span className={`tag ${type === 'req' ? 'req' : 'opt'}`}>{children}</span>
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre>
      {code.split('\n').map((line, i) => (
        <span key={i}>
          {line.startsWith('//') ? (
            <span className="comment">{line}</span>
          ) : line.includes('{') || line.includes('}') ? (
            <span>{line.split(/(["{}:,[\]])/).map((part, j) => {
              if (part.startsWith('"') && part.endsWith('"') && part.length > 1)
                return <span className="string" key={j}>{part}</span>
              return <span key={j}>{part}</span>
            })}</span>
          ) : line.includes('(') ? (
            <span>{line.split(/([()])/).map((part, j) => {
              if (part.endsWith('('))
                return <span className="func" key={j}>{part}</span>
              return <span key={j}>{part}</span>
            })}</span>
          ) : (
            line
          )}
          {'\n'}
        </span>
      ))}
    </pre>
  )
}
