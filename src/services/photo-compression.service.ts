import { PhotoAttachment } from '../types';

export interface PhotoValidationResult {
  isValid: boolean;
  error?: string;
}

export interface CompressionResult {
  compressedBlob: Blob;
  dataUrl: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  compressionRatio: number;
  width: number;
  height: number;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_PHOTO_COUNT = 5;

/**
 * Validates a single file against type and size boundaries
 */
export const validatePhotoFile = (file: File): PhotoValidationResult => {
  if (!file) {
    return { isValid: false, error: 'No file selected.' };
  }

  // Type check
  const isAllowedType = ALLOWED_MIME_TYPES.some(type => file.type.toLowerCase().includes(type.split('/')[1]));
  if (!file.type.startsWith('image/') && !isAllowedType) {
    return {
      isValid: false,
      error: `Invalid file format (${file.type || 'unknown'}). Supported: JPEG, PNG, WEBP.`
    };
  }

  // Size check
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      isValid: false,
      error: `File size exceeds 10MB limit (Current: ${sizeMb}MB).`
    };
  }

  return { isValid: true };
};

/**
 * Validates total photo count
 */
export const validatePhotoCount = (currentCount: number, addingCount: number): PhotoValidationResult => {
  if (currentCount + addingCount > MAX_PHOTO_COUNT) {
    return {
      isValid: false,
      error: `Maximum ${MAX_PHOTO_COUNT} tactical photos permitted per incident report.`
    };
  }
  return { isValid: true };
};

/**
 * Compresses an image file/blob using HTML5 Canvas
 */
export const compressPhoto = async (
  file: File | Blob,
  maxWidth = 1280,
  maxHeight = 1280,
  quality = 0.75
): Promise<CompressionResult> => {
  const originalSizeBytes = file.size;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read photo file.'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image data for compression.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate aspect ratio downscaling
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not initialize canvas 2D rendering context.'));
          return;
        }

        // Draw and apply bicubic smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Export as JPEG with targeted compression quality
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas toBlob compression failed.'));
              return;
            }

            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            const compressedSizeBytes = blob.size;
            const compressionRatio = originalSizeBytes > 0 
              ? Math.round(((originalSizeBytes - compressedSizeBytes) / originalSizeBytes) * 100) 
              : 0;

            resolve({
              compressedBlob: blob,
              dataUrl,
              originalSizeBytes,
              compressedSizeBytes,
              compressionRatio: Math.max(0, compressionRatio),
              width,
              height
            });
          },
          'image/jpeg',
          quality
        );
      };

      img.src = event.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
};

/**
 * Converts a File object into a complete PhotoAttachment ready for IndexedDB
 */
export const createPhotoAttachment = async (
  file: File,
  report_id: string
): Promise<PhotoAttachment> => {
  const validation = validatePhotoFile(file);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const compression = await compressPhoto(file);
  const photoId = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  return {
    id: photoId,
    report_id,
    name: file.name || `photo_${Date.now()}.jpg`,
    dataUrl: compression.dataUrl,
    blob: compression.compressedBlob,
    sizeBytes: compression.compressedSizeBytes,
    originalSizeBytes: compression.originalSizeBytes,
    mimeType: 'image/jpeg',
    isCompressed: true,
    compressionRatio: compression.compressionRatio,
    isUploaded: false,
    timestamp: Date.now()
  };
};
