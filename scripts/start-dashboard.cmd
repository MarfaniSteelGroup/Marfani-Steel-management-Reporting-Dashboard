@echo off
setlocal
cd /d "%~dp0.."
set "LOG_DIR=%~dp0..\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1
set "LOG_FILE=%LOG_DIR%\startup.log"
set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"
if not exist "%NODE_EXE%" for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined NODE_FOUND set "NODE_EXE=%%N" & set "NODE_FOUND=1"

echo [%date% %time%] Starting dashboard from "%CD%" >> "%LOG_FILE%"
if not exist "%NODE_EXE%" (
	echo [%date% %time%] ERROR: Node.js executable was not found. >> "%LOG_FILE%"
	exit /b 1
)

echo [%date% %time%] Using Node.js "%NODE_EXE%" >> "%LOG_FILE%"
"%NODE_EXE%" server.js >> "%LOG_FILE%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"
echo [%date% %time%] Dashboard stopped with exit code %EXIT_CODE%. >> "%LOG_FILE%"
exit /b %EXIT_CODE%