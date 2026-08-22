# Billing Card Redemption Consolidation Design

## Problem

Card redemption currently lives on a standalone `/exchange` page while online
recharge lives on `/billing?tab=recharge`. This creates two account-balance
entries in the sidebar and makes users leave the recharge flow after buying a
card code. The billing page already exposes a card-purchase link, but its copy
still sends users to the separate exchange center.

The card sales URL already has an authoritative configuration path:
`card_purchase_url` is editable in the admin payment settings, exposed in the
public site settings, and mapped to `settings.cardPurchaseUrl`. This change must
reuse that contract rather than add another setting or backend endpoint.

## Agreed User Experience

- Remove the `Exchange Center` entry from the account sidebar.
- Keep `Points Recharge` as the single navigation entry for online payments and
  card-code redemption.
- In the recharge tab, show card redemption after the balance and dedicated
  model-credit summaries and before online payment controls.
- The card section contains the card-code input, the redeem action, and a
  `Purchase Card Code` external-link action when `card_purchase_url` is set.
- Hide only the purchase action when `card_purchase_url` is empty. Redemption
  remains available because users may already possess a card code.
- Show redemption history below the redemption controls.
- Preserve recharge plans, custom amount entry, coupons, payment-method
  selection, immediate payment, transaction history, and order history without
  behavioral changes.
- Preserve old bookmarks by replacing `/exchange` with a redirect to
  `/billing?tab=recharge`.

## Component Design

Create a page-specific `CardRedemptionSection` component beside the user pages.
It owns only the redemption workflow:

- loading redemption history with `userApi.getRedeemHistory`;
- holding the card-code, submitting, and mutation-error state;
- submitting the trimmed code with `userApi.redeemCard`;
- rendering the configured purchase link, redemption input, feedback, loading
  state, empty state, and history table;
- invoking an `onRedeemed` callback after a successful redemption.

`UserBillingPage` renders the component in its `recharge` tab and passes
`reloadBalance` as `onRedeemed`. This keeps the already large billing page from
absorbing another independent request and table workflow while making the
balance update immediately after redemption.

The standalone `UserExchangePage` becomes dead code after the route redirect
and will be removed. Its router lazy import and the sidebar item will also be
removed. Shared icon imports must remain when another navigation item uses them.

## Data And Error Flow

1. Opening the recharge tab loads the current redemption-history page using the
   existing authenticated API.
2. The redeem action ignores an empty trimmed value and disables duplicate
   submissions while a request is active. Pressing Enter follows the same path.
3. On success, the component clears the input, shows the existing success toast,
   reloads redemption history, and calls `reloadBalance`.
4. On failure, it derives the API message through `getApiErrorMessage`, shows the
   inline destructive alert, and emits the existing error toast.
5. A history-load failure is visible without disabling the redemption input.
6. The purchase action opens `settings.cardPurchaseUrl` in a new tab with
   `noopener noreferrer`.

No backend handler, database schema, redemption API, or public-settings contract
changes are required.

## Compatibility And Copy

- `/exchange` uses a React Router `Navigate` element with `replace` so old
  bookmarks and external links arrive at the consolidated recharge tab without
  leaving a duplicate history entry.
- The `/recharge` compatibility redirect continues to target `/billing`; the
  billing page defaults to the recharge tab.
- The admin payment-setting tip will describe the purchase entry as appearing
  on `Points Recharge` only.
- Existing localized sidebar keys may remain in translation resources if they
  are used elsewhere; unused code imports and route imports must be removed.

## Test Strategy

- Add or update focused source-contract tests proving that the sidebar has no
  `/exchange` item, the route redirects to `/billing?tab=recharge`, the billing
  page renders the redemption component, and the configured purchase link is
  owned by that component.
- Add browser coverage with mocked authenticated APIs to prove the consolidated
  flow: open billing, enter a code, submit, observe success, see refreshed
  history and balance, and verify the purchase link target.
- Update route-smoke coverage so visiting `/exchange` asserts the billing page
  and recharge tab after redirect.
- Run the focused unit and browser tests, all frontend unit tests, TypeScript
  build, lint for touched files, and the production frontend build.
- Inspect desktop and mobile layouts to ensure controls wrap cleanly and the
  history table remains horizontally scrollable when required.

## Publication

After verification, commit the implementation, ensure it is integrated into
`main`, push `main`, create the next semantic version tag after `v1.0.48`, and
move `latest` to the same verified commit. Verify the peeled remote tag refs and
remote `main` commit independently. Repository publication does not by itself
prove a production deployment or live-site acceptance.

## Out Of Scope

- Changing card creation, redemption accounting, or redemption-history
  pagination semantics.
- Adding a second card-sales URL or a new admin settings area.
- Redesigning online payment, coupon, transaction, or order workflows.
- Claiming deployment or production behavior based only on pushed Git refs.
