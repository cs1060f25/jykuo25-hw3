# Study Scheduler (Vanilla JS)

A lightweight, local-first web app to schedule work/study time, track progress with streaks, and share updates with friends.

- Dashboard: goals summary, upcoming events, social feed (post/like/comment)
- Schedule: weekly visualizer, add busy events, check-in and mark study slots as completed
- Goals: create/edit recurring goals with preferences; progress bars reflect completed time
- Persistence: localStorage (no backend required)

## Run locally

Option A: Open `index.html` directly in your browser.

Option B: Use a simple local server (recommended):

```bash
python3 -m http.server 5500
```
Then open http://localhost:5500/study-scheduler/

## Data model (stored in localStorage)

- `currentUser`: `{ id, name }`
- `friends`: `[{ id, name }]`
- `goals`: `[{ id, title, hoursPerWeek, slotMinutes, preferredTime, days[] }]`
- `busy`: `[{ id, title, startISO, endISO }]`
- `sessions`: `[{ id, goalId, startISO, endISO, status: 'planned'|'checked_in'|'completed' }]`
- `posts`: `[{ id, authorId, authorName, content, createdISO, likes, comments[] }]`

## Key behaviors

- Scheduler places planned sessions each week around busy events, honoring goal preferences (days/time of day and slot length).
- Updating a goal or adding busy events will regenerate planned sessions for the surrounding weeks.
- Progress bars count only `completed` sessions within the current week.
- Daily streak increments for each day that has at least one `completed` session.
- Feed: create posts, like, and comment. Mock friend posts are seeded on first run.

## User journeys

- Create recurring goal: fill the form in `Goals` and Save. The `Schedule` tab will populate slots automatically.
- Update goal time/week: click `Edit` on a goal, adjust, and Save. The schedule will revise.
- Check-in/Complete: click a planned study slot in `Schedule` to check in and then mark complete; streak and progress update.
- Share an update: from `Dashboard`, post an update; it appears in the feed; friends can like/comment.

## Notes

- Data lives in your browser. To reset, clear localStorage for this site.
- Time windows used: morning (6–12), afternoon (12–18), evening (18–22).
- The scheduler aims for preferred days first; if goals exceed available windows, leftover may remain unscheduled.
