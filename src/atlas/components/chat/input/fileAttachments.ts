import type { Attachment } from "../types";

export function fileToAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve({
        name: file.name,
        type: file.type.startsWith("image/") ? "image" : "file",
        data: reader.result as string,
        mimeType: file.type,
      });
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}
