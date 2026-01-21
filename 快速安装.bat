@echo off
chcp 65001 >nul
echo.
echo =========================================
echo   Git 测试清单生成器 - VS Code 扩展
echo   快速安装脚本
echo =========================================
echo.

REM 检查 Node.js 是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: 未检测到 Node.js
    echo.
    echo 请先安装 Node.js (v16 或更高版本)
    echo 下载地址: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo ✅ Node.js 已安装
node --version
echo.

REM 检查 npm 是否可用
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: npm 不可用
    pause
    exit /b 1
)

echo ✅ npm 已安装
npm --version
echo.

echo =========================================
echo 步骤 1/4: 安装依赖...
echo =========================================
echo.
call npm install
if %errorlevel% neq 0 (
    echo.
    echo ❌ 依赖安装失败！
    pause
    exit /b 1
)
echo.
echo ✅ 依赖安装成功
echo.

echo =========================================
echo 步骤 2/4: 安装 vsce (打包工具)...
echo =========================================
echo.
call npm install -g @vscode/vsce
if %errorlevel% neq 0 (
    echo.
    echo ⚠️  警告: vsce 安装失败，尝试继续...
)
echo.

echo =========================================
echo 步骤 3/4: 打包扩展...
echo =========================================
echo.
call npm run package
if %errorlevel% neq 0 (
    echo.
    echo ❌ 打包失败！
    echo.
    echo 可能的原因:
    echo 1. vsce 未正确安装
    echo 2. package.json 配置错误
    echo.
    echo 请手动运行: npm install -g @vscode/vsce
    echo 然后运行: vsce package
    pause
    exit /b 1
)
echo.
echo ✅ 打包成功
echo.

echo =========================================
echo 步骤 4/4: 安装到 VS Code...
echo =========================================
echo.

REM 查找生成的 .vsix 文件
for %%f in (*.vsix) do set VSIX_FILE=%%f

if not defined VSIX_FILE (
    echo ❌ 错误: 未找到 .vsix 文件
    pause
    exit /b 1
)

echo 找到扩展包: %VSIX_FILE%
echo.

REM 检查 code 命令是否可用
where code >nul 2>nul
if %errorlevel% neq 0 (
    echo ⚠️  警告: 'code' 命令不可用
    echo.
    echo 请手动安装:
    echo 1. 打开 VS Code
    echo 2. 按 Ctrl+Shift+P
    echo 3. 输入 "Extensions: Install from VSIX..."
    echo 4. 选择文件: %VSIX_FILE%
    echo.
    pause
    exit /b 0
)

echo 正在安装扩展...
call code --install-extension %VSIX_FILE%
if %errorlevel% neq 0 (
    echo.
    echo ❌ 安装失败！
    echo.
    echo 请手动安装:
    echo 1. 打开 VS Code
    echo 2. 按 Ctrl+Shift+P
    echo 3. 输入 "Extensions: Install from VSIX..."
    echo 4. 选择文件: %VSIX_FILE%
    pause
    exit /b 1
)

echo.
echo =========================================
echo ✅ 安装完成！
echo =========================================
echo.
echo 🎉 恭喜！扩展已成功安装到 VS Code
echo.
echo 📝 使用方法:
echo 1. 重启 VS Code
echo 2. 打开包含 git-summary.ps1 的项目
echo 3. 按 Ctrl+Shift+P
echo 4. 输入 "Git 测试"
echo 5. 选择任一命令开始使用
echo.
echo 💡 提示:
echo - 点击侧边栏的 ✅ 图标可快速访问
echo - 在设置中搜索 "Git 测试清单" 可自定义配置
echo.
echo =========================================
echo.

set /p restart=是否立即重启 VS Code? (Y/N): 
if /i "%restart%"=="Y" (
    echo.
    echo 正在重启 VS Code...
    taskkill /IM Code.exe /F >nul 2>nul
    timeout /t 2 /nobreak >nul
    start code ..\
    echo 重启完成！
) else (
    echo.
    echo 请手动重启 VS Code 以激活扩展
)

echo.
pause
