@echo off
chcp 65001 >nul
rem ------------------------------------------------------------
rem  userbug - launcher
rem
rem  Brings up the userbug GUI only. It does NOT start your app:
rem  run your own dev server yourself, then point a project at it.
rem
rem  Options:
rem    start.bat              open the GUI in your browser
rem    start.bat --no-open    do not open a browser
rem
rem  Logic lives in scripts\serve.mjs. Comments here are ASCII on
rem  purpose: cmd.exe mangles UTF-8 rem lines and then tries to
rem  execute the fragments.
rem ------------------------------------------------------------
node "%~dp0scripts\serve.mjs" %*
