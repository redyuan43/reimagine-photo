#!/bin/bash

# LUMINA AI 增强停止脚本
# 多层验证确保准确停止正确的进程

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  LUMINA AI - 增强停止中...${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# 增强的PID验证函数
verify_process_pid() {
    local pid=$1
    local expected_port=$2
    local process_name=$3

    echo -e "${YELLOW}[验证] 检查PID $pid (期望端口: $expected_port, 进程: $process_name)${NC}"

    # 1. 检查PID是否存在
    if ! kill -0 "$pid" 2>/dev/null; then
        echo -e "${RED}[错误] PID $pid 不存在或进程已死亡${NC}"
        return 1
    fi

    # 2. 检查进程命令行
    local cmdline=$(cat "/proc/$pid/cmdline" 2>/dev/null | tr '\0' ' ')
    if [[ -z "$cmdline" ]]; then
        echo -e "${RED}[错误] 无法读取PID $pid 的命令行${NC}"
        return 1
    fi

    # 3. 验证进程名称匹配
    if [[ "$process_name" != "any" ]]; then
        case "$process_name" in
            "frontend")
                if [[ ! "$cmdline" =~ (npm|vite|node.*dev) ]]; then
                    echo -e "${RED}[错误] PID $pid 不是前端进程 (命令: $cmdline)${NC}"
                    return 1
                fi
                ;;
            "backend")
                if [[ ! "$cmdline" =~ (python.*server\.py|uvicorn) ]]; then
                    echo -e "${RED}[错误] PID $pid 不是后端进程 (命令: $cmdline)${NC}"
                    return 1
                fi
                ;;
        esac
    fi

    # 4. 检查进程监听的端口
    if [[ "$expected_port" != "any" ]]; then
        echo -e "${YELLOW}[检查] 验证PID $pid 是否监听端口 $expected_port...${NC}"

        # 方法1: 使用/proc/net/tcp
        local port_hex=$(printf "%04X" "$expected_port")
        if [[ -f "/proc/$pid/net/tcp" ]]; then
            if grep -q ":$port_hex" "/proc/$pid/net/tcp" 2>/dev/null; then
                echo -e "${GREEN}[验证] PID $pid 确实在监听端口 $expected_port${NC}"
                return 0
            fi
        fi

        # 方法2: 使用lsof验证
        local lsof_check=$(lsof -ti:"$expected_port" 2>/dev/null)
        if [[ "$lsof_check" == "$pid" ]]; then
            echo -e "${GREEN}[验证] PID $pid 确实在监听端口 $expected_port${NC}"
            return 0
        fi

        # 方法3: 使用netstat验证
        local netstat_check=$(netstat -tlpn 2>/dev/null | grep ":$expected_port.*LISTEN" | awk '{print $7}' | cut -d'/' -f1)
        if [[ "$netstat_check" == "$pid" ]]; then
            echo -e "${GREEN}[验证] PID $pid 确实在监听端口 $expected_port${NC}"
            return 0
        fi

        echo -e "${RED}[警告] PID $pid 未在预期端口 $expected_port 找到${NC}"
        return 1
    fi

    echo -e "${GREEN}[验证] PID $pid 通过基本验证${NC}"
    return 0
}

# 安全停止进程函数
safe_kill_process() {
    local pid=$1
    local process_name=$2
    local timeout=${3:-10}

    if ! verify_process_pid "$pid" "any" "$process_name"; then
        return 1
    fi

    echo -e "${YELLOW}[停止] 正在优雅停止 $process_name 进程 (PID: $pid)...${NC}"

    # 1. 发送TERM信号优雅退出
    kill -TERM "$pid" 2>/dev/null

    # 2. 等待进程退出
    local count=0
    while kill -0 "$pid" 2>/dev/null && [[ $count -lt $timeout ]]; do
        sleep 1
        ((count++))
        echo -n "."
    done
    echo ""

    # 3. 如果还在运行，强制kill
    if kill -0 "$pid" 2>/dev/null; then
        echo -e "${RED}[强制] 进程拒绝退出，发送KILL信号${NC}"
        kill -KILL "$pid" 2>/dev/null
        sleep 1

        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${RED}[错误] 无法停止PID $pid${NC}"
            return 1
        fi
    fi

    echo -e "${GREEN}[成功] $process_name 进程已停止${NC}"
    return 0
}

# 处理后端服务
echo -e "${YELLOW}[后端] 检查并停止后端服务...${NC}"

# 方式1: 从PID文件读取
if [ -f .backend.pid ]; then
    BACKEND_PID=$(cat .backend.pid)
    echo -e "${YELLOW}[发现] 从PID文件读取后端PID: $BACKEND_PID${NC}"

    if safe_kill_process "$BACKEND_PID" "backend" 15; then
        rm -f .backend.pid
    fi
fi

# 方式2: 端口扫描作为备用
echo -e "${YELLOW}[扫描] 检查端口8000上的后端进程...${NC}"
BACKEND_PORT_PIDS=$(lsof -ti:8000 2>/dev/null)
if [[ ! -z "$BACKEND_PORT_PIDS" ]]; then
    for pid in $BACKEND_PORT_PIDS; do
        echo -e "${YELLOW}[发现] 端口8000上发现进程PID: $pid${NC}"
        if verify_process_pid "$pid" "8000" "backend"; then
            echo -e "${YELLOW}[备用] 停止端口8000上的后端进程${NC}"
            kill -TERM "$pid" 2>/dev/null
            sleep 2
            kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null
        fi
    done
else
    echo -e "${GREEN}[清理] 端口8000上没有发现进程${NC}"
fi

echo ""

# 处理前端服务
echo -e "${YELLOW}[前端] 检查并停止前端服务...${NC}"

# 方式1: 从PID文件读取
if [ -f .frontend.pid ]; then
    FRONTEND_PID=$(cat .frontend.pid)
    echo -e "${YELLOW}[发现] 从PID文件读取前端PID: $FRONTEND_PID${NC}"

    if safe_kill_process "$FRONTEND_PID" "frontend" 10; then
        rm -f .frontend.pid
    fi
fi

# 方式2: 端口扫描作为备用
echo -e "${YELLOW}[扫描] 检查端口3000上的前端进程...${NC}"
FRONTEND_PORT_PIDS=$(lsof -ti:3000 2>/dev/null)
if [[ ! -z "$FRONTEND_PORT_PIDS" ]]; then
    for pid in $FRONTEND_PORT_PIDS; do
        echo -e "${YELLOW}[发现] 端口3000上发现进程PID: $pid${NC}"
        if verify_process_pid "$pid" "3000" "frontend"; then
            echo -e "${YELLOW}[备用] 停止端口3000上的前端进程${NC}"
            kill -TERM "$pid" 2>/dev/null
            sleep 2
            kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null
        fi
    done
else
    echo -e "${GREEN}[清理] 端口3000上没有发现进程${NC}"
fi

# 额外检查5173端口（可能的前端开发服务器端口）
echo -e "${YELLOW}[扫描] 检查端口5173上的前端进程...${NC}"
FRONTEND_5173_PIDS=$(lsof -ti:5173 2>/dev/null)
if [[ ! -z "$FRONTEND_5173_PIDS" ]]; then
    for pid in $FRONTEND_5173_PIDS; do
        echo -e "${YELLOW}[发现] 端口5173上发现进程PID: $pid${NC}"
        if verify_process_pid "$pid" "5173" "frontend"; then
            echo -e "${YELLOW}[备用] 停止端口5173上的前端进程${NC}"
            kill -TERM "$pid" 2>/dev/null
            sleep 2
            kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null
        fi
    done
else
    echo -e "${GREEN}[清理] 端口5173上没有发现进程${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  增强停止完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${CYAN}  已验证并安全停止所有LUMINA AI服务${NC}"
echo ""