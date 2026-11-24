
-- Reserve one photograph upload slot safely.
-- Only our server-side API may call this function.

CREATE OR REPLACE FUNCTION public.reserve_reference_upload_slot(
  p_enquiry_id uuid,
  p_token_hash text
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.portrait_enquiries
  SET reference_upload_count = reference_upload_count + 1
  WHERE id = p_enquiry_id
    AND upload_token_hash = p_token_hash
    AND upload_expires_at > now()
    AND reference_upload_count < 20
  RETURNING reference_upload_count;
$$;

-- Never allow browser clients to call this function directly.
REVOKE ALL ON FUNCTION public.reserve_reference_upload_slot(uuid, text)
FROM PUBLIC, anon, authenticated;

-- Allow only our trusted server-side API.
GRANT EXECUTE ON FUNCTION public.reserve_reference_upload_slot(uuid, text)
TO service_role;
