CREATE TABLE IF NOT EXISTS public.dimension_node (
  id text PRIMARY KEY,
  parent_id text REFERENCES public.dimension_node(id) ON DELETE CASCADE,
  canonical_name text NOT NULL,
  display_name text NOT NULL,
  composition_op text NOT NULL DEFAULT 'leaf',
  weight_in_parent numeric(6,4),
  rubric_id text NOT NULL,
  role_id uuid,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dimension_node
  ADD CONSTRAINT dimension_node_composition_op_check
  CHECK (composition_op IN ('leaf', 'weighted_sum', 'min_of', 'conditional'));

CREATE INDEX IF NOT EXISTS idx_dimension_node_rubric
  ON public.dimension_node (rubric_id, version);

CREATE INDEX IF NOT EXISTS idx_dimension_node_parent
  ON public.dimension_node (parent_id);
