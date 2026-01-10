-- sql_constraint_fixes.sql

-- 1. Update assinaturas_cobrancas billing_type check to include 'downgrade' and 'renewal'
-- Current limitation: subscription, upgrade, activation, upgrade_plan, expansion
-- New values found in code: downgrade, renewal

ALTER TABLE assinaturas_cobrancas DROP CONSTRAINT IF EXISTS assinaturas_cobrancas_billing_type_check;

ALTER TABLE assinaturas_cobrancas ADD CONSTRAINT assinaturas_cobrancas_billing_type_check 
CHECK (billing_type::text = ANY (ARRAY[
    'subscription'::text, 
    'upgrade'::text, 
    'activation'::text, 
    'upgrade_plan'::text, 
    'expansion'::text, 
    'downgrade'::text,
    'renewal'::text
]));
