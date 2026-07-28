# Model Group Drag Reorder Design

## Scope

Improve `ModelGroupSelector` so selected model-group cards visibly reorder when users click the arrow controls, and allow the same selected cards to be reordered by dragging a dedicated handle.

The change applies only to MidCode/FanAPI. It does not modify OctoAPI, pricing calculations, provider boundaries, API payloads, or persistence behavior.

## Behavior

- Render selected groups within each provider in `selectedIds` order. Render unselected groups after them in their existing catalog order.
- Keep the existing up/down controls. Clicking an enabled arrow immediately moves the complete card and updates priority labels.
- Show a six-dot drag handle only for selected groups belonging to an active provider.
- Dragging is limited to selected groups in the currently visible provider. Groups cannot move across providers.
- While dragging, the source card uses reduced opacity and a primary-color outline. Moving over another selected card immediately swaps their positions so the list visibly responds before drop.
- Dropping or cancelling clears all drag styling. The new order remains local until the user clicks the existing save/create command.
- Existing arrow controls remain the mobile and keyboard-accessible fallback. Native drag interaction is desktop-oriented and adds no package dependency.

## State Flow

`selectedIds` remains the only ordering state sent to callers. A provider-specific render order is derived from `selectedIds` plus the provider catalog. Both arrow and drag interactions call the same provider-scoped reorder operation, which replaces only that provider's selected slots in the global array. This preserves interleaved priorities from other providers exactly as the current API expects.

Transient drag state stores only the dragged group ID. It is cleared on drag end and when the dragged item becomes unavailable.

## Error Boundaries

Ignore drag or arrow operations when the source is unselected, the target is unselected, either group is outside the active provider, or the resulting index is out of bounds. Disabled providers retain bindings unchanged and expose neither enabled arrows nor a usable drag handle.

## Verification

- Extend the API-key model-group browser test to assert that an arrow click changes visible card order before save and submits the expected `group_ids` order.
- Add a drag-handle interaction that moves a selected card over another selected card, then assert visible order and the saved payload.
- Verify the dialog at desktop and 390px width, including no horizontal overflow.
- Verify the page loads without framework overlays or relevant console errors and capture the final drag-ready state in the in-app browser.
