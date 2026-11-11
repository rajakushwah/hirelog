# Interview Tracker - PRD

Modern cross-platform (Expo React Native) mobile app that helps job seekers track every application, interview round, question and attachment in one calm workspace.

## Stack
- Frontend: Expo (expo-router), react-query, phosphor-react-native, react-native-gifted-charts, @gorhom/bottom-sheet, expo-image-picker, expo-document-picker
- Backend: FastAPI + Motor (MongoDB), Emergent-managed Object Storage for attachments
- Auth: Emergent-managed Google Auth (session-token based)
- Storage: MongoDB (primary) + Emergent Object Storage for files

## Collections
- users, user_sessions, applications, interview_rounds, interview_questions, attachments

## Key routes
### Auth
- POST /api/auth/session   (exchange emergent session_id -> session_token)
- GET  /api/auth/me        (get current user)
- POST /api/auth/logout

### Applications
- GET/POST /api/applications
- GET/PUT/DELETE /api/applications/{id}

### Interview Rounds
- GET/POST /api/rounds (filter: application_id, status, upcoming)
- GET/PUT/DELETE /api/rounds/{id}

### Questions
- GET/POST /api/questions (filter: round_id, category, q)
- PUT/DELETE /api/questions/{id}

### Attachments
- POST /api/attachments/upload (multipart: file + round_id)
- GET  /api/attachments?round_id=
- GET  /api/attachments/{id}/file (Bearer or ?token=)
- DELETE /api/attachments/{id}

### Dashboard
- GET /api/dashboard/stats

## Navigation
Bottom tabs: Dashboard · Applications · Interviews · Questions · Profile
Stack routes: /login, /application/[id], /application/new, /round/[id], /round/new, /question/new

## Theming
Light + dark mode toggle (system / light / dark) with Forest-green + Coral brand.

## Implemented
- 2026-11 MVP: Google auth, applications CRUD/search/filter, rounds timeline, question bank, attachments (Object Storage), dashboard stats + charts, light/dark toggle, confirm sheets
- 2026-11 Round form: multi-select interview types (adds Behavioral + AI), attach photos/videos/files while creating a round (multi-select gallery, camera, documents); attachment delete; search escaping; safe back-navigation
- 2026-11 Offer card: shareable image card (company, role, rounds, days to offer, questions, round journey) + LinkedIn post text; shown for Offer Received/Accepted
- 2026-11 Exports (no setup): GET /api/export/sheet (.xlsx with Applications/Interview_Rounds/Interview_Questions/Attachments tabs, opens in Google Sheets) and GET /api/export/pdf (full report, images embedded, attached PDFs appended). Auth via Bearer (web) or ?token= (native). Profile → Export card.
- 2026-11 Per-application export: Export button on application detail → bottom sheet with Excel / PDF for that application only (?application_id=). Fixes: ₹ via bundled Noto Sans (backend/fonts), xlsx formula/control-char safety, ASCII filenames, offer_date tracking + backfill, web clipboard copy for offer post.
- Known limitation: non-Latin scripts (e.g. Devanagari, CJK) don't render in the PDF yet (needs extra Noto fonts).

## Not yet implemented (deferred)
- (Google Sheets live sync via OAuth was dropped at user's request — replaced by .xlsx export + PDF report)
- Local push notifications for reminders
- Native monthly calendar view
- Google Sheets / Drive export (hybrid mode - deferred)
