# Team skill tags (2026-11-27)

- **Core:** `void-live-deploy/lib/team-skills.js` (tests: `tools/team-skills.test.mjs`, check: `tools/checks.d/team-skills.chk`).
- **What it does:** Defines the five seat skill tags (`code`, `review`, `design`, `video`, `tests`), normalizes tag lists (`parseSkills`), infers tags for queued jobs (`jobSkills`), reorders non-owner-ask jobs to match a seat's tags while keeping owner asks first (`matchJobsToSkills`), and persists per-seat tags in `void_team_skills` (`skillsTableSql`, `getSeatSkills`, `setSeatSkills`).
