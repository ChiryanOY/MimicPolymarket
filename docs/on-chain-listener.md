# On-chain leader signals

MimicPolymarket v2 no longer polls the Polymarket Data API for leader activity. The signal path is event-driven:

1. Polygon WSS subscriptions filter `OrderFilled` by the configured leader maker topics.
2. The listener waits for `CHAIN_CONFIRMATIONS` before accepting a live event.
3. The V1, V2, and V3 exchange decoders recover side, token, size, USDC notional, and execution price directly from the log.
4. Gamma metadata enrichment resolves the token to its market and outcome.
5. A deterministic `transactionHash:logIndex` event ID is upserted into the existing per-leader MongoDB execution queue.
6. `tradeExecutor` applies the existing aggregation, risk, and order-routing pipeline.

## Gap recovery

WSS is the low-latency path, not the source of recovery truth. A MongoDB cursor records the last completely scanned confirmed block. Every `ONCHAIN_BACKFILL_INTERVAL_MS`, the HTTP RPC scans from that cursor through the current confirmed head. The cursor advances only after every log in a chunk has been decoded and durably stored.

On first v2 startup, the cursor is initialized at the current confirmed head so old leader trades are not replayed. Subsequent restarts resume from the saved cursor.

## Deduplication and restart behavior

- WSS and HTTP backfill may observe the same log; the deterministic event ID makes insertion idempotent.
- Interrupted v2 activities with `botExcutedTime=1` are returned to the pending queue.
- Legacy HTTP-polled rows without an on-chain `eventId` are marked historical during migration, preventing stale orders from executing after upgrade.
- V3 Combo Exchange fills are deliberately not copied until the executor supports atomic combo execution.

## Required RPC capabilities

- `RPC_URL`: Polygon HTTP(S) JSON-RPC supporting `eth_blockNumber`, `eth_getLogs`, and block lookup.
- `POLYGON_WSS_URL`: Polygon WS(S) JSON-RPC supporting log subscriptions.

Use a dedicated provider endpoint for production. Public endpoints are convenient defaults but may throttle subscriptions or historical log queries.
