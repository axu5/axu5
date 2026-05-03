"use client";

import { useEffect, useEffectEvent, useState } from "react";

const IMAGE_EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

const sanitizeBaseName = (value: string) => {
  const withoutExtension = value.trim().replace(/\.[^.]+$/, "");

  return withoutExtension
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

const getFileExtension = (type: string) => {
  if (IMAGE_EXTENSION_BY_TYPE[type]) {
    return IMAGE_EXTENSION_BY_TYPE[type];
  }

  const subtype = type.split("/")[1]?.split("+")[0];
  return subtype || "png";
};

const buildFileName = (requestedName: string, type: string) => {
  const baseName = sanitizeBaseName(requestedName);
  return `${baseName}.${getFileExtension(type)}`;
};

const getClipboardImageFromPaste = (
  clipboardData: DataTransfer | null,
) => {
  if (!clipboardData) {
    return null;
  }

  for (const item of Array.from(clipboardData.items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) {
      continue;
    }

    const file = item.getAsFile();

    if (file) {
      return {
        blob: file,
        type: file.type || item.type,
      };
    }
  }

  return null;
};

const getClipboardImageFromBrowser = async () => {
  if (!window.isSecureContext || !navigator.clipboard?.read) {
    throw new Error(
      "Clipboard image reading is only available in supported browsers over HTTPS or localhost.",
    );
  }

  const clipboardItems = await navigator.clipboard.read();

  for (const clipboardItem of clipboardItems) {
    const imageType = clipboardItem.types.find(type =>
      type.startsWith("image/"),
    );

    if (imageType) {
      return {
        blob: await clipboardItem.getType(imageType),
        type: imageType,
      };
    }
  }

  return null;
};

export default function ClipToDownload({ ts }: { ts: string }) {
  const [fileName, setFileName] = useState("");
  const [isCheckingClipboard, setIsCheckingClipboard] =
    useState(false);

  const downloadBlob = (blob: Blob, type: string) => {
    const nextFileName = buildFileName(
      fileName,
      type || blob.type || "image/png",
    );
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = nextFileName;
    link.click();

    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1_000);
  };

  const handleClipboardRead = async () => {
    setIsCheckingClipboard(true);

    try {
      const clipboardImage = await getClipboardImageFromBrowser();

      if (!clipboardImage) {
        return;
      }

      downloadBlob(clipboardImage.blob, clipboardImage.type);
    } catch (error) {
      const nextMessage =
        error instanceof DOMException &&
        error.name === "NotAllowedError"
          ? "Clipboard access was denied by the browser."
          : error instanceof Error
            ? error.message
            : "Clipboard access failed.";
    } finally {
      setIsCheckingClipboard(false);
    }
  };

  const handlePaste = useEffectEvent((event: ClipboardEvent) => {
    const clipboardImage = getClipboardImageFromPaste(
      event.clipboardData,
    );

    if (!clipboardImage) {
      return;
    }

    event.preventDefault();
    downloadBlob(clipboardImage.blob, clipboardImage.type);
  });

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      handlePaste(event);
    };

    window.addEventListener("paste", onPaste);

    return () => {
      window.removeEventListener("paste", onPaste);
    };
  }, []);

  return (
    <main className='flex flex-col items-center pt-12'>
      <section className='w-full max-w-xl'>
        <div className='space-y-3'>
          <h1 className='text-3xl font-semibold text-black'>
            Clipboard to download
          </h1>
          <span className='text-sm leading-6 text-black/65'>
            Tip: Press Ctrl+V or Cmd+V anywhere on this page to
            download an image instantly.
          </span>
        </div>

        <div className='mt-2 space-y-4'>
          <label className='block space-y-2'>
            <span className='text-sm font-medium text-black/75'>
              File name (optional)
            </span>
            <input
              type='text'
              value={fileName}
              onChange={event => setFileName(event.target.value)}
              placeholder={ts}
              className='w-full rounded-lg border border-black/10 px-3 py-2 outline-none transition focus:border-black/35'
            />
          </label>

          <button
            type='button'
            onClick={() => void handleClipboardRead()}
            disabled={isCheckingClipboard}
            className='w-full rounded-lg bg-black px-3 py-2 text-sm text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:bg-black/45'>
            {isCheckingClipboard
              ? "Downloading..."
              : "Download image"}
          </button>
        </div>
      </section>
    </main>
  );
}
