
-- Give each photograph upload a unique identifier.
-- This helps prevent duplicate files when customers retry.

ALTER TABLE public.portrait_reference_files
ADD COLUMN upload_id uuid;

CREATE UNIQUE INDEX portrait_reference_files_upload_id_unique
ON public.portrait_reference_files (upload_id);
