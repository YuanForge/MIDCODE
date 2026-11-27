-- Cached and raw
-- ranges are disjoint. Rank all uncovered logs together to preserve deduplication.
WITH days AS MATERIALIZED (
 SELECT s.*,s.day::timestamp AS lo,s.day+interval '1 day' AS hi
 FROM usage_rollup_state s WHERE s.user_id=$1 AND NOT s.dirty AND NOT s.unsafe
 AND s.day BETWEEN $2::timestamp::date AND $3::timestamp::date
), full_days AS MATERIALIZED (
 SELECT * FROM days WHERE $5='day' AND covered_until>=hi AND lo >= $2 AND hi <= $3
 AND NOT (lo<$4 AND hi>$4)
), hours AS MATERIALIZED (
 SELECT h AS lo,h+interval '1 hour' AS hi FROM days d
 CROSS JOIN LATERAL generate_series(d.lo,d.covered_until-interval '1 hour',interval '1 hour') h
 WHERE h >= $2 AND h+interval '1 hour' <= $3 AND NOT (h<$4 AND h+interval '1 hour'>$4)
 AND NOT EXISTS(SELECT 1 FROM full_days f WHERE f.day=d.day)
), cached_ranges AS (
 SELECT lo,hi FROM full_days UNION ALL SELECT lo,hi FROM hours
), edges AS (
 SELECT hi AS lo,lead(lo,1,$3::timestamp) OVER(ORDER BY lo,hi) AS hi
 FROM (SELECT $2::timestamp AS lo,$2::timestamp AS hi UNION ALL SELECT * FROM cached_ranges) e
), gaps AS MATERIALIZED (SELECT * FROM edges WHERE hi>lo),
raw_result AS (RAW_QUERY),
cached AS (
 SELECT u.* FROM full_days d JOIN usage_daily u ON u.user_id=$1 AND u.bucket=d.lo
 UNION ALL
 SELECT u.* FROM hours h JOIN usage_hourly u ON u.user_id=$1 AND u.bucket=h.lo
)
SELECT * FROM raw_result
UNION ALL
SELECT CASE WHEN bucket >= $4 THEN 1 ELSE 0 END,date_trunc($5,bucket) AT TIME ZONE 'Asia/Shanghai',
 model,requests,success,failed,credits,input,cache_read,cache_write,output FROM cached
