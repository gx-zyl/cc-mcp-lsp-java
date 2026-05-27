import { useState } from 'react'
import { useVscodeListener, useRequestStatus } from '../shared/hooks'
import type { ServerInfo } from '../shared/types'

export default function CallGraphDocPanel() {
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
      <h1>调用图分析 — MCP 接口说明</h1>
      <p className="subtitle">
        <code>analyzeCallGraph</code> — 字节码级 Java 方法调用图分析。
        基于 <a href="https://github.com/Adrninistrator/java-all-call-graph" target="_blank">java-all-call-graph</a> 实现。
        {' · '}
        <a href="https://github.com/Adrninistrator/java-callgraph2" target="_blank">java-callgraph2</a>
      </p>

      <TOC />

      <Section id="overview" title="一、概述">
        <SubSection title="什么是调用图分析">
          <p>调用图分析通过扫描 Java 字节码（.class 文件 / JAR），解析方法之间的调用关系，构建完整的调用图数据库。你可以查询：</p>
          <ul>
            <li><strong>向上追溯</strong>：谁调用了某个方法（Callers）</li>
            <li><strong>向下展开</strong>：某个方法调用了哪些方法（Callees）</li>
            <li><strong>全局搜索</strong>：按关键字模糊匹配方法名</li>
            <li><strong>调用路径</strong>：查找从入口到指定方法的完整调用链</li>
          </ul>
        </SubSection>
        <SubSection title="架构">
          <InfoBox items={[
            { label: '引擎', value: 'java-all-call-graph 4.0.6 + BCEL 字节码解析' },
            { label: '存储', value: 'H2 文件数据库（按项目隔离）' },
            { label: '进程', value: '独立 Java 侧车进程（jacg-sidecar）' },
            { label: '端口', value: 'localhost:38766' },
            { label: '通信', value: 'HTTP JSON-RPC（扩展 → 侧车）' },
            { label: '数据流', value: '字节码 → 侧车解析 → H2 写入 → 扩展查询' },
          ]} />
        </SubSection>
        <SubSection title="工作流程">
          <ol>
            <li><strong>启动侧车</strong>：扩展激活时自动启动 Java 侧车进程</li>
            <li><strong>扫描</strong>：自动发现项目 Classpath（编译输出 + 依赖 JAR），扫描全部字节码写入 H2</li>
            <li><strong>查询</strong>：从 H2 数据库读取调用关系，返回结构化的方法调用数据</li>
            <li><strong>清理</strong>：删除当前项目的 H2 数据库文件，释放磁盘空间</li>
          </ol>
        </SubSection>
      </Section>

      <Section id="service" title="二、服务信息">
        <SubSection title="MCP 服务器">
          <InfoBox items={[
            { label: '协议', value: 'Streamable HTTP (MCP)' },
            { label: '端点', value: endpoint },
            { label: '方法', value: 'POST /mcp' },
            { label: 'Session', value: 'Mcp-Session-Id header 自动管理' },
            { label: '端口', value: '38765（MCP 服务器） / 38766（侧车）' },
          ]} />
        </SubSection>
        <SubSection title="客户端配置">
          <p>在 Claude Desktop、Cursor 或其他 MCP 客户端中配置：</p>
          <CodeBlock code={`{
  "mcpServers": {
    "cc-mcp-lsp-java": {
      "url": "${endpoint}"
    }
  }
}`} />
          <p>配置后即可在 MCP Client 中调用 <code>analyzeCallGraph</code> 工具进行调用图分析。</p>
        </SubSection>
        <SubSection title="可用工具一览">
          <table><tbody>
            <tr><th>工具名</th><th>用途</th><th>定义位置</th></tr>
            <tr><td><code>searchJavaTypes</code></td><td>搜索 Java 类型</td><td>MCP Server（主）</td></tr>
            <tr><td><code>getSourceCodeByFQN</code></td><td>获取源码</td><td>MCP Server（主）</td></tr>
            <tr><td><code>analyzeCallGraph</code></td><td>调用图分析</td><td>MCP Server（主）+ Java 侧车</td></tr>
          </tbody></table>
        </SubSection>
      </Section>

      <Section id="tools" title="三、MCP 工具">
        <p>完整的 MCP 工具定义，支持 7 个命令：</p>

        <SubSection id="cmd-scan" title="scan — 扫描">
          <p>解析项目字节码，将调用关系写入 H2 数据库。Classpath 自动通过 <code>redhat.java</code> 扩展发现，也可以手动指定。</p>
          <table><tbody>
            <tr><th>参数</th><th>类型</th><th>说明</th></tr>
            <tr><td>inputDir</td><td><Tag type="opt">可选</Tag></td><td>覆盖自动发现的 Classpath，手动指定扫描目录或 JAR</td></tr>
          </tbody></table>
          <CodeBlock code={`// 自动发现 Classpath 并扫描
analyzeCallGraph({ command: "scan" })

// 手动指定扫描目录
analyzeCallGraph({ command: "scan", inputDir: "/path/to/target/classes" })}`} />
        </SubSection>

        <SubSection id="cmd-callers" title="callers — 查调用方">
          <p>查询谁调用了指定方法（向上追溯）。不传参数时返回全部调用方。</p>
          <table><tbody>
            <tr><th>参数</th><th>类型</th><th>说明</th></tr>
            <tr><td>className</td><td><Tag type="opt">可选</Tag></td><td>过滤：只返回该类下的方法</td></tr>
            <tr><td>methodName</td><td><Tag type="opt">可选</Tag></td><td>过滤：只返回该方法名的数据</td></tr>
            <tr><td>keyword</td><td><Tag type="opt">可选</Tag></td><td>模糊匹配：方法名包含该关键词</td></tr>
          </tbody></table>
          <CodeBlock code={`// 查某个方法被谁调用了
analyzeCallGraph({
  command: "callers",
  className: "com.example.MyService",
  methodName: "getUserById"
})

// 模糊搜索所有 Controller 相关方法的调用方
analyzeCallGraph({
  command: "callers",
  keyword: "Controller"
})`} />
        </SubSection>

        <SubSection id="cmd-callees" title="callees — 查被调方">
          <p>查询指定方法调用了哪些方法（向下展开）。参数同 callers。</p>
          <CodeBlock code={`// 查某个方法内部调用了哪些方法
analyzeCallGraph({
  command: "callees",
  className: "com.example.MyService",
  methodName: "processOrder"
})`} />
        </SubSection>

        <SubSection id="cmd-list" title="list — 方法列表">
          <p>列出数据库中所有方法，可按类名和方法名过滤。</p>
          <CodeBlock code={`// 列出全部方法
analyzeCallGraph({ command: "list" })

// 只列出 Controller 类中的方法
analyzeCallGraph({ command: "list", keyword: "Controller" })`} />
        </SubSection>

        <SubSection id="cmd-status" title="status — 状态查询">
          <p>查询侧车和当前项目的状态。</p>
          <CodeBlock code={`analyzeCallGraph({ command: "status" })
// 返回示例:
// Sidecar status:
//   Scanned: true
//   DB: /home/user/.cc-mcp-lsp-java/jacg
//   Project ID: a1b2c3d4e5f6g7h8`} />
        </SubSection>

        <SubSection id="cmd-clean" title="clean / clean-all — 缓存清理">
          <p><code>clean</code> 清理当前项目的 H2 数据库。<code>clean-all</code> 清理所有项目的数据库。</p>
          <CodeBlock code={`// 清理当前项目
analyzeCallGraph({ command: "clean" })

// 清理所有项目
analyzeCallGraph({ command: "clean-all" })`} />
        </SubSection>
      </Section>

      <Section id="sidecar" title="四、侧车管理">
        <p>侧车进程随扩展自动启动，也可以通过 VS Code 命令手动管理：</p>
        <table><tbody>
          <tr><th>命令</th><th>ID</th><th>说明</th></tr>
          <tr><td>扫描调用图</td><td><code>cc-mcp-lsp-java.scanCallGraph</code></td><td>自动发现 Classpath 并执行扫描，在通知栏显示进度</td></tr>
          <tr><td>清理缓存</td><td><code>cc-mcp-lsp-java.cleanCallGraph</code></td><td>删除当前项目 H2 数据库</td></tr>
        </tbody></table>
        <p>侧车状态每 5 秒自动刷新。侧边栏"调用图分析"视图和编辑器标签页提供图形化操作界面。</p>
      </Section>

      <Section id="integration" title="五、IDE 集成">
        <SubSection title="VS Code 侧边栏">
          <p>左侧活动栏点击"CC MCP LSP Java"图标 → 点击"调用图分析"视图。提供扫描、清理、查询操作的图形界面，支持侧边栏精简版和编辑器标签页完整版。</p>
        </SubSection>
        <SubSection title="MCP Client 集成">
          <p>在任何 MCP Client 中直接调用 <code>analyzeCallGraph</code> 工具：</p>
          <h4>场景 1：代码审查时查调用链</h4>
          <CodeBlock code={`// 发现可疑方法，查谁调用了它
analyzeCallGraph({
  command: "callers",
  className: "com.acme.payment.PaymentService",
  methodName: "processRefund"
})

// 展开该方法内部调用
analyzeCallGraph({
  command: "callees",
  className: "com.acme.payment.PaymentService",
  methodName: "processRefund"
})`} />
          <h4>场景 2：重构前评估影响范围</h4>
          <CodeBlock code={`// 查某个 Service 的所有调用方
analyzeCallGraph({
  command: "callers",
  className: "com.acme.order.OrderService"
})`} />
          <h4>场景 3：探索新项目</h4>
          <CodeBlock code={`// 先扫描
analyzeCallGraph({ command: "scan" })

// 查看有哪些 Controller
analyzeCallGraph({ command: "list", keyword: "Controller" })

// 查第一个 Controller 的调用方
analyzeCallGraph({ command: "callers", keyword: "OrderController" })`} />
        </SubSection>
      </Section>

      <Section id="limits" title="六、限制与注意事项">
        <table><tbody>
          <tr><th>限制项</th><th>说明</th></tr>
          <tr><td>Classpath 依赖</td><td>需要 <code>redhat.java</code> 扩展激活才能自动发现 Classpath</td></tr>
          <tr><td>侧车 JAR</td><td>需手动构建：<code>cd java-sidecar && mvn package -DskipTests</code></td></tr>
          <tr><td>Java 环境</td><td>需要 <code>java</code> 在 PATH 或 <code>JAVA_HOME</code> 环境变量</td></tr>
          <tr><td>扫描耗时</td><td>大型项目首次扫描 1-5 分钟，增量扫描因缓存会快很多</td></tr>
          <tr><td>调用链深度</td><td>侧车支持完整的调用路径分析，但 MCP 工具目前只返回直接调用关系</td></tr>
          <tr><td>端口占用</td><td>侧车固定端口 38766，与管理面板端口 38765 不同</td></tr>
          <tr><td>项目隔离</td><td>每个 VS Code 工作区项目有独立 H2 数据库，切换项目需切换扫描</td></tr>
        </tbody></table>
        <p>扫描完成后建议执行一次简单的 <code>status</code> 查询确认数据库就绪，之后即可开始查询调用关系。</p>
      </Section>
    </div>
  )
}

/* ───────── 子组件 ───────── */

function TOC() {
  return (
    <div className="toc">
      <a href="#overview">一、概述</a>
      <a href="#service">二、服务信息</a>
      <a href="#tools">三、MCP 工具：analyzeCallGraph</a>
      <a href="#cmd-scan" className="l2">scan — 扫描</a>
      <a href="#cmd-callers" className="l2">callers — 查调用方</a>
      <a href="#cmd-callees" className="l2">callees — 查被调方</a>
      <a href="#cmd-list" className="l2">list — 方法列表</a>
      <a href="#cmd-status" className="l2">status — 状态查询</a>
      <a href="#cmd-clean" className="l2">clean / clean-all — 清理</a>
      <a href="#sidecar">四、侧车管理</a>
      <a href="#integration">五、IDE 集成</a>
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
