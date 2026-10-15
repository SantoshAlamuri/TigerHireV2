/**
 * Built-in offer letter body when no org template exists yet (B2).
 * Placeholders: {{company_name}}, {{candidate_name}}, {{role_title}}, {{start_date}},
 * {{compensation}}, {{notes}}, {{generated_date}}
 */
export const DEFAULT_OFFER_TEMPLATE_BODY = `OFFER OF EMPLOYMENT

{{company_name}}

Dear {{candidate_name}},

We are pleased to offer you the position of {{role_title}} with an anticipated start date of {{start_date}}.

Compensation and benefits (summary):
{{compensation}}

{{compensation_breakdown}}

CTC (summary line): {{ctc_lpa}}

{{notes}}

Please sign where indicated to acknowledge receipt of this offer. Additional terms may be set out in separate agreements.

Generated: {{generated_date}}
`;
