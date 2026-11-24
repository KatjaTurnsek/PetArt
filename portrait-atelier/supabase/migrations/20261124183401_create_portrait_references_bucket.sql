
-- Create private storage for Portrait Atelier references.
-- Keep original customer photographs inaccessible to the public.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'portrait-references',
  'portrait-references',
  false,
  15728640,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
