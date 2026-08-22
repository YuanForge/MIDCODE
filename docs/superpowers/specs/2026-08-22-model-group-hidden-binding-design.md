# Model Group Hidden Binding Design

## Problem

The model-group editor loads saved bindings by `routing_model`, but builds its
rows only from each channel's current `display_name` or `model`. If a channel is
renamed after it is bound, the saved routing model remains selected in state
without a matching row. The selected count then exceeds the visible checked
rows, and the administrator cannot inspect or remove the hidden binding.

## Behavior

- Treat saved bindings as authoritative editing state.
- Build the table from the union of current channel routing models and saved
  binding routing models.
- For a saved routing model that no longer matches the channel's current routing
  model, show a normal checked row containing its saved channel.
- Keep the channel's current routing model available as a separate unchecked row
  so the administrator can explicitly migrate by removing the old binding and
  selecting the new one.
- Count the same selected keys that the table renders. Do not hide, rename, or
  automatically rewrite existing bindings.

## Scope

The change is limited to the model-group administration page and its regression
coverage. It does not change API contracts, channel-update behavior, database
rows, routing semantics, or unrelated model-group workflows.

## Verification

An end-to-end fixture will load one saved binding whose routing model differs
from its channel's current display model. Before the fix, the selected count has
no matching checked row. After the fix, both the historical checked row and the
current unchecked row are visible, and clearing the historical row removes it
from the selected count. Existing unit tests, the targeted browser test, lint,
and the production frontend build must pass.
