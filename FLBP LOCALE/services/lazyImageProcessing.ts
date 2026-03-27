import type { RefertoStructuredOcrResult } from './imageProcessingService';

type ImageProcessingModule = typeof import('./imageProcessingService');

let imageProcessingModulePromise: Promise<ImageProcessingModule> | null = null;

export const loadImageProcessingService = () => {
    if (!imageProcessingModulePromise) {
        imageProcessingModulePromise = import('./imageProcessingService');
    }
    return imageProcessingModulePromise;
};

export type { RefertoStructuredOcrResult };
