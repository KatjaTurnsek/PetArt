
-- Track how many photographs belong to each enquiry.
-- Maximum: 20 photographs per enquiry.

ALTER TABLE public.portrait_enquiries
ADD COLUMN reference_upload_count integer
NOT NULL DEFAULT 0
CHECK (
  reference_upload_count >= 0
  AND reference_upload_count <= 20
);
