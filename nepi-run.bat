@echo off
chcp 65001 >nul
rem ------------------------------------------------------------
rem  nepi - bring up the target app (dev server + local PHP API)
rem
rem  This is a personal convenience script, NOT part of the
rem  userbug engine. The engine never starts your app; it only
rem  points at an address. See scripts\nepi.mjs for why.
rem
rem  Options:
rem    nepi-run.bat             dev server on 5173 + API on 8081
rem    nepi-run.bat --preview   production build on 4173 (offline tests)
rem    nepi-run.bat --no-api    skip the PHP API
rem
rem  If nepi lives elsewhere:  set NEPI_ROOT=D:\path\to\nepi
rem
rem  Comments here are ASCII on purpose: cmd.exe mangles UTF-8
rem  rem lines and then tries to execute the fragments.
rem ------------------------------------------------------------
node "%~dp0scripts\nepi.mjs" %*
