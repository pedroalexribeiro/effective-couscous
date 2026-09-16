# Code map

Where each part of the program lives. For the algorithm itself, read
[how-it-works.md](./how-it-works.md).

## Rule of thumb

`domain/` holds facts and rules that would still be true on paper. `scheduler/`
holds the search. `ui/` holds the screens. Nothing in `domain/` imports from
`scheduler/` or `ui/`.

## `src/domain/` — what the data is

| File | Responsibility |
| --- | --- |
| `types.ts` | Every data shape, and an empty starting input. |
| `time.ts` | Minute arithmetic: parsing clock times, durations, overlaps, gaps. |
| `invariants.ts` | Which periods a student is eligible for, and validation of the input. |
| `caseload.ts` | Reading a student's per-subject minute splits. |
| `index.ts` | The public surface of the domain. Import from here. |

## `src/scheduler/` — the search

In the order the search uses them:

| File | Responsibility |
| --- | --- |
| `candidates.ts` | Narrows the timetable to eligible periods, works out which pairs clash, and looks up travel time. |
| `quotas.ts` | The list of minute targets, progress towards them (capped at each target), and whether a finished plan has a removable period. |
| `score.ts` | Preference scoring for one day, priced in minutes of your own time. A week's score is the sum of its days. |
| `dayPlans.ts` | Every clash-free set of periods for a single weekday, plus how much each could still contribute. |
| `join.ts` | Joins the five days into whole weeks: counts them, and walks to the best 50. |
| `visits.ts` | Decides who you work with in each chosen period. |
| `enumerate.ts` | Runs the eight steps in order and formats progress messages. |
| `enumerateWorker.ts` | Runs `enumerate` on a background thread so the screen stays responsive. |
| `enumerateMessages.ts` | The message types passed to and from that thread. |
| `fixtures.ts` | Small hand-built inputs used by tests. |

### The two files worth reading first

`join.ts` is the heart. `createJoin` answers "from this day, with this progress,
how many ways are there to finish and what is the best score?" — memoised, so
each distinct situation is answered once. `selectBestCombinations` then uses
those answers to walk straight to the best plans.

`dayPlans.ts` is what makes that possible, by turning each weekday into a short
list of concrete options.

## `src/ui/` — the screens

| File | Responsibility |
| --- | --- |
| `AppShell.tsx` | Navigation between screens. |
| `DataScreens.tsx` | Forms for schools, classes, periods, students, caseload, free blocks. |
| `ConfigurationsScreen.tsx` | Runs the search and shows the resulting plans. |
| `WeekCalendar.tsx`, `calendarLayout.ts` | Drawing a week grid, including overlap placement. |
| `OrganizerContext.tsx` | Holds the input, starts the worker, collects progress. |
| `storage.ts`, `jsonFormat.ts` | Saving to the browser, and the import/export file format. |
| `sampleData.ts` | The example timetable behind the "load sample" button. |
| `Field.tsx`, `ids.ts` | Small shared helpers. |

## Tests

| File | Covers |
| --- | --- |
| `scheduler/join.test.ts` | Agreement with brute force, that nothing offered has a removable period, and score consistency. |
| `scheduler/score.test.ts` | That preferences stay on one scale, and that an extra period can never improve a day. |
| `scheduler/dayPlans.test.ts` | Weekday independence, and that clashing periods never share a plan. |
| `scheduler/enumerate.test.ts` | End-to-end behaviour, visit kinds, and the reported reasons when nothing is possible. |
| `domain/caseload.test.ts` | Subject split reading. |
| `ui/calendarLayout.test.ts`, `ui/jsonFormat.test.ts` | Calendar placement and the file format. |

Run them with `npm test`. The whole suite takes a few seconds.

Tests use only hand-built inputs from `fixtures.ts`. Nothing under `data/` is
part of the repository: a real timetable names children and what support they
receive, so it stays on your machine and is git-ignored.

## Known rough edges

- The Portuguese UI text calls a plan a *semana* ("week"), which is confusing
  since there is only one calendar week. The code calls it a `Configuration`.
  Renaming both to "plan" would help.
- `enumerate.ts` still builds its own Portuguese progress strings. Emitting
  structured progress and letting the UI phrase it would separate the two
  concerns properly.
- Preference weights are hard-coded in `score.ts` rather than being settings.
- The reported plan count includes combinations that would never be offered,
  because the offered ones cannot be counted without listing them.
