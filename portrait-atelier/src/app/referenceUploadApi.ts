
import type { EnquiryResponse } from "./enquiryApi";

export type ReferenceType = "pet" | "background";

export interface UploadReferenceResponse {
  referenceId: string;
  referenceType: ReferenceType;
  filePath: string;
  fileSize: number;
}

/**
 * Uploads a photograph to the private Supabase Storage bucket
 * through our authenticated enquiry upload endpoint.
 */
export async function uploadReference(
    file: File,
    referenceType: ReferenceType,
    enquiry: EnquiryResponse,
    uploadId: string,
  ): Promise<UploadReferenceResponse> {
  const formData = new FormData();

  formData.append("enquiryId", enquiry.enquiryId);
  formData.append("uploadToken", enquiry.uploadToken);
  formData.append("referenceType", referenceType);
  formData.append("uploadId", uploadId);
  formData.append("file", file);

  const response = await fetch(
    "http://127.0.0.1:54321/functions/v1/upload-reference",
    {
      method: "POST",
      headers: {
        apikey: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
      },
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error(
      "The photograph could not be uploaded. Please try again.",
    );
  }

  const result: unknown = await response.json();

  if (
    typeof result !== "object" ||
    result === null ||
    !("uploaded" in result) ||
    result.uploaded !== true ||
    !("referenceId" in result) ||
    typeof result.referenceId !== "string" ||
    !("referenceType" in result) ||
    result.referenceType !== referenceType ||
    !("filePath" in result) ||
    typeof result.filePath !== "string" ||
    !("fileSize" in result) ||
    typeof result.fileSize !== "number"
  ) {
    throw new Error(
      "The upload service returned an unexpected response.",
    );
  }

  return {
    referenceId: result.referenceId,
    referenceType,
    filePath: result.filePath,
    fileSize: result.fileSize,
  };
}
