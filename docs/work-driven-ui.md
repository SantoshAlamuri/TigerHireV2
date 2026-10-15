# Work-driven UI (`/work`) — build brief

Read this before building any part of `/work`. It is the contract every block follows.

## The idea

Nobody navigates. A person opens a work item (a job) and the job takes them to the step that
needs them, asks for one decision, then hands them to the next thing. Setup lives in one place
(`/work/setup`). The agent proposes; the person decides; automation does the rest.

Who uses it:

- **Recruiter** (daily, desktop): "What do I clear today?"
- **Hiring manager** (weekly, phone): "Who do I need to say yes or no to?"
- **Head of Talent** (weekly): "Which roles are stuck, and on whom?"

## Rules for every screen

1. One decision per screen. If it asks two things, split it.
2. Evidence before score. Every number shows where it came from.
3. Agent proposes, you decide. Suggestions are pre-filled, never final.
4. Always show who holds the work: `wd-sig you` (amber), `wd-sig agent` (blue), `wd-sig auto` (stone).
5. No dead ends. Finishing anything says what is next (call `onDone`).
6. Never drop a backend capability, and never embed or link a classic screen: one way. If a capability is not redesigned yet, say so plainly in the panel.

## Look (already built — reuse, don't reinvent)

Theme and classes live in `src/app/(work)/work.css`. Charcoal ground, warm-white type, Geist,
hairlines instead of boxes, amber only for things you act on, blue for the agent.

| Need                                         | Use                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------- |
| Big headline / section headline / intro text | `wd-h1`, `wd-h2`, `wd-lede`                                           |
| Who holds it                                 | `wd-sig` plus one of `you`, `agent`, `auto`, `bad`                    |
| Primary / secondary / text button            | `wd-btn go`, `wd-btn`, `wd-btn quiet`                                 |
| Rows separated by hairlines                  | `wd-lines` > `wd-line` (+ `wd-line-label`, `wd-line-value`, `wd-src`) |
| Side content                                 | `wd-panel` (`agent`, `you`, `bad` tints)                              |
| Two columns that stack on phones             | `wd-split`                                                            |
| Big numbers                                  | `wd-numbers` > `wd-number` (`<b>` + `<span>`)                         |
| Toggle / round +− button / thin bar          | `wd-toggle` (aria-pressed), `wd-circ`, `wd-bar > span`                |
| Inputs                                       | `wd-input`, `wd-textarea` (underline style)                           |
| Errors                                       | `<p role="alert" className="wd-problem">`                             |
| Page wrapper / vertical stack / button row   | `wd-page`, `wd-stack`, `wd-row-actions`                               |

New styles go in a CSS module next to your component, built only from the `--wd-*` tokens.
No cards-with-shadows, no gradients, no emoji, no new colours.

Copy: plain, short, active voice, sentence case. Buttons say what happens ("Move to interview").
Errors say what went wrong and what to do. Never "Submit", never "Oops".

## How a job step plugs in

`src/app/(work)/work/jobs/[id]/page.tsx` renders one panel per stage from
`src/components/work/panels.tsx`. A panel receives `PanelProps`:

```ts
interface PanelProps {
  jobId: string;
  job: WorkJob; // from /api/jobs/[id]
  facts: JourneyFacts; // counts and states, see src/lib/work/journey.ts
  onDone: (what: string) => void; // call after the person finishes; the job moves them on
  onLog: (actor: "agent" | "auto" | "you", what: string) => void; // "What just happened"
  goTo: (key: "rubric" | "review" | "publish") => void;
}
```

The page already shows the stage headline and who holds it; a panel renders only the work.

## Engineering rules

- Use existing APIs only (`useApiQuery`, `useApiMutation` from `@/lib/hooks/use-api`). Read the
  route before calling it. Do not change backend routes, database, or shared libs outside
  `src/lib/work/` unless a block's brief says so.
- Put pure logic in `src/lib/work/<block>.ts` with Vitest tests in `tests/unit/work-<block>.test.ts`.
- Respect `AGENTS.md` correctness conventions (scoring numbers, verbatim quotes, degraded paths).
- Accessible: real buttons/labels, keyboard works, focus visible, 44px targets on touch.
- Works at phone width.
- Before finishing: `npm run typecheck`, `npx eslint <your files>`, `npx prettier --check <your files>`,
  `npx vitest run tests/unit/work-*.test.ts` all pass.
