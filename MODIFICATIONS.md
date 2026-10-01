# Vertex modifications

This fork contains modifications to Invoice Ninja UI, based on the upstream `develop` revision `1d2f28f74990859f2dc991e3d17f4707119557f2`.

The guarded native Reports receivables preview displays current authorized invoice balances, overdue classification and exact per-currency totals. It adds localized Arabic and English labels, request context isolation and explicit read-only states. Its development-only UI flag is off by default; the native backend also requires local/testing opt-in and current report/object permissions. The preview does not dispatch reminders or approve collection actions.

Original licensing, copyright and trademark notices remain in place. This source retains the [Elastic License 2.0](LICENSE). License key checks and existing protected functionality have not been modified. This draft source delivery does not deploy a hosted service.
