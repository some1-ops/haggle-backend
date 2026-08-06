The devices/usage_records schema that used to be here is gone — it duplicated
infrastructure that already exists in the `haggle` website repo
(`supabase/migrations/001` through `010`). This backend reads and writes the
SAME Supabase project as the website: `profiles` table (id, available_credits,
subscription_tier) and the `deduct_credit(target_user_id uuid)` RPC.

The only new migration this repo adds is `011_command_tier.sql`, which
extends the existing `subscription_tier` enum with 'command'/'command_yearly'
and updates the free-signup trigger to grant 3 credits instead of 2. Run it
in the same Supabase project the website already uses — do not create a
second Supabase project.
