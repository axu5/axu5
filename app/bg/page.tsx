"use client";

import {
  alphamask,
  removeBackground,
  removeForeground,
  type Config as ImglyConfig,
} from "@imgly/background-removal";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { cn } from "@/components/cn";
import {
  SelectionGroup,
  SelectionTarget,
} from "@/components/selection-group";
import { Check, Download, Loader2 } from "lucide-react";
import { useLocalStorage } from "usehooks-ts";

type Config = {
  device: "cpu" | "gpu";
  model: "isnet" | "isnet_fp16" | "isnet_quint8";
  output: {
    format: "image/png" | "image/jpeg" | "image/webp";
    quality: number;
    type: "foreground" | "background" | "mask";
  };
};

const DEFAULT_CONFIG: Config = {
  device: "gpu",
  model: "isnet_fp16",
  output: {
    format: "image/png",
    quality: 0.8,
    type: "foreground",
  },
};

const DEVICE_OPTIONS = [
  { value: "cpu", label: "CPU" },
  { value: "gpu", label: "GPU" },
] as const;

const MODEL_OPTIONS = [
  { value: "isnet", label: "isnet" },
  { value: "isnet_fp16", label: "isnet_fp16" },
  { value: "isnet_quint8", label: "isnet_quint8" },
] as const;

const FORMAT_OPTIONS = [
  { value: "image/png", label: "PNG" },
  { value: "image/jpeg", label: "JPEG" },
  { value: "image/webp", label: "WEBP" },
] as const;

const TYPE_OPTIONS = [
  { value: "foreground", label: "Foreground" },
  { value: "background", label: "Background" },
  { value: "mask", label: "Mask" },
] as const;

const QUALITY_OPTIONS = [
  { value: "0.5", label: "half" },
  { value: "0.7", label: "0.7" },
  { value: "0.8", label: "0.8" },
  { value: "0.9", label: "0.9" },
  { value: "1.0", label: "full" },
] as const;

type QualityOptionValue = (typeof QUALITY_OPTIONS)[number]["value"];

type ProcessedImage = {
  sourceUrl: string;
  fileName: string;
  progress: number;
  status: "processing" | "done" | "error";
  resultUrl: string | null;
};

export default function Bg() {
  const [imageBlobs, setImageBlobs] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [selectedImgs, setSelectedImgs] = useState<string[]>([]);
  const [processedImages, setProcessedImages] = useState<
    ProcessedImage[]
  >([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<
    string | null
  >(null);
  const [config, setConfig] = useLocalStorage<Config>(
    "bg-config",
    DEFAULT_CONFIG,
    { initializeWithValue: false },
  );
  const processRequestId = useRef(0);
  const processedImagesRef = useRef<ProcessedImage[]>([]);

  const revokeUrls = (urls: string[]) => {
    urls.forEach(url => URL.revokeObjectURL(url));
  };

  const revokeProcessedImageUrls = (images: ProcessedImage[]) => {
    images.forEach(image => {
      if (image.resultUrl) {
        URL.revokeObjectURL(image.resultUrl);
      }
    });
  };

  const resolveQualityValue = (
    quality: number,
  ): QualityOptionValue => {
    const normalizedQuality = quality.toFixed(
      1,
    ) as QualityOptionValue;

    return QUALITY_OPTIONS.some(
      option => option.value === normalizedQuality,
    )
      ? normalizedQuality
      : "0.8";
  };

  const clearProcessedState = () => {
    processRequestId.current += 1;
    setProcessedImages(existingImages => {
      revokeProcessedImageUrls(existingImages);
      return [];
    });
    setIsProcessing(false);
    setProcessingError(null);
  };

  const updateProcessedImage = (
    sourceUrl: string,
    updater: (image: ProcessedImage) => ProcessedImage,
  ) => {
    setProcessedImages(currentImages =>
      currentImages.map(image =>
        image.sourceUrl === sourceUrl ? updater(image) : image,
      ),
    );
  };

  const mapProgressToPercent = (
    key: string,
    current: number,
    total: number,
  ) => {
    const ratio = total > 0 ? current / total : 0;
    const scaled = (start: number, end: number) =>
      Math.round(start + (end - start) * ratio);

    if (key.startsWith("fetch:")) {
      return scaled(0, 35);
    }

    if (key === "compute:decode") {
      return scaled(35, 45);
    }

    if (key === "compute:inference") {
      return scaled(45, 80);
    }

    if (key === "compute:mask") {
      return scaled(80, 90);
    }

    if (key === "compute:encode") {
      return scaled(90, 100);
    }

    return Math.round(ratio * 100);
  };

  const getDownloadFileName = (fileName: string) => {
    const baseName = fileName.replace(/\.[^.]+$/, "");
    const extension =
      config.output.format === "image/jpeg"
        ? "jpg"
        : config.output.format === "image/webp"
          ? "webp"
          : "png";

    return `${baseName}-${config.output.type}.${extension}`;
  };

  const handleDownloadImage = (image: ProcessedImage) => {
    if (!image.resultUrl) {
      return;
    }

    const link = document.createElement("a");
    link.href = image.resultUrl;
    link.download = getDownloadFileName(image.fileName);
    link.click();
  };

  useEffect(() => {
    processedImagesRef.current = processedImages;
  }, [processedImages]);

  const updateConfig = (updater: (current: Config) => Config) => {
    clearProcessedState();
    setConfig(updater);
  };

  const handleImageUpload = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const { files } = event.target;

    revokeUrls(previewUrls);
    clearProcessedState();

    if (!files) {
      setImageBlobs([]);
      setPreviewUrls([]);
      setSelectedImgs([]);
      return;
    }

    const nextBlobs = Array.from(files);
    const nextUrls = nextBlobs.map(blob => URL.createObjectURL(blob));

    setImageBlobs(nextBlobs);
    setPreviewUrls(nextUrls);
    setSelectedImgs(nextUrls);
  };

  const handleProcessImages = async () => {
    if (imageBlobs.length === 0 || selectedImgs.length === 0) {
      return;
    }

    const selectedImages = previewUrls.flatMap((url, index) =>
      selectedImgs.includes(url)
        ? [
            {
              sourceUrl: url,
              file: imageBlobs[index],
            },
          ]
        : [],
    );

    if (selectedImages.length === 0) {
      return;
    }

    const requestId = processRequestId.current + 1;
    processRequestId.current = requestId;

    setIsProcessing(true);
    setProcessingError(null);
    setProcessedImages(existingImages => {
      revokeProcessedImageUrls(existingImages);
      return selectedImages.map(({ sourceUrl, file }) => ({
        sourceUrl,
        fileName: file.name,
        progress: 0,
        status: "processing",
        resultUrl: null,
      }));
    });

    const runtimeConfig: ImglyConfig = {
      device: config.device,
      debug: process.env.NODE_ENV === "development",
      model: config.model,
      proxyToWorker: true,
      output: {
        format: config.output.format,
        quality: config.output.quality,
      },
    };

    const processor =
      config.output.type === "background"
        ? removeForeground
        : config.output.type === "mask"
          ? alphamask
          : removeBackground;

    try {
      const failedResults: unknown[] = [];

      for (const { sourceUrl, file } of selectedImages) {
        try {
          const processedBlob = await processor(file, {
            ...runtimeConfig,
            progress: (key, current, total) => {
              if (processRequestId.current !== requestId) {
                return;
              }

              updateProcessedImage(sourceUrl, image => ({
                ...image,
                progress: Math.max(
                  image.progress,
                  mapProgressToPercent(key, current, total),
                ),
              }));
            },
          });

          if (processRequestId.current !== requestId) {
            return;
          }

          const resultUrl = URL.createObjectURL(processedBlob);

          updateProcessedImage(sourceUrl, image => {
            if (image.resultUrl) {
              URL.revokeObjectURL(image.resultUrl);
            }

            return {
              ...image,
              progress: 100,
              status: "done",
              resultUrl,
            };
          });
        } catch (error) {
          if (processRequestId.current !== requestId) {
            return;
          }

          updateProcessedImage(sourceUrl, image => ({
            ...image,
            status: "error",
            progress: 0,
            resultUrl: null,
          }));

          failedResults.push(error);
        }
      }

      if (processRequestId.current !== requestId) {
        return;
      }

      if (failedResults.length > 0) {
        setProcessingError(
          failedResults.length === 1
            ? failedResults[0] instanceof Error
              ? failedResults[0].message
              : "Failed to process one image."
            : "Failed to process one or more images.",
        );
      }
    } finally {
      if (processRequestId.current === requestId) {
        setIsProcessing(false);
      }
    }
  };

  useEffect(
    () => () => {
      revokeUrls(previewUrls);
    },
    [previewUrls],
  );

  useEffect(
    () => () => {
      revokeProcessedImageUrls(processedImagesRef.current);
    },
    [],
  );

  const selectionButtonClass =
    (className?: string) => (selected: boolean) =>
      cn(
        "rounded-lg border px-3 py-2 text-sm transition-colors",
        className,
        {
          "border-blue-600/70 bg-blue-600/5": selected,
        },
      );

  return (
    <main className='mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10'>
      <div className='space-y-2'>
        <h1 className='text-2xl font-semibold'>
          Axu&apos;s background remover
        </h1>
        <p className='text-sm text-black/70'>
          Upload one or more images. Your data doesn&apos;t leave your
          device.
        </p>
      </div>

      <div className='space-y-4'>
        <label
          htmlFor='images'
          className='block text-sm font-medium tracking-wide text-black/85'>
          Select images
        </label>

        {previewUrls.length > 0 && (
          <section
            className='space-y-2'
            aria-label='Uploaded image previews'>
            <p className='text-sm text-black/70'>
              {imageBlobs.length} image
              {imageBlobs.length === 1 ? "" : "s"} selected
            </p>

            <SelectionGroup<string>
              multiple
              value={selectedImgs}
              onChange={nextSelection => {
                clearProcessedState();
                setSelectedImgs(nextSelection);
              }}
              ariaLabel='Uploaded image previews'
              className='flex flex-wrap gap-3'>
              {previewUrls.map((url, index) => (
                <SelectionTarget
                  key={url}
                  value={url}
                  ariaLabel={`Uploaded image preview ${index + 1}`}
                  className={selectionButtonClass(
                    "p-0 rounded overflow-hidden relative",
                  )}>
                  {(selected: boolean) => (
                    <>
                      <img
                        src={url}
                        alt={`Uploaded image preview ${index + 1}`}
                        className='h-20 w-full object-cover'
                      />
                      {selected && (
                        <Check className='absolute right-2 top-2 h-4 w-4 rounded-full bg-blue-600/60 p-1 transition-colors' />
                      )}
                    </>
                  )}
                </SelectionTarget>
              ))}
            </SelectionGroup>
          </section>
        )}
        <input
          id='images'
          name='images'
          type='file'
          accept='image/*'
          multiple
          onChange={handleImageUpload}
          className='block w-full rounded-lg text-sm file:mr-4 file:rounded-md file:border-0 file:bg-black file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-black/85'
        />

        <label className='block text-sm font-medium tracking-wide text-black/85'>
          Device
        </label>
        <SelectionGroup<Config["device"]>
          value={config.device}
          onChange={value =>
            updateConfig(current => ({
              ...current,
              device: value,
            }))
          }
          className='flex flex-wrap gap-2'>
          {DEVICE_OPTIONS.map(option => (
            <SelectionTarget
              key={option.value}
              value={option.value}
              className={selectionButtonClass()}>
              {option.label}
            </SelectionTarget>
          ))}
        </SelectionGroup>

        <label className='block text-sm font-medium tracking-wide text-black/85'>
          Model
        </label>
        <SelectionGroup<Config["model"]>
          value={config.model}
          onChange={value =>
            updateConfig(current => ({
              ...current,
              model: value,
            }))
          }
          className='flex flex-wrap gap-2'>
          {MODEL_OPTIONS.map(option => (
            <SelectionTarget
              key={option.value}
              value={option.value}
              className={selectionButtonClass()}>
              {option.label}
            </SelectionTarget>
          ))}
        </SelectionGroup>

        <label className='block text-sm font-medium tracking-wide text-black/85'>
          Output format
        </label>
        <SelectionGroup<Config["output"]["format"]>
          value={config.output.format}
          onChange={value =>
            updateConfig(current => ({
              ...current,
              output: {
                ...current.output,
                format: value,
              },
            }))
          }
          className='flex flex-wrap gap-2'>
          {FORMAT_OPTIONS.map(option => (
            <SelectionTarget
              key={option.value}
              value={option.value}
              className={selectionButtonClass()}>
              {option.label}
            </SelectionTarget>
          ))}
        </SelectionGroup>

        <label className='block text-sm font-medium tracking-wide text-black/85'>
          Output quality
        </label>
        <SelectionGroup<QualityOptionValue>
          value={resolveQualityValue(config.output.quality)}
          onChange={value =>
            updateConfig(current => ({
              ...current,
              output: {
                ...current.output,
                quality: Number(value),
              },
            }))
          }
          className='flex flex-wrap gap-2'>
          {QUALITY_OPTIONS.map(option => (
            <SelectionTarget
              key={option.value}
              value={option.value}
              className={selectionButtonClass()}>
              {option.label}
            </SelectionTarget>
          ))}
        </SelectionGroup>

        <label className='block text-sm font-medium tracking-wide text-black/85'>
          Output type
        </label>
        <SelectionGroup<Config["output"]["type"]>
          value={config.output.type}
          onChange={value =>
            updateConfig(current => ({
              ...current,
              output: {
                ...current.output,
                type: value,
              },
            }))
          }
          className='flex flex-wrap gap-2'>
          {TYPE_OPTIONS.map(option => (
            <SelectionTarget
              key={option.value}
              value={option.value}
              className={selectionButtonClass()}>
              {option.label}
            </SelectionTarget>
          ))}
        </SelectionGroup>

        <button
          type='button'
          onClick={() => void handleProcessImages()}
          disabled={isProcessing || selectedImgs.length === 0}
          className={cn(
            "w-full rounded-lg bg-black px-3 py-2 text-white text-sm hover:bg-black/85 flex flex-row items-center gap-x-2",
            {
              "bg-black/85":
                isProcessing || selectedImgs.length === 0,
            },
          )}>
          {isProcessing ? (
            <>
              <Loader2 className='animate-spin w-4 h-4' />
              Processing...
            </>
          ) : (
            "Remove background"
          )}
        </button>

        {isProcessing && (
          <p className='text-sm text-black/70'>
            Processing selected images...
          </p>
        )}

        {processingError && (
          <p className='text-sm text-black/70'>{processingError}</p>
        )}

        {processedImages.length > 0 && (
          <section
            className='space-y-2'
            aria-label='Processed image previews'>
            <p className='text-sm text-black/70'>
              Processed previews
            </p>

            <ul className='flex flex-wrap gap-3'>
              {processedImages.map((image, index) => (
                <li
                  key={image.sourceUrl}
                  className='group overflow-hidden rounded-md border transition-colors relative'>
                  {image.resultUrl ? (
                    <>
                      <img
                        src={image.resultUrl}
                        alt={`Processed image preview ${index + 1}`}
                        className='h-20 w-full rounded object-cover bg-black'
                      />
                      <button
                        type='button'
                        onClick={() => handleDownloadImage(image)}
                        className='absolute right-2 top-2 rounded-full bg-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100'
                        aria-label={`Download processed image ${index + 1}`}>
                        <Download className='h-4 w-4' />
                      </button>
                    </>
                  ) : image.status === "error" ? (
                    <div className='h-20 aspect-square w-full rounded bg-black/5 flex items-center justify-center px-2 text-center text-xs text-black/60'>
                      Failed
                    </div>
                  ) : (
                    <div className='h-20 aspect-square w-full rounded animate-pulse bg-black/5 flex items-center justify-center text-sm text-black/60'>
                      {image.progress}%
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
