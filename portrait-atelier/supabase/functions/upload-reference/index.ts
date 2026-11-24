
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const BUCKET_NAME = "portrait-references";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];
type ReferenceType = "pet" | "background";

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Checks the image's file signature.
 */
function matchesImageSignature(
  bytes: Uint8Array,
  contentType: AllowedImageType,
): boolean {
  if (contentType === "image/jpeg") {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }

  if (contentType === "image/png") {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];

    return signature.every(
      (value, index) => bytes[index] === value,
    );
  }

  if (contentType === "image/webp") {
    const header = new TextDecoder("ascii").decode(
      bytes.slice(0, 12),
    );

    return (
      header.startsWith("RIFF") &&
      header.slice(8, 12) === "WEBP"
    );
  }

  return false;
}

/**
 * Generates the same SHA-256 token hash as submit-enquiry.
 */
async function hashUploadToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hasValidCredentials(
  enquiryId: FormDataEntryValue | null,
  uploadToken: FormDataEntryValue | null,
): enquiryId is string {
  return (
    typeof enquiryId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(enquiryId) &&
    typeof uploadToken === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(uploadToken)
  );
}

function isReferenceType(
  value: FormDataEntryValue | null,
): value is ReferenceType {
  return value === "pet" || value === "background";
}

function getFileExtension(
  contentType: AllowedImageType,
): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
  }
}

export default {
  fetch: withSupabase(
    { auth: "publishable" },
    async (request, ctx) => {
      if (request.method !== "POST") {
        return jsonResponse(
          { success: false, message: "Method not allowed." },
          405,
        );
      }

      const contentType =
        request.headers.get("content-type") ?? "";

      if (
        !contentType.toLowerCase().startsWith(
          "multipart/form-data",
        )
      ) {
        return jsonResponse(
          {
            success: false,
            message: "Please submit an image using multipart/form-data.",
          },
          415,
        );
      }

      const contentLength = Number(
        request.headers.get("content-length") ?? "0",
      );

      if (contentLength > MAX_REQUEST_BYTES) {
        return jsonResponse(
          {
            success: false,
            message: "The upload is too large.",
          },
          413,
        );
      }

      let formData: FormData;

      try {
        formData = await request.formData();
      } catch {
        return jsonResponse(
          {
            success: false,
            message: "Could not read the uploaded file.",
          },
          400,
        );
      }

      const enquiryId = formData.get("enquiryId");
      const uploadToken = formData.get("uploadToken");
      const referenceType = formData.get("referenceType");

      if (!hasValidCredentials(enquiryId, uploadToken)) {
        return jsonResponse(
          {
            success: false,
            code: "INVALID_UPLOAD_CREDENTIALS",
            message: "Upload permission is invalid or has expired.",
          },
          403,
        );
      }

      if (!isReferenceType(referenceType)) {
        return jsonResponse(
          {
            success: false,
            message: "Choose a pet or background photograph.",
          },
          422,
        );
      }

      const file = formData.get("file");

      if (!(file instanceof File)) {
        return jsonResponse(
          {
            success: false,
            message: "Please select a photograph.",
          },
          422,
        );
      }

      if (file.size === 0 || file.size > MAX_FILE_BYTES) {
        return jsonResponse(
          {
            success: false,
            message: "Photographs must be smaller than 15 MB.",
          },
          422,
        );
      }

      if (
        !ALLOWED_IMAGE_TYPES.some(
          (type) => type === file.type,
        )
      ) {
        return jsonResponse(
          {
            success: false,
            message: "Please use a JPG, PNG or WebP photograph.",
          },
          422,
        );
      }

      const bytes = new Uint8Array(
        await file.slice(0, 16).arrayBuffer(),
      );

      if (
        !matchesImageSignature(
          bytes,
          file.type as AllowedImageType,
        )
      ) {
        return jsonResponse(
          {
            success: false,
            message: "The file is not a valid supported image format.",
          },
          422,
        );
      }

      const tokenHash = await hashUploadToken(uploadToken);

      const { data: enquiry, error: verificationError } =
        await ctx.supabaseAdmin
          .from("portrait_enquiries")
          .select("id")
          .eq("id", enquiryId)
          .eq("upload_token_hash", tokenHash)
          .gt("upload_expires_at", new Date().toISOString())
          .maybeSingle();

      if (verificationError) {
        return jsonResponse(
          {
            success: false,
            message: "We couldn't verify your upload.",
          },
          500,
        );
      }

      if (!enquiry) {
        return jsonResponse(
          {
            success: false,
            code: "INVALID_UPLOAD_CREDENTIALS",
            message: "Upload permission is invalid or has expired.",
          },
          403,
        );
      }

      // Reserve a slot before saving the photograph.
      const { data: uploadCount, error: reservationError } =
        await ctx.supabaseAdmin.rpc(
          "reserve_reference_upload_slot",
          {
            p_enquiry_id: enquiryId,
            p_token_hash: tokenHash,
          },
        );

      if (reservationError) {
        return jsonResponse(
          {
            success: false,
            message: "We couldn't prepare the photograph upload.",
          },
          500,
        );
      }

      if (uploadCount === null) {
        return jsonResponse(
          {
            success: false,
            code: "UPLOAD_LIMIT_REACHED",
            message: "No upload slots are available for this enquiry.",
          },
          409,
        );
      }

      const extension = getFileExtension(
        file.type as AllowedImageType,
      );

      const filePath =
        `${enquiryId}/${crypto.randomUUID()}.${extension}`;

      // Save the actual image in private Storage.
      const { error: storageError } = await ctx.supabaseAdmin
        .storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (storageError) {
        const { error: releaseError } =
          await ctx.supabaseAdmin.rpc(
            "release_reference_upload_slot",
            { p_enquiry_id: enquiryId },
          );

        return jsonResponse(
          {
            success: false,
            code: releaseError
              ? "UPLOAD_RECOVERY_NEEDED"
              : "UPLOAD_FAILED",
            message: "The photograph could not be saved.",
          },
          500,
        );
      }

      // Save information ABOUT the photograph in PostgreSQL.
      const { data: reference, error: recordError } =
        await ctx.supabaseAdmin
          .from("portrait_reference_files")
          .insert({
            enquiry_id: enquiryId,
            storage_path: filePath,
            reference_type: referenceType,
            file_size: file.size,
          })
          .select("id")
          .single();

      if (recordError || !reference?.id) {
        // Remove the file if its database record failed.
        const { error: removeError } = await ctx.supabaseAdmin
          .storage
          .from(BUCKET_NAME)
          .remove([filePath]);

        if (removeError) {
          // Keep the reserved slot until we can reconcile
          // the uncertain state of the stored photograph.
          return jsonResponse(
            {
              success: false,
              code: "UPLOAD_RECOVERY_NEEDED",
              message:
                "We couldn't complete the upload. Please contact us.",
            },
            500,
          );
        }

        const { error: releaseError } =
          await ctx.supabaseAdmin.rpc(
            "release_reference_upload_slot",
            { p_enquiry_id: enquiryId },
          );

        return jsonResponse(
          {
            success: false,
            code: releaseError
              ? "UPLOAD_RECOVERY_NEEDED"
              : "UPLOAD_FAILED",
            message:
              "The photograph could not be recorded. Please try again.",
          },
          500,
        );
      }

      return jsonResponse(
        {
          success: true,
          validated: true,
          authorised: true,
          uploaded: true,
          enquiryId,
          referenceId: reference.id,
          referenceType,
          filePath,
          fileSize: file.size,
          uploadCount,
          message: "Photograph saved and recorded successfully.",
        },
        201,
      );
    },
  ),
};
