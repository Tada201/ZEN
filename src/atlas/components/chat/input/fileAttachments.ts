import type { Attachment } from "../types";

export function fileToAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const isImage = file.type.startsWith("image/");
    const dataReader = new FileReader();

    dataReader.onloadend = () => {
      const dataUrl = dataReader.result as string;

      if (isImage) {
        resolve({
          name: file.name,
          type: "image",
          data: dataUrl,
          mimeType: file.type,
        });
      } else {
        // Read text content for non-image uploads so that it can be consumed by the backend
        const textReader = new FileReader();
        textReader.onloadend = () => {
          resolve({
            name: file.name,
            type: "file",
            data: dataUrl,
            mimeType: file.type,
            extractedText: textReader.result as string,
          });
        };
        textReader.onerror = () => reject(new Error(`Failed to read text content from: ${file.name}`));
        textReader.readAsText(file);
      }
    };

    dataReader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    dataReader.readAsDataURL(file);
  });
}
