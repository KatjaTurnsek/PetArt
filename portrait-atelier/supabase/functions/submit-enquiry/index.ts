
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

/**
 * Portrait Atelier — enquiry submission.
 * Validates enquiry details, creates an upload token
 * and saves the enquiry to the database.
 */

const MAX_BODY_BYTES = 32 * 1024;
const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_MESSAGE_LENGTH = 3000;
const MAX_CHOICES_BYTES = 16 * 1024;

const UPLOAD_TOKEN_BYTES = 32;
const UPLOAD_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;

interface EnquiryPayload {
  customerName: string;
  customerEmail: string;
  customerMessage?: string;
  portraitChoices: Record<string, unknown>;
}

type FieldErrors = Record<string, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value);
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function validateEnquiry(value: unknown): {
  payload: EnquiryPayload | null;
  errors: FieldErrors;
} {
  if (!isRecord(value)) {
    return {
      payload: null,
      errors: { form: "Please provide an enquiry object." },
    };
  }

  const errors: FieldErrors = {};

  const name = typeof value.customerName === "string"
    ? value.customerName.trim()
    : "";

  const email = typeof value.customerEmail === "string"
    ? value.customerEmail.trim()
    : "";

  const message = typeof value.customerMessage === "string"
    ? value.customerMessage.trim()
    : "";

  if (name.length < 2 || name.length > MAX_NAME_LENGTH) {
    errors.customerName = "Enter your name (2–120 characters).";
  }

  if (
    email.length > MAX_EMAIL_LENGTH ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    errors.customerEmail = "Enter a valid email address.";
  }

  if (
    value.customerMessage !== undefined &&
    typeof value.customerMessage !== "string"
  ) {
    errors.customerMessage = "Your message must be text.";
  } else if (message.length > MAX_MESSAGE_LENGTH) {
    errors.customerMessage =
      "Your message is too long (maximum 3,000 characters).";
  }

  if (!isRecord(value.portraitChoices)) {
    errors.portraitChoices = "Portrait choices are required.";
  } else if (
    new TextEncoder()
      .encode(JSON.stringify(value.portraitChoices))
      .length > MAX_CHOICES_BYTES
  ) {
    errors.portraitChoices = "Portrait choices are too large.";
  }

  if (Object.keys(errors).length > 0) {
    return { payload: null, errors };
  }

  return {
    payload: {
      customerName: name,
      customerEmail: email,
      customerMessage: message,
      portraitChoices: value.portraitChoices as Record<string, unknown>,
    },
    errors: {},
  };
}

/**
 * Generates a cryptographically secure upload token.
 * The original token is returned to the customer.
 */
function createUploadToken(): string {
  const bytes = crypto.getRandomValues(
    new Uint8Array(UPLOAD_TOKEN_BYTES),
  );

  const base64 = btoa(String.fromCharCode(...bytes));

  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Creates a SHA-256 hash for database storage.
 * The original token is never saved to the database.
 */
async function hashUploadToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default {
  fetch: withSupabase(
    { auth: "publishable" },
    async (request, ctx) => {
      if (request.method !== "POST") {
        return jsonResponse(
          {
            success: false,
            code: "METHOD_NOT_ALLOWED",
            message: "Use POST.",
          },
          405,
        );
      }

      if (
        !request.headers.get("content-type")
          ?.toLowerCase()
          .includes("application/json")
      ) {
        return jsonResponse(
          {
            success: false,
            code: "UNSUPPORTED_MEDIA_TYPE",
            message: "Send a JSON enquiry.",
          },
          415,
        );
      }

      const declaredLength = Number(
        request.headers.get("content-length") ?? "0",
      );

      if (declaredLength > MAX_BODY_BYTES) {
        return jsonResponse(
          {
            success: false,
            code: "PAYLOAD_TOO_LARGE",
            message: "Enquiry data is too large.",
          },
          413,
        );
      }

      let input: unknown;

      try {
        const raw = await request.text();

        if (
          new TextEncoder().encode(raw).length > MAX_BODY_BYTES
        ) {
          return jsonResponse(
            {
              success: false,
              code: "PAYLOAD_TOO_LARGE",
              message: "Enquiry data is too large.",
            },
            413,
          );
        }

        input = JSON.parse(raw) as unknown;
      } catch {
        return jsonResponse(
          {
            success: false,
            code: "INVALID_JSON",
            message: "The enquiry is not valid JSON.",
          },
          400,
        );
      }

      const { payload, errors } = validateEnquiry(input);

      if (!payload) {
        return jsonResponse(
          {
            success: false,
            code: "VALIDATION_FAILED",
            message: "Please check your details.",
            errors,
          },
          422,
        );
      }

      try {
        const uploadToken = createUploadToken();
        const uploadTokenHash = await hashUploadToken(
          uploadToken,
        );

        const uploadExpiresAt = new Date(
          Date.now() + UPLOAD_TOKEN_LIFETIME_MS,
        ).toISOString();

        // Database access is server-side only.
        // No public insert permissions are required.
        const { data, error } = await ctx.supabaseAdmin
          .from("portrait_enquiries")
          .insert({
            customer_name: payload.customerName,
            customer_email: payload.customerEmail,
            customer_message: payload.customerMessage ?? "",
            portrait_choices: payload.portraitChoices,
            upload_token_hash: uploadTokenHash,
            upload_expires_at: uploadExpiresAt,
          })
          .select("id")
          .single();

        if (error || !data?.id) {
          return jsonResponse(
            {
              success: false,
              saved: false,
              code: "SAVE_FAILED",
              message:
                "The enquiry could not be saved. Please try again later.",
            },
            500,
          );
        }

        return jsonResponse(
          {
            success: true,
            validated: true,
            saved: true,
            enquiryId: data.id,
            uploadToken,
            uploadExpiresAt,
            message: "Test enquiry saved successfully.",
          },
          201,
        );
      } catch {
        return jsonResponse(
          {
            success: false,
            saved: false,
            code: "SAVE_FAILED",
            message:
              "The enquiry could not be saved. Please try again later.",
          },
          500,
        );
      }
    },
  ),
};
