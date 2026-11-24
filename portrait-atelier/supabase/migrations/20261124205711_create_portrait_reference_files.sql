
-- Keep a database record of each uploaded photograph.

CREATE TABLE public.portrait_reference_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  enquiry_id uuid NOT NULL
    REFERENCES public.portrait_enquiries(id)
    ON DELETE CASCADE,

  storage_path text NOT NULL UNIQUE,

  reference_type text NOT NULL
    CHECK (reference_type IN ('pet', 'background')),

  file_size integer NOT NULL
    CHECK (file_size > 0 AND file_size <= 15728640),

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Customer photographs must not be publicly accessible.
ALTER TABLE public.portrait_reference_files
ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON public.portrait_reference_files
FROM anon, authenticated;

-- Allow our trusted backend to manage photograph records.
GRANT SELECT, INSERT, UPDATE, DELETE
ON public.portrait_reference_files
TO service_role;
