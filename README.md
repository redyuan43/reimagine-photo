# Lumina AI Retouch

一个智能修图应用，前后端一体：前端使用 React + Vite，后端使用 FastAPI 提供图像分析（SSE）与编辑/转换能力。

## 快速开始

- 安装依赖：`npm install`
- 启动后端：`python3 server.py`（需配置 `DASHSCOPE_API_KEY`）
- 启动前端：`npm run dev`
- 一键启动：`./start.sh` 或（若已创建虚拟环境）`./start-venv.sh`

## 环境变量

- `DASHSCOPE_API_KEY`（必填）：后端调用 Qwen3-VL 兼容接口所需 Key
- `VITE_API_BASE_URL`（选填）：前端调用后端的基础地址，示例 `http://localhost:8000/api`

## 构建与预览

- 构建：`npm run build`
- 预览：`npm run preview`

## 功能概览

- 智能分析（SSE）：前端向 `/api/analyze_stream` 发送图片，实时接收方案与总结
- 魔法编辑：汇总勾选的步骤与指令，后端 `/api/magic_edit` 返回生成图片 URL
- 导出与预览：`/api/convert` 支持格式转换与参数；`/api/preview` 生成特殊格式预览
- 动态导入与拆分：`services/analyze.ts`、`services/gemini.ts`、`heic2any` 按需加载，降低首屏包体

## 重要文件

- `server.py`：后端服务与 API 路由
- `services/core.ts`：前端基础工具（`getApiBaseUrl`、`urlToBlob` 等）
- `services/analyze.ts`：分析逻辑（SSE/回退）
- `services/gemini.ts`：编辑、转换与特殊格式处理（含动态导入）
- `components/SmartEditor.tsx`：主编辑界面
- `App.tsx`：应用入口
