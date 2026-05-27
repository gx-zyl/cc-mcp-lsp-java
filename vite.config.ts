import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// 多入口构建：每个 webview 视图一个入口
const entries: Record<string, string> = {
  management: resolve(__dirname, 'src/webview/management/index.html'),
  test: resolve(__dirname, 'src/webview/test/index.html'),
  doc: resolve(__dirname, 'src/webview/doc/index.html'),
  result: resolve(__dirname, 'src/webview/result/index.html'),
  callgraph: resolve(__dirname, 'src/webview/callgraph/index.html'),
}

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/webview'),
  // 使用 '/' 使 asset 路径为绝对路径，方便扩展层做 URI 转换
  base: '/',
  build: {
    outDir: resolve(__dirname, 'dist-webview'),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: entries,
    },
  },
})
