#!/bin/bash

# PID验证机制测试脚本
# 演示不同的PID验证方法

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}=== PID验证机制演示 ===${NC}"
echo ""

# 模拟一个前端进程（如果不存在的话）
if ! lsof -ti:3000 2>/dev/null && ! lsof -ti:5173 2>/dev/null; then
    echo -e "${YELLOW}[模拟] 启动一个测试前端进程...${NC}"
    npm run dev > /dev/null 2>&1 &
    TEST_PID=$!
    echo $TEST_PID > .frontend.test.pid
    echo -e "${GREEN}[启动] 测试前端进程 PID: $TEST_PID${NC}"
    sleep 3
fi

echo ""
echo -e "${CYAN}=== PID验证方法对比 ===${NC}"

# 读取测试PID
if [ -f .frontend.test.pid ]; then
    TEST_PID=$(cat .frontend.test.pid)
    echo -e "${YELLOW}[测试] 目标PID: $TEST_PID${NC}"
    echo ""

    # 方法1: 简单检查（当前stop.sh的方法）
    echo -e "${YELLOW}[方法1] 简单PID检查${NC}"
    if kill -0 "$TEST_PID" 2>/dev/null; then
        echo -e "${GREEN}  ✓ PID存在${NC}"
    else
        echo -e "${RED}  ✗ PID不存在${NC}"
    fi

    # 方法2: 进程名称验证
    echo ""
    echo -e "${YELLOW}[方法2] 进程名称验证${NC}"
    CMDLINE=$(cat "/proc/$TEST_PID/cmdline" 2>/dev/null | tr '\0' ' ')
    if [[ "$CMDLINE" =~ (npm|vite|node.*dev) ]]; then
        echo -e "${GREEN}  ✓ 进程是前端开发服务${NC}"
        echo -e "${CYAN}  命令: ${CMDLINE}${NC}"
    else
        echo -e "${RED}  ✗ 进程不是前端服务${NC}"
    fi

    # 方法3: 端口验证（3000）
    echo ""
    echo -e "${YELLOW}[方法3] 端口验证 (3000)${NC}"

    # 方法3a: /proc/net/tcp
    PORT_HEX=$(printf "%04X" "3000")
    if [[ -f "/proc/$TEST_PID/net/tcp" ]] && grep -q ":$PORT_HEX" "/proc/$TEST_PID/net/tcp" 2>/dev/null; then
        echo -e "${GREEN}  ✓ 进程监听端口3000 (/proc/net/tcp)${NC}"
    else
        echo -e "${RED}  ✗ 进程未监听端口3000 (/proc/net/tcp)${NC}"
    fi

    # 方法3b: lsof验证
    LSOF_PID=$(lsof -ti:3000 2>/dev/null)
    if [[ "$LSOF_PID" == "$TEST_PID" ]]; then
        echo -e "${GREEN}  ✓ 进程监听端口3000 (lsof)${NC}"
    elif [[ ! -z "$LSOF_PID" ]]; then
        echo -e "${RED}  ✗ 端口3000被其他进程占用 (PID: $LSOF_PID)${NC}"
    else
        echo -e "${RED}  ✗ 端口3000没有被监听${NC}"
    fi

    # 方法3c: netstat验证
    NETSTAT_PID=$(netstat -tlpn 2>/dev/null | grep ":3000.*LISTEN" | awk '{print $7}' | cut -d'/' -f1)
    if [[ "$NETSTAT_PID" == "$TEST_PID" ]]; then
        echo -e "${GREEN}  ✓ 进程监听端口3000 (netstat)${NC}"
    elif [[ ! -z "$NETSTAT_PID" ]]; then
        echo -e "${RED}  ✗ 端口3000被其他进程占用 (PID: $NETSTAT_PID)${NC}"
    else
        echo -e "${RED}  ✗ 端口3000没有被监听${NC}"
    fi

    # 方法4: 综合验证评分
    echo ""
    echo -e "${YELLOW}[方法4] 综合验证评分${NC}"

    SCORE=0
    MAX_SCORE=4

    # PID存在性
    if kill -0 "$TEST_PID" 2>/dev/null; then
        ((SCORE++))
        echo -e "${GREEN}  ✓ (+1) PID存在${NC}"
    fi

    # 进程类型
    if [[ "$CMDLINE" =~ (npm|vite|node.*dev) ]]; then
        ((SCORE++))
        echo -e "${GREEN}  ✓ (+1) 前端进程${NC}"
    fi

    # 端口监听
    if [[ "$LSOF_PID" == "$TEST_PID" ]]; then
        ((SCORE++))
        echo -e "${GREEN}  ✓ (+1) 正确端口监听${NC}"
    fi

    # 端口匹配（检查是否是预期端口）
    if [[ ! -z "$LSOF_PID" ]] && [[ "$LSOF_PID" == "$TEST_PID" ]]; then
        ((SCORE++))
        echo -e "${GREEN}  ✓ (+1) 端口匹配${NC}"
    fi

    echo -e "${CYAN}  验证分数: $SCORE/$MAX_SCORE${NC}"

    if [[ $SCORE -eq $MAX_SCORE ]]; then
        echo -e "${GREEN}  结论: PID完全可信，可以安全停止${NC}"
    elif [[ $SCORE -ge 2 ]]; then
        echo -e "${YELLOW}  结论: PID基本可信，建议谨慎停止${NC}"
    else
        echo -e "${RED}  结论: PID不可信，建议使用端口扫描停止${NC}"
    fi

    # 清理测试PID文件
    rm -f .frontend.test.pid

else
    echo -e "${YELLOW}[信息] 没有找到测试PID文件${NC}"
fi

echo ""
echo -e "${CYAN}=== 演示完成 ===${NC}"