
-- Store a secure upload token hash for each enquiry.
-- The actual token will only be given to the customer.

ALTER TABLE public.portrait_enquiries
ADD COLUMN upload_token_hash text,
ADD COLUMN upload_expires_at timestamptz;
