/**
 * English help.
 *
 * Shown when the console cannot render right-to-left text — see
 * `src/i18n.js`. Deliberately shorter than the Persian one: the full
 * reference is in `docs/`, and a 240-line dump is not help.
 */
export const HELP_EN = `
userbug — user simulator for testing web apps

  Output is Playwright tests, living in your project's own repo.
  AI cost is paid once, at authoring. Running is free and model-free.

  ── Quick start ────────────────────────────────────────────

  cd <your project>
  userbug setup --base-url http://localhost:5173
  userbug tour                    walk around; it writes the test
  userbug expect                  add assertions
  npx playwright test             run — free, on every change

  ───────────────────────────────────────────────────────────

  SETUP

  userbug setup                   one command, from your project folder
      --base-url <url>            app address
      --no-install                files only, skip npm

  userbug init <key> --base-url <url> [options]
                                  central config in targets/ (older style)
      --workspace                 create tests/userbug/ in the project
      --title --api-url --environment --device --locale --dir
      --log <name=path>           server log; repeatable
      --source <path>             project source folder
                                  paths accept \${VAR}; values from .env

  AUTHORING                       (these call the model)

  userbug tour [key]              browser opens, you drive, it records
                                  in this terminal:
                                    <text>    describe current page
                                    v <name>  name the current layer
                                    n <text>  note or defect
                                    r         toggle recording
                                    q         finish

  userbug author [key] "<text>"   plain sentence → .spec.js
      --model <slug> --force

  userbug expect [key]            propose assertions, you pick which
      --from <file>               without it, lists your tests
      --list                      just the real elements (free)
      --apply                     write all, no prompt
      --hard                      expect instead of expect.soft

  RUNNING                         (free, no model)

  userbug test [key]              run this project's tests
      --ui --headed --last-failed --grep <title>

  npx playwright test             same thing, from the project folder

  UNDERSTANDING THE APP

  userbug impact [key]            "code changed — which tests to rethink?"
      --base <ref>                git ref to compare; default HEAD

  userbug map <key> [--headed]    automatic crawl. while it runs:
                                    n <text>  note → real finding
                                    w         where is it now?
                                    q         stop cleanly

  userbug learn <key>             read source → knowledge
  userbug knowledge <key>         what we know, and where each part came from
  userbug capabilities <key>      "what does this app have?"
  userbug coverage <key>          "what's in source that we never called?"
  userbug docs <key>              external docs for this project
  userbug invariants <key>        rules that must not break

  FILES AND ACCOUNTS

  userbug fixtures <key>          sample files — upload tests read from here
      --add <path> [--note <why>] --remove <name>

  userbug accounts <key>          stored accounts
  userbug bundle <key>            export/import a project's data

  RUNS AND REPORTS

  userbug list [--limit n]        recent runs
  userbug report <runId|latest>   report for a run
  userbug replay <runId>          run the same tests again
  userbug diff <runA> <runB>      what changed between two runs
  userbug remove <runId>          delete a run and its traces
  userbug missions <key>          what has been tested, what has not

  MODELS AND SCHEDULE

  userbug models [--free]         models available through OpenRouter
  userbug schedule list|add|remove|run

  ───────────────────────────────────────────────────────────

  Inside a project folder the key is optional — userbug finds
  tests/userbug/userbug.config.mjs by walking up from the current
  directory.

  Persian output: this console cannot render right-to-left text, so
  labels are English. Windows Terminal renders it correctly. To force
  Persian: set UB_LANG=fa

  Guide: docs/شروع.md
`;
