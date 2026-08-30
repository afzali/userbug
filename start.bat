@echo off
chcp 65001 >nul
rem ------------------------------------------------------------
rem  userbug - one command launcher
rem
rem  Brings up nepi dev (5173), local API (8081) and the userbug
rem  GUI (4174), then opens the browser. Ctrl+C to stop.
rem
rem  Options:
rem    start.bat              nepi on the dev server
rem    start.bat --preview    nepi on the production build (offline tests)
rem    start.bat --no-nepi    GUI only, do not start the target app
rem
rem  Logic lives in scripts\up.mjs. Comments here are ASCII on
rem  purpose: cmd.exe mangles UTF-8 rem lines and then tries to
rem  execute the fragments.
rem ------------------------------------------------------------
node "%~dp0scripts\up.mjs" %*
