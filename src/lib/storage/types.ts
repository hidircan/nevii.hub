export type UploadResult = { storageKey: string; sizeBytes: number };

export type StorageAdapter = {
  uploadAnnouncementAttachment: (
    tenantId: string,
    buffer: Buffer,
    fileName: string,
    mimeType: string
  ) => Promise<UploadResult>;
  deleteAnnouncementAttachment: (storageKey: string) => Promise<void>;
  downloadAnnouncementAttachment: (storageKey: string) => Promise<Buffer>;
};
