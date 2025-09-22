Name: Jodie Kuo
GitHub Username: jykuo25
Deployed Version: https://jykuo25-hw3.netlify.app/
Team PRD: 

# Study Scheduler

A lightweight, local-first web app to schedule work/study time, track progress with streaks, and share updates with friends.

- Dashboard: goals summary, upcoming events, social feed (post/like/comment)
- Schedule: weekly visualizer, add busy events, check-in and mark study slots as completed
- Goals: create/edit recurring goals with preferences; progress bars reflect completed time
- Persistence: localStorage (no backend required)

## Run locally (frontend only)

Option A: Open `index.html` directly in your browser.

Option B: Use a simple local server (recommended):

```bash
python3 -m http.server 5500
```
Then open http://localhost:5500/index.html

## Optional: Backend login + server-side saving

This project now includes a minimal Flask backend for authentication and per-user state storage (file-based). It is optional — the app still works with localStorage only — but when logged in, state will be loaded from and saved to the server for increased persistence.

### Backend setup

1. Create a virtual environment (recommended) and install requirements.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

2. Run the backend (default port 5000):

```bash
python backend/app.py
```

The backend will accept CORS requests from the static site at http://localhost:5500.

### Start the frontend static server

In another terminal, serve the frontend (default port 5500):

```bash
python3 -m http.server 5500
```

Open http://localhost:5500/login.html to log in.

### Login credentials

- Username: `test-user`
- Password: `password`

On successful login, you will be redirected to `index.html`. While logged in, the app will:

- Load previously saved state from `GET /api/state` and hydrate the UI.
- Persist every change by POSTing the full state to `POST /api/state`.

If the backend is not running or you are not logged in, the app will seamlessly continue using `localStorage` only.

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
