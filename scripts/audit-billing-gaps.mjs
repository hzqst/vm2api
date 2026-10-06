import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync(process.argv[2] || '/opt/kin-gateway/data/kin.db', { readOnly: true })
const rows = (sql) => db.prepare(sql).all()
const one = (sql) => db.prepare(sql).get()

const out = {
  totals: one(`
    SELECT COUNT(*) AS n,
      SUM(CASE WHEN status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS ok2xx,
      SUM(CASE WHEN input_tokens IS NULL THEN 1 ELSE 0 END) AS null_in,
      SUM(CASE WHEN output_tokens IS NULL THEN 1 ELSE 0 END) AS null_out,
      SUM(CASE WHEN total_cost IS NULL THEN 1 ELSE 0 END) AS null_cost,
      SUM(CASE WHEN status BETWEEN 200 AND 299 AND input_tokens IS NULL THEN 1 ELSE 0 END) AS ok_null_in,
      SUM(CASE WHEN status BETWEEN 200 AND 299 AND (total_cost IS NULL OR total_cost=0)
                AND COALESCE(input_tokens,0)+COALESCE(output_tokens,0)>0 THEN 1 ELSE 0 END) AS ok_tokens_zero_cost,
      ROUND(SUM(COALESCE(total_cost,0)),4) AS cost
    FROM usage_logs
  `),
  protocol: rows(`
    SELECT protocol, COUNT(*) AS n,
      SUM(CASE WHEN status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS ok2xx,
      SUM(CASE WHEN status BETWEEN 200 AND 299 AND input_tokens IS NULL THEN 1 ELSE 0 END) AS ok_null_in,
      SUM(CASE WHEN total_cost IS NULL THEN 1 ELSE 0 END) AS null_cost,
      ROUND(SUM(COALESCE(total_cost,0)),4) AS cost,
      SUM(COALESCE(input_tokens,0)) AS in_tok,
      SUM(COALESCE(output_tokens,0)) AS out_tok,
      SUM(COALESCE(cache_read_tokens,0)) AS cache_read,
      SUM(COALESCE(cache_creation_tokens,0)) AS cache_create
    FROM usage_logs GROUP BY protocol ORDER BY n DESC
  `),
  ua: rows(`
    SELECT CASE
      WHEN user_agent LIKE '%kin-console-test%' THEN 'vm-test'
      WHEN user_agent LIKE '%claude-cli%' OR user_agent LIKE '%claude-code%'
        OR user_agent LIKE '%Claude-Code%' OR user_agent LIKE '%Claude Code%' THEN 'official-cc'
      WHEN user_agent LIKE '%Rikka%' THEN 'rikka'
      WHEN user_agent LIKE '%Hermes%' THEN 'hermes'
      WHEN user_agent LIKE '%Cherry%' THEN 'cherry'
      WHEN user_agent LIKE '%Go-http-client%' THEN 'go-http'
      WHEN user_agent LIKE '%OpenAI%' OR user_agent LIKE '%openai%' THEN 'openai-sdk'
      WHEN user_agent IS NULL OR user_agent = '' THEN 'empty'
      ELSE 'other-third'
    END AS ua_class,
    COUNT(*) AS n,
    SUM(CASE WHEN status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS ok2xx,
    SUM(CASE WHEN status BETWEEN 200 AND 299 AND input_tokens IS NULL THEN 1 ELSE 0 END) AS ok_null_in,
    ROUND(SUM(COALESCE(total_cost,0)),4) AS cost
    FROM usage_logs GROUP BY ua_class ORDER BY n DESC
  `),
  path: rows('SELECT path, COUNT(*) AS n FROM usage_logs GROUP BY path ORDER BY n DESC LIMIT 20'),
  other_ua: rows(`
    SELECT substr(user_agent,1,90) AS ua, COUNT(*) AS n,
      SUM(CASE WHEN status BETWEEN 200 AND 299 AND input_tokens IS NULL THEN 1 ELSE 0 END) AS ok_null_in,
      ROUND(SUM(COALESCE(total_cost,0)),4) AS cost
    FROM usage_logs
    WHERE user_agent NOT LIKE '%kin-console-test%'
      AND user_agent NOT LIKE '%claude-cli%'
      AND user_agent NOT LIKE '%claude-code%'
      AND user_agent NOT LIKE '%Claude-Code%'
      AND user_agent NOT LIKE '%Claude Code%'
      AND user_agent NOT LIKE '%Rikka%'
      AND user_agent NOT LIKE '%Hermes%'
      AND user_agent NOT LIKE '%Cherry%'
    GROUP BY ua ORDER BY n DESC LIMIT 15
  `),
  ok_null_in_sample: rows(`
    SELECT protocol, status, stream, path, substr(user_agent,1,60) AS ua,
      model, error_code, stop_reason, final_state, via
    FROM usage_logs
    WHERE status BETWEEN 200 AND 299 AND input_tokens IS NULL
    ORDER BY created_at DESC LIMIT 20
  `),
  today_by_ua: rows(`
    SELECT CASE
      WHEN user_agent LIKE '%kin-console-test%' THEN 'vm-test'
      WHEN user_agent LIKE '%claude-cli%' OR user_agent LIKE '%claude-code%'
        OR user_agent LIKE '%Claude-Code%' OR user_agent LIKE '%Claude Code%' THEN 'official-cc'
      ELSE 'third-or-other'
    END AS ua_class,
    COUNT(*) AS n,
    SUM(CASE WHEN status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS ok2xx,
    ROUND(SUM(COALESCE(total_cost,0)),4) AS cost,
    SUM(COALESCE(input_tokens,0)) AS in_tok,
    SUM(COALESCE(output_tokens,0)) AS out_tok
    FROM usage_logs
    WHERE created_at >= datetime('now', '+8 hours', 'start of day', '-8 hours')
    GROUP BY ua_class
  `),
}

console.log(JSON.stringify(out, null, 2))
db.close()
