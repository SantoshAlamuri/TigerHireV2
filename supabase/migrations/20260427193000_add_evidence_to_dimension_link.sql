CREATE TABLE IF NOT EXISTS public.evidence_to_dimension_link (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evidence_type_id text NOT NULL REFERENCES public.evidence_type(id) ON DELETE CASCADE,
  dimension_node_id text NOT NULL REFERENCES public.dimension_node(id) ON DELETE CASCADE,
  contribution_weight numeric(6,4) NOT NULL,
  role_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.evidence_to_dimension_link
  ADD CONSTRAINT evidence_to_dimension_link_contribution_weight_check
  CHECK (contribution_weight >= 0 AND contribution_weight <= 1);

CREATE INDEX IF NOT EXISTS idx_evidence_dimension_link_dimension
  ON public.evidence_to_dimension_link (dimension_node_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_dimension_link_unique_global
  ON public.evidence_to_dimension_link (evidence_type_id, dimension_node_id)
  WHERE role_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_dimension_link_unique_role
  ON public.evidence_to_dimension_link (evidence_type_id, dimension_node_id, role_id)
  WHERE role_id IS NOT NULL;
