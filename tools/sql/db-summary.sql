\pset border 2
\pset linestyle unicode

\echo '── Entity Counts ──────────────────────────────────────────────'
SELECT entity, rows FROM (
  SELECT 'users'              AS entity, COUNT(*) AS rows FROM users             UNION ALL
  SELECT 'hackathons',                   COUNT(*)          FROM hackathons        UNION ALL
  SELECT 'tracks',                       COUNT(*)          FROM tracks            UNION ALL
  SELECT 'projects',                     COUNT(*)          FROM projects          UNION ALL
  SELECT 'teams',                        COUNT(*)          FROM teams             UNION ALL
  SELECT 'submissions',                  COUNT(*)          FROM submissions       UNION ALL
  SELECT 'participants',                 COUNT(*)          FROM participants      UNION ALL
  SELECT 'team_participants',            COUNT(*)          FROM team_participants UNION ALL
  SELECT 'phases',                       COUNT(*)          FROM phases            UNION ALL
  SELECT 'pages',                        COUNT(*)          FROM pages
) counts ORDER BY rows DESC;

\echo '── Hackathons ─────────────────────────────────────────────────'
SELECT
  h.name,
  h.visibility,
  CASE
    WHEN h.starts_at IS NULL      THEN 'unscheduled'
    WHEN h.starts_at > NOW()      THEN 'upcoming'
    WHEN h.ends_at IS NULL
      OR h.ends_at >= NOW()       THEN 'ongoing'
    ELSE                               'past'
  END                               AS status,
  h.starts_at::date                 AS start,
  h.ends_at::date                   AS "end",
  COUNT(DISTINCT t.id)              AS tracks,
  COUNT(DISTINCT p.id)              AS projects,
  COUNT(DISTINCT pa.user_id)        AS participants
FROM hackathons h
LEFT JOIN tracks t        ON t.hackathon_tracks   = h.id
LEFT JOIN projects p      ON p.hackathon_projects = h.id
LEFT JOIN participants pa ON pa.hackathon_id      = h.id
GROUP BY h.id
ORDER BY h.starts_at NULLS LAST;

\echo '── Users ──────────────────────────────────────────────────────'
SELECT
  u.username,
  u.display_name,
  u.email,
  COUNT(DISTINCT pa.hackathon_id)                               AS hackathons,
  COUNT(DISTINCT tp.team_id)                                    AS teams,
  BOOL_OR(pa.hackathon_id IS NOT NULL AND pa.is_waiting = true) AS has_waitlist
FROM users u
LEFT JOIN participants      pa ON pa.user_id = u.id
LEFT JOIN team_participants tp ON tp.user_id = u.id
GROUP BY u.id
ORDER BY u.username;
