@Echo off
cls
setlocal enabledelayedexpansion
pushd "%~dp0"

rem UTF-8
chcp 65001

Set "CD=%~dp0"

::Does string have a trailing slash? if so remove it
IF %CD:~-1%==\ Set CD=%CD:~0,-1%

:: set NODE_ENV=development
:: set NODE_ENV=production
set NODE_ENV=development

Set TOOLS_DIR=%CD%\tools
Set APP_DIR=%CD%\app
Set ZBX_DIR=%TOOLS_DIR%\zabbix_agent

Set NODEJS_EXIST=N
where node.exe >nul 2>&1 && Set NODEJS_EXIST=Y || Set NODEJS_EXIST=N

reg Query "HKLM\Hardware\Description\System\CentralProcessor\0" | "%SystemRoot%\system32\find.exe" /i "x86" > NUL && Set OS_BIT=32bit || Set OS_BIT=64bit

cd /d %CD%

::  #################################################################################################

if %NODEJS_EXIST%==N (
	echo -======= Dependency: E R R O R ==========-
	echo NODE Js not exist.
	echo Please install NodeJs and try again!
	echo Look at ReadMe file for more information.
	echo -========================================-
	pause
	exit 0
)

:: #################################################################################################
echo -===== Run Application ======-
if exist "%CD%\src\app.js" start "" "npm" "run start"

popd
endlocal
pause
exit 0