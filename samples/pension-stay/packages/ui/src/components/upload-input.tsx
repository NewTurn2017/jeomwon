"use client";

import { type InputHTMLAttributes, useRef, useState } from "react";

export type ConvexUploadResponse<TStorageId extends string = string> = {
  storageId: TStorageId;
};

export function UploadInput<TStorageId extends string = string>({
  generateUploadUrl,
  onUploadComplete,
  disabled,
  ...props
}: {
  generateUploadUrl: () => Promise<string>;
  onUploadComplete: (
    uploaded: ConvexUploadResponse<TStorageId>[],
  ) => Promise<void> | void;
} & Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "accept" | "className" | "disabled" | "id" | "required" | "tabIndex" | "type"
>) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const uploadFile = async (file: File) => {
    const uploadUrl = await generateUploadUrl();
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });

    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }

    return (await response.json()) as ConvexUploadResponse<TStorageId>;
  };

  return (
    <input
      ref={fileInputRef}
      type="file"
      disabled={disabled || isUploading}
      onChange={async (event) => {
        const files = Array.from(event.currentTarget.files ?? []);
        if (files.length === 0) {
          return;
        }

        try {
          setIsUploading(true);
          await onUploadComplete(await Promise.all(files.map(uploadFile)));
        } finally {
          setIsUploading(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
      }}
      {...props}
    />
  );
}
