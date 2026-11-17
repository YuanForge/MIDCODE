WITH spending AS (
 SELECT user_id,
 SUM(CASE WHEN type='refund' THEN -credits ELSE credits END) AS consumed
 FROM billing_transactions
 WHERE created_at >= $1 AND created_at < $2
 AND type IN ('charge','hold','settle','refund')
 GROUP BY user_id
 HAVING SUM(CASE WHEN type='refund' THEN -credits ELSE credits END) > 0
), ranked AS (
 SELECT u.id AS user_id, COALESCE(u.username,'') AS username, s.consumed
 FROM spending s JOIN users u ON u.id=s.user_id
 ORDER BY s.consumed DESC, u.id ASC LIMIT 10
)
SELECT r.user_id,r.username,r.consumed,q.qq
FROM ranked r LEFT JOIN user_qq_bindings q ON q.user_id=r.user_id
 AND q.verified_at IS NOT NULL AND q.verified_group_id='767281836'
ORDER BY r.consumed DESC,r.user_id ASC