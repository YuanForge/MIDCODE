# FanAPI Long-Stream and Responses WebSocket Design

Date: 2026-07-27

## Goal

Prevent FanAPI from terminating legitimate long-running LLM streams while making the existing Responses WebSocket endpoint reachable and stable across multiple tool turns.

## Scope

1. Raise the API proxy read and downstream send idle timeouts from 660 seconds to 1800 seconds in both FanAPI Nginx API proxy locations.
2. Keep `proxy_connect_timeout` at 10 seconds and `proxy_send_timeout` at 120 seconds.
3. Add an exact `/v1/responses` Nginx location that supports both POST/SSE and GET/WebSocket by forwarding `Upgrade` and conditionally setting `Connection`.
4. Stop applying the channel's total `http.Client.Timeout` to streaming LLM requests. Non-streaming requests retain the configured channel timeout; streaming requests remain bounded by request cancellation and proxy idle timeouts.
5. Pin the selected channel, pool key, and upstream WebSocket connection after the first successful turn so later `previous_response_id` turns cannot move to a different upstream session.

## Out Of Scope

- EdgeOne timeout, cache, 426 fallback, WAF, and real-client-IP rules.
- `/v1/models` response format.
- OpenAPI documentation field expansion.
- FanAPI-side storage or expansion of HTTP `previous_response_id` history.
- Changing the upstream `response.create` envelope without a failing direct-upstream compatibility test.
- Adding server-generated WebSocket heartbeat traffic without an idle-connection reproduction.

## Behavior

### HTTP and SSE

- Backend connection establishment still fails within 10 seconds.
- Upload inactivity still fails within 120 seconds.
- Nginx permits up to 1800 seconds without response data.
- Streaming Go requests have no independent total-duration cutoff; disconnecting the client cancels the upstream request through the existing request context.
- Non-streaming requests continue to use `channels.timeout_ms`.

### Responses WebSocket

- A GET Upgrade request to `/v1/responses` reaches `ResponsesWSProxy`.
- A normal POST to the same path continues to use the existing Responses HTTP/SSE handler.
- The first turn selects the authorized route and pool key.
- Later turns on the same client socket reuse that route, key, and upstream socket.
- If the pinned upstream fails, the socket returns an error rather than silently moving `previous_response_id` to another upstream session.

## Verification

- Validate the Nginx configuration with the deployment-matching `nginx:stable` image.
- Run focused handler and protocol tests.
- Add regression coverage for streaming client timeout selection and WebSocket route pinning.
- Run `go test ./... -count=1` and `git diff --check`.
- Production EdgeOne, host OpenResty, and deployment remain outside local verification.

## Rollback

Revert the task commit. Existing HTTP/SSE routes and the EdgeOne 426 fallback remain unchanged by this design.
