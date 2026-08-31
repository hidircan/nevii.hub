import { describe, it, expect } from "vitest";
import {
  PHOTO_RESIZE_MAX_DIMENSION,
  PHOTO_JPEG_COMPRESS_QUALITY,
  PHOTO_UPLOAD_MIME_TYPE,
  buildPhotoUploadRequestBody,
} from "../photo-upload";

describe("buildPhotoUploadRequestBody", () => {
  it("her çağrıda TAZE base64 verisiyle JPEG istek gövdesi üretir (stale referans yok)", () => {
    const first = buildPhotoUploadRequestBody("aaa");
    const second = buildPhotoUploadRequestBody("bbb");
    expect(first).toEqual({ fileMimeType: "image/jpeg", fileData: "aaa" });
    expect(second).toEqual({ fileMimeType: "image/jpeg", fileData: "bbb" });
    expect(first.fileData).not.toBe(second.fileData);
  });

  it("fileMimeType her zaman PHOTO_UPLOAD_MIME_TYPE ile eşleşir", () => {
    expect(buildPhotoUploadRequestBody("x").fileMimeType).toBe(PHOTO_UPLOAD_MIME_TYPE);
  });
});

describe("yeniden boyutlandırma sabitleri", () => {
  it("en uzun kenar 640px, kalite ~0.8 — orijinal iPhone fotoğrafları gereksiz büyük olmasın diye", () => {
    expect(PHOTO_RESIZE_MAX_DIMENSION).toBe(640);
    expect(PHOTO_JPEG_COMPRESS_QUALITY).toBe(0.8);
  });
});
