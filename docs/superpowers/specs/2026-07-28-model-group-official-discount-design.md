# MIDCODE Model Group Official Discount Design

## Goal

Show one compact discount badge, such as `3折`, beside every model group in the shared API-key model-group selector. The badge answers: "the group's current default selling price is what fraction of the LiteLLM official price after USD/CNY conversion?"

This change applies only to MIDCODE/FanAPI. OctoAPI is out of scope.

## User Experience

The existing `ModelGroupSelector` is shared by API-key creation and API-key group-order editing. Add the badge beside the group name there so both workflows receive the same display without duplicating UI logic.

Badge states:

- `3折`, `3.2折`, or `3.25折`: an available, consistent group discount, with trailing zeroes removed;
- `暂无官方价`: no bound model can be matched to a usable LiteLLM token price;
- `折扣不一致`: matched input/output prices do not resolve to one group discount.

The badge is informational. It does not change billing, routing, group ordering, or API-key authorization.

## Price Source And Cache

Fetch LiteLLM's official price catalog from:

`https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json`

The backend owns retrieval and parsing. The browser must not fetch LiteLLM directly.

Keep a process-local cache for six hours. A cold cache may perform one synchronous fetch with a 10-second HTTP timeout. Concurrent cold requests share the same refresh operation. After at least one successful fetch, refresh failures retain and serve the last successful catalog. If no successful catalog exists, model-group APIs still succeed and return the unavailable badge state.

Limit the response body to 8 MiB and accept only finite, positive `input_cost_per_token` and `output_cost_per_token` values. Other LiteLLM billing modes and price dimensions are outside this change.

## Exchange Rate

Add an administrator setting named `usd_cny_exchange_rate` and expose it in the existing settings page as `USD/CNY 汇率`. The default is `7.20`.

The setting must be finite and greater than zero. Reject invalid updates. If an invalid legacy value is encountered while reading, use the default and log the fallback rather than breaking the user model-group endpoint.

No schema migration is required because MIDCODE's system settings already support arbitrary keys.

## Model Matching

Use the bound channel's upstream `model` value, not its public `display_name`, as the official-price lookup key.

Match in this order:

1. exact LiteLLM catalog key;
2. exact catalog key after trimming surrounding whitespace;
3. unique final path segment match, only when exactly one LiteLLM entry has that segment.

Ambiguous or missing matches are unavailable. Do not guess by fuzzy similarity.

## Discount Calculation

Use the channel's default token selling prices from `billing_config`:

- `input_price_per_1m_tokens`;
- `output_price_per_1m_tokens`.

Do not apply user-group, VIP, fast-tier, or reseller overrides. This badge describes the model group's default current selling price.

For each usable dimension:

```text
official_cny_per_million = litellm_usd_per_token * 1,000,000 * usd_cny_exchange_rate
selling_cny_per_million  = selling_price_credits / 1,000,000
discount_bps             = selling_cny_per_million / official_cny_per_million * 10,000
```

Round each result to the nearest 10 basis points, which corresponds to `0.01折`. The group is consistent when all matched input/output dimensions round to the same result. The product rule is that a group has one discount; groups needing another discount must be created separately.

Missing official prices do not make a group inconsistent. Use every matched dimension that is available. If none are available, return unavailable. A non-positive selling price or a non-positive official price is not usable.

## API Contract

Extend the existing model-group summary returned by `/user/model-groups` and embedded in `/user/apikeys/:id/model-groups`:

```json
{
  "official_discount_bps": 3000,
  "official_discount_status": "available"
}
```

`official_discount_status` is one of:

- `available`;
- `unavailable`;
- `inconsistent`.

Omit `official_discount_bps` unless status is `available`. Admin model-group responses may reuse the enriched summary, but this design only requires the badge in the user API-key selector.

## Failure Boundaries

- LiteLLM network, HTTP, size, or parse failure must not fail model-group listing.
- A bad exchange-rate update returns a validation error and is not stored.
- A bad stored exchange rate falls back to `7.20`.
- Missing or ambiguous model matches return unavailable.
- Mixed group discounts return inconsistent; never average them.
- No billing configuration is mutated by official-price refresh or discount calculation.

## Testing

Backend tests cover:

- LiteLLM token-price parsing and rejection of invalid numbers;
- exact and unique-segment matching, including ambiguous rejection;
- USD/CNY conversion and basis-point calculation;
- consistent input/output and multi-model groups;
- unavailable and inconsistent states;
- stale-cache fallback after refresh failure;
- exchange-rate validation and default fallback;
- model-group API serialization.

Frontend tests cover badge labels for available, unavailable, and inconsistent states and confirm the shared selector renders the badge in API-key creation and edit workflows. Existing group selection, ordering, provider tabs, disabled-provider preservation, billing, and routing behavior must remain unchanged.
