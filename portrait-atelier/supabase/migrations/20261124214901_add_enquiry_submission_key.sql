
-- Give each enquiry a unique submission identifier.
-- Repeated requests with the same key must not create duplicates.

ALTER TABLE public.portrait_enquiries
ADD COLUMN submission_key uuid;

CREATE UNIQUE INDEX portrait_enquiries_submission_key_unique
ON public.portrait_enquiries (submission_key);
