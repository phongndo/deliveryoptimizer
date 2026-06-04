"use client";

import { useRef, useState } from "react";
import {
  OVERLAY_BACKDROP,
  OVERLAY_HEADER,
  OVERLAY_TITLE,
  OVERLAY_CLOSE_BTN,
  OVERLAY_FOOTER,
  OVERLAY_CANCEL_BTN,
  OVERLAY_PRIMARY_BTN,
  CSV_UPLOAD_OVERLAY_PANEL,
  CSV_UPLOAD_OVERLAY_INNER,
  CSV_UPLOAD_OVERLAY_CONTENT,
  CSV_UPLOAD_OVERLAY_TOP,
  CSV_UPLOAD_DROP_ZONE,
  CSV_UPLOAD_DROP_ZONE_ACTIVE,
  CSV_UPLOAD_DROP_ZONE_INNER,
  CSV_UPLOAD_DROP_ZONE_PROMPT,
  CSV_UPLOAD_DROP_ZONE_TEXT,
  CSV_UPLOAD_BROWSE_BTN,
  CSV_UPLOAD_DESCRIPTION,
  CSV_UPLOAD_FILE_CHIP,
  CSV_UPLOAD_FILE_CHIP_LEFT,
  CSV_UPLOAD_FILE_CHIP_FILENAME,
  CSV_UPLOAD_FILE_CHIP_RIGHT,
  CSV_UPLOAD_FILE_CHIP_SIZE,
  CSV_UPLOAD_FILE_CHIP_REMOVE,
  CSV_UPLOAD_SIZE_ERROR,
} from "@/app/edit/formStyles.v2";
import SpinnerIcon from "@/app/edit/components/shared/SpinnerIcon";

type CSVUploadOverlayProps = {
  onClose: () => void;
  onFileSelect: (file: File) => void;
  onInvalidFile?: () => void;
  initialFile?: File;
};

const MAX_CSV_BYTES = 10 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CSVUploadOverlay({
  onClose,
  onFileSelect,
  onInvalidFile,
  initialFile,
}: CSVUploadOverlayProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(
    initialFile && initialFile.size <= MAX_CSV_BYTES ? initialFile : null,
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileSizeError, setFileSizeError] = useState<string | null>(
    initialFile && initialFile.size > MAX_CSV_BYTES
      ? "Your file exceeds 10 MB. Please use a smaller file."
      : null,
  );

  function handleClose() {
    setIsUploading(false);
    onClose();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      onInvalidFile?.();
    } else if (file.size > MAX_CSV_BYTES) {
      setFileSizeError("Your file exceeds 10 MB. Please use a smaller file.");
      setSelectedFile(null);
    } else {
      setFileSizeError(null);
      setSelectedFile(file);
    }
    e.target.value = "";
  }

  function handleRemoveFile() {
    setSelectedFile(null);
    setFileSizeError(null);
  }

  function handleNext() {
    if (selectedFile) {
      setIsUploading(true);
      onFileSelect(selectedFile);
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0] ?? null;
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      onInvalidFile?.();
    } else if (file.size > MAX_CSV_BYTES) {
      setFileSizeError("Your file exceeds 10 MB. Please use a smaller file.");
      setSelectedFile(null);
    } else {
      setFileSizeError(null);
      setSelectedFile(file);
    }
  }

  return (
    <div className={OVERLAY_BACKDROP} onClick={handleClose}>
      <div
        className={CSV_UPLOAD_OVERLAY_PANEL}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-upload-title"
      >
        <div className={CSV_UPLOAD_OVERLAY_INNER}>
          <div className={CSV_UPLOAD_OVERLAY_CONTENT}>
            <div className={CSV_UPLOAD_OVERLAY_TOP}>
              {/* Header */}
              <div className={OVERLAY_HEADER}>
                <p id="csv-upload-title" className={OVERLAY_TITLE}>
                  Import from CSV
                </p>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close"
                  className={OVERLAY_CLOSE_BTN}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 4l16 16M20 4L4 20"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              {/* Drop zone */}
              <div
                className={
                  isDragOver
                    ? CSV_UPLOAD_DROP_ZONE_ACTIVE
                    : CSV_UPLOAD_DROP_ZONE
                }
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className={CSV_UPLOAD_DROP_ZONE_INNER}>
                  {isUploading ? (
                    <SpinnerIcon />
                  ) : (
                    <>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="40"
                        height="40"
                        viewBox="0 0 40 40"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M18.667 31.6112H21.4449V23.7083L24.6116 26.875L26.5557 24.9166L20.0003 18.4721L13.5003 24.9721L15.4587 26.9166L18.667 23.7083V31.6112ZM9.44491 36.6666C8.69491 36.6666 8.04435 36.3912 7.49324 35.8404C6.94241 35.2893 6.66699 34.6387 6.66699 33.8887V6.11123C6.66699 5.36123 6.94241 4.71068 7.49324 4.15956C8.04435 3.60873 8.69491 3.33331 9.44491 3.33331H23.917L33.3337 12.75V33.8887C33.3337 34.6387 33.0582 35.2893 32.5074 35.8404C31.9563 36.3912 31.3057 36.6666 30.5557 36.6666H9.44491ZM22.5282 14.0554V6.11123H9.44491V33.8887H30.5557V14.0554H22.5282Z"
                          fill="var(--edit-primary-icon)"
                        />
                      </svg>

                      <div className={CSV_UPLOAD_DROP_ZONE_PROMPT}>
                        <p className={CSV_UPLOAD_DROP_ZONE_TEXT}>
                          Drag and drop CSV files here, or
                        </p>
                        <button
                          type="button"
                          className={CSV_UPLOAD_BROWSE_BTN}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Browse files
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="hidden"
                  aria-hidden="true"
                />
              </div>

              {/* Description */}
              <p className={CSV_UPLOAD_DESCRIPTION}>
                Import delivery details from a CSV file. Maximum file size of 10
                MB.
              </p>
              {fileSizeError !== null && (
                <p
                  role="alert"
                  aria-live="assertive"
                  className={CSV_UPLOAD_SIZE_ERROR}
                >
                  {fileSizeError}
                </p>
              )}
            </div>

            {/* File chip — visible only when a file is selected and not uploading */}
            {selectedFile !== null && !isUploading && (
              <div className={CSV_UPLOAD_FILE_CHIP}>
                <div className={CSV_UPLOAD_FILE_CHIP_LEFT}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M11.4729 15.6843C10.4515 16.7056 9.22387 17.2163 7.79001 17.2163C6.35616 17.2163 5.12854 16.7056 4.10716 15.6843C3.08579 14.6629 2.5751 13.4353 2.5751 12.0014C2.5751 10.5675 3.08579 9.33993 4.10716 8.31856L9.55778 2.86794C10.2943 2.13137 11.1782 1.76309 12.2094 1.76309C13.2406 1.76309 14.1245 2.13137 14.8611 2.86794C15.5976 3.60451 15.9659 4.48839 15.9659 5.51959C15.9659 6.55079 15.5976 7.43467 14.8611 8.17124L9.70509 13.3272C9.25333 13.779 8.71318 14.0049 8.08464 14.0049C7.4561 14.0049 6.91595 13.779 6.46419 13.3272C6.01242 12.8755 5.78654 12.3353 5.78654 11.7068C5.78654 11.0782 6.01242 10.5381 6.46419 10.0863L11.9148 4.63571L13.0933 5.81422L7.6427 11.2648C7.51503 11.3925 7.45119 11.5398 7.45119 11.7068C7.45119 11.8737 7.51503 12.021 7.6427 12.1487C7.77037 12.2764 7.91768 12.3402 8.08464 12.3402C8.2516 12.3402 8.39891 12.2764 8.52658 12.1487L13.6826 6.99273C14.0852 6.57043 14.289 6.07693 14.2939 5.51223C14.2988 4.94752 14.095 4.45893 13.6826 4.04645C13.2701 3.63397 12.779 3.42773 12.2094 3.42773C11.6398 3.42773 11.1488 3.63397 10.7363 4.04645L5.28568 9.49707C4.57857 10.1845 4.22747 11.0169 4.23238 11.994C4.23729 12.9712 4.58839 13.8085 5.28568 14.5057C5.97314 15.1932 6.80055 15.5345 7.76791 15.5296C8.73528 15.5247 9.57742 15.1834 10.2943 14.5057L16.0396 8.7605L17.2181 9.93901L11.4729 15.6843Z"
                      fill="var(--edit-primary-icon)"
                    />
                  </svg>
                  <p className={CSV_UPLOAD_FILE_CHIP_FILENAME}>
                    {selectedFile.name}
                  </p>
                </div>

                <div className={CSV_UPLOAD_FILE_CHIP_RIGHT}>
                  <p className={CSV_UPLOAD_FILE_CHIP_SIZE}>
                    {formatFileSize(selectedFile.size)}
                  </p>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    aria-label="Remove file"
                    className={CSV_UPLOAD_FILE_CHIP_REMOVE}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M2.5 2.5l11 11M13.5 2.5l-11 11"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={OVERLAY_FOOTER}>
            <button
              type="button"
              onClick={handleClose}
              className={OVERLAY_CANCEL_BTN}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={selectedFile === null || isUploading}
              className={OVERLAY_PRIMARY_BTN}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
