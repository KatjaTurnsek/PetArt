
-- Release a reserved upload slot if photograph storage fails.
-- Only our server-side API may call this function.

CREATE OR REPLACE FUNCTION public.release_reference_upload_slot(
  p_enquiry_id uuid
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.portrait_enquiries
  SET reference_upload_count = reference_upload_count - 1
  WHERE id = p_enquiry_id
    AND reference_upload_count > 0
  RETURNING reference_upload_count;
$$;

-- Prevent public access to this function.
REVOKE ALL
ON FUNCTION public.release_reference_upload_slot(uuid)
FROM PUBLIC, anon, authenticated;

-- Allow only our trusted backend to call it.
GRANT EXECUTE
ON FUNCTION public.release_reference_upload_slot(uuid)
TO service_role;
