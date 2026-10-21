# Gmail replies — implemented
Protected UI: /respostas.html; dashboard banner links to setup. HAMATE and GADITA OAuth were renewed and verified individually. The worker is deployed as gmail-replies with verify_jwt=true plus application Auth/session/operator checks. Scheduler uses the legacy public anon JWT only for gateway verification, and a separate secret X-Monitor-Key validated against Vault. No Google token reaches the browser.

## Exact bindings
Users search their selected company Gmail, inspect a conversation, then explicitly select counterpart sender addresses and confirm it for an existing open treatment. API verifies company ownership and sender presence. Opaque Gmail web links are not treated as API IDs. Bindings are private and are invalidated when the saved source link changes. Closed/deleted treatments are omitted. No fuzzy matching, no email sending, no body or attachment import.

## State and access
gmail_private.reply_watches stores company, treatment, thread ID, approved counterpart addresses, source link, operator, binding revision, last outgoing/incoming IDs/times, pending flag/time, last successful check/attempt/error. RLS and no client grants; only service-role RPC with session/operator validation. Public treatment records and their history are unchanged. Dashboard reads alerts through the authenticated endpoint and overlays red rows/sorts pending first. Session loss clears private UI.

## Polling
Separate reply_settings and reply_robot_allowed; original robot_settings remains false, gmail-robot-* jobs remain inactive and old sync/matching RPC grants remain revoked. New gmail-reply-hamate and gmail-reply-gadita cron jobs run every five minutes, staggered, only if connected and bindings exist. Maximum 10 oldest-attempt bindings per run; larger queues need additional cycles. Independent failures are recorded and stale state displayed after 15 minutes. Reading mail does not clear a pending reply. Later SENT from the company clears pending. Only confirmed counterpart incoming messages count. Draft, spam, trash, Auto-Submitted and autoreply markers are excluded. Replies sent from aliases not registered as the company's main account are not automatically recognized.

## Validation
8 pure classifier tests pass (received/sent ordering, unread independence, draft exclusion, sender restrictions, automatic/spam/trash exclusion, pending duration, exact thread, participant separation).
SQL tests with ROLLBACK verified cross-company rejection, bind/save, anonymous rejection and no test bindings retained. Real protected UI listed 4 HAMATE and 11 GADITA open treatments and Gmail search returned real HAMATE conversations. Initial bindings require user confirmation; no unrelated conversation was silently linked.
Existing security advisor warnings for public.set_updated_at search_path and leaked-password protection were not introduced by this feature. Private tables deliberately have no client policies.
Reference: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/get
