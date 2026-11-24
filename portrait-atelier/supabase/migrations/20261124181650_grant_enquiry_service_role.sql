
-- Allow our server-side API to save enquiries.
GRANT SELECT, INSERT
ON TABLE public.portrait_enquiries
TO service_role;

-- Keep direct public access blocked.
REVOKE ALL
ON TABLE public.portrait_enquiries
FROM anon, authenticated;
