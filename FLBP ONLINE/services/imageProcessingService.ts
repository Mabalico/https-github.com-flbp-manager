
// Helper: Load Image from File
const loadImage = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
};

const REF_TEMPLATE_SIZE = { w: 2481, h: 3508 };
const REF_MARKER_CENTER_RATIOS = [
    { x: 147 / REF_TEMPLATE_SIZE.w, y: 147 / REF_TEMPLATE_SIZE.h }, // TL
    { x: (REF_TEMPLATE_SIZE.w - 147) / REF_TEMPLATE_SIZE.w, y: 147 / REF_TEMPLATE_SIZE.h }, // TR
    { x: (REF_TEMPLATE_SIZE.w - 147) / REF_TEMPLATE_SIZE.w, y: (REF_TEMPLATE_SIZE.h - 147) / REF_TEMPLATE_SIZE.h }, // BR
    { x: 147 / REF_TEMPLATE_SIZE.w, y: (REF_TEMPLATE_SIZE.h - 147) / REF_TEMPLATE_SIZE.h }, // BL
];

// Helper: Solve Linear System (Gaussian Elimination)
// Solves Ax = B where A is flattened 8x8 matrix and B is 8-vector
const solveLinearSystem = (A: number[][], B: number[]): number[] => {
    const n = B.length;
    for (let i = 0; i < n; i++) {
        // Search for maximum in this column
        let maxEl = Math.abs(A[i][i]);
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(A[k][i]) > maxEl) {
                maxEl = Math.abs(A[k][i]);
                maxRow = k;
            }
        }

        // Swap maximum row with current row
        for (let k = i; k < n; k++) {
            const tmp = A[maxRow][k];
            A[maxRow][k] = A[i][k];
            A[i][k] = tmp;
        }
        const tmp = B[maxRow];
        B[maxRow] = B[i];
        B[i] = tmp;

        // Make all rows below this one 0 in current column
        for (let k = i + 1; k < n; k++) {
            const c = -A[k][i] / A[i][i];
            for (let j = i; j < n; j++) {
                if (i === j) {
                    A[k][j] = 0;
                } else {
                    A[k][j] += c * A[i][j];
                }
            }
            B[k] += c * B[i];
        }
    }

    // Solve equation Ax=B for an upper triangular matrix A
    const x = new Array(n).fill(0);
    for (let i = n - 1; i > -1; i--) {
        let sum = 0;
        for (let j = i + 1; j < n; j++) {
            sum += A[i][j] * x[j];
        }
        x[i] = (B[i] - sum) / A[i][i];
    }
    return x;
};

// Helper: Get Perspective Transform Matrix (8 elements, h33=1)
// Maps srcPoints (tl, tr, br, bl) to dstPoints
const getPerspectiveTransform = (src: {x:number, y:number}[], dst: {x:number, y:number}[]) => {
    const A: number[][] = [];
    const B: number[] = [];

    for (let i = 0; i < 4; i++) {
        const {x: sx, y: sy} = src[i];
        const {x: dx, y: dy} = dst[i];
        A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
        B.push(dx);
        A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
        B.push(dy);
    }

    const H = solveLinearSystem(A, B);
    return [...H, 1]; // Append h33 = 1
};

const findAnchorPoints = (data: Uint8ClampedArray, w: number, h: number) => {
    const threshold = 165;
    const regionW = Math.max(24, Math.floor(w * 0.18));
    const regionH = Math.max(24, Math.floor(h * 0.18));
    const minSide = Math.max(6, Math.round(Math.min(w, h) * 0.012));
    const maxSide = Math.max(minSide + 6, Math.round(Math.min(w, h) * 0.08));

    const isDark = (idx: number) => {
        const r = data[idx * 4];
        const g = data[idx * 4 + 1];
        const b = data[idx * 4 + 2];
        const luminance = (r * 0.299) + (g * 0.587) + (b * 0.114);
        return luminance < threshold;
    };

    const regions = [
        { x0: 0, x1: regionW, y0: 0, y1: regionH, targetX: 0, targetY: 0 },
        { x0: w - regionW, x1: w, y0: 0, y1: regionH, targetX: w - 1, targetY: 0 },
        { x0: w - regionW, x1: w, y0: h - regionH, y1: h, targetX: w - 1, targetY: h - 1 },
        { x0: 0, x1: regionW, y0: h - regionH, y1: h, targetX: 0, targetY: h - 1 },
    ];

    return regions.map((region) => {
        const visited = new Uint8Array((region.x1 - region.x0) * (region.y1 - region.y0));
        const localW = region.x1 - region.x0;
        let best: { x: number; y: number; score: number } | null = null;

        const visitIndex = (x: number, y: number) => ((y - region.y0) * localW) + (x - region.x0);

        for (let y = region.y0; y < region.y1; y += 1) {
            for (let x = region.x0; x < region.x1; x += 1) {
                const localIdx = visitIndex(x, y);
                if (visited[localIdx]) continue;

                const pixIdx = y * w + x;
                if (!isDark(pixIdx)) continue;

                const stack = [x, y];
                let count = 0;
                let minX = x;
                let maxX = x;
                let minY = y;
                let maxY = y;

                while (stack.length > 0) {
                    const cy = stack.pop()!;
                    const cx = stack.pop()!;
                    if (cx < region.x0 || cx >= region.x1 || cy < region.y0 || cy >= region.y1) continue;

                    const nextLocalIdx = visitIndex(cx, cy);
                    if (visited[nextLocalIdx]) continue;
                    visited[nextLocalIdx] = 1;

                    const nextPixIdx = cy * w + cx;
                    if (!isDark(nextPixIdx)) continue;

                    count += 1;
                    if (cx < minX) minX = cx;
                    if (cx > maxX) maxX = cx;
                    if (cy < minY) minY = cy;
                    if (cy > maxY) maxY = cy;

                    stack.push(cx - 1, cy);
                    stack.push(cx + 1, cy);
                    stack.push(cx, cy - 1);
                    stack.push(cx, cy + 1);
                }

                const width = maxX - minX + 1;
                const height = maxY - minY + 1;
                if (count < 20 || width < minSide || height < minSide || width > maxSide || height > maxSide) continue;

                const aspect = width / Math.max(1, height);
                if (aspect < 0.7 || aspect > 1.4) continue;

                const fillRatio = count / Math.max(1, width * height);
                if (fillRatio < 0.6) continue;

                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;
                const distance = Math.hypot(centerX - region.targetX, centerY - region.targetY);
                const score = (fillRatio * 100) - (distance * 0.18) - (Math.abs(width - height) * 2);

                if (!best || score > best.score) {
                    best = { x: centerX, y: centerY, score };
                }
            }
        }

        return best ? { x: best.x, y: best.y } : null;
    });
};

// Main Exported Function
export const preprocessRefertoToAlignedCanvas = async (file: File): Promise<HTMLCanvasElement> => {
    // 1. Load Original
    const img = await loadImage(file);
    const W = img.width;
    const H = img.height;

    // 2. Create Detection Canvas (Downscaled)
    const MAX_DETECTION_DIM = 800;
    const scale = Math.min(MAX_DETECTION_DIM / Math.max(W, H), 1);
    const dW = Math.floor(W * scale);
    const dH = Math.floor(H * scale);

    const detCvs = document.createElement('canvas');
    detCvs.width = dW;
    detCvs.height = dH;
    const detCtx = detCvs.getContext('2d', { willReadFrequently: true })!;
    detCtx.drawImage(img, 0, 0, dW, dH);
    
    // 3. Find Anchors
    const imgData = detCtx.getImageData(0, 0, dW, dH);
    const foundAnchors = findAnchorPoints(imgData.data, dW, dH);

    // 4. Output Canvas (Canon A4-ish ratio)
    const outW = 1200;
    const outH = 1700;
    const outCvs = document.createElement('canvas');
    outCvs.width = outW;
    outCvs.height = outH;
    let outCtx = outCvs.getContext('2d')!;

    // Check if we found all 4 corners
    if (foundAnchors.some(a => a === null)) {
        console.warn("OCR: Anchor detection failed, using original image.", foundAnchors);
        // Fallback: Use original image scale to preserve quality for OCR
        outCvs.width = W;
        outCvs.height = H;
        outCtx = outCvs.getContext('2d')!;
        outCtx.drawImage(img, 0, 0);
        return outCvs;
    }

    // 5. Compute Homography Matrix
    // Upscale anchors back to original resolution
    const srcPoints = foundAnchors.map(p => ({ x: p!.x / scale, y: p!.y / scale }));
    const dstPoints = REF_MARKER_CENTER_RATIOS.map(({ x, y }) => ({
        x: x * outW,
        y: y * outH,
    }));

    // Compute H^-1 (Destination -> Source) implies we actually want Src->Dst matrix then inverse it? 
    // Usually for warping we loop over DST pixels and find SRC coordinate.
    // So we calculate Transform from DST to SRC directly.
    const H_inv = getPerspectiveTransform(dstPoints, srcPoints);

    // 6. Warp Image (Pixel-by-pixel, Nearest Neighbor for speed)
    const outData = outCtx.createImageData(outW, outH);
    const dstBuf = outData.data;
    
    // Original image data for sampling (Keep original resolution for quality)
    const origCvs = document.createElement('canvas');
    origCvs.width = W;
    origCvs.height = H;
    const origCtx = origCvs.getContext('2d', { willReadFrequently: true })!;
    origCtx.drawImage(img, 0, 0);
    const srcBuf = origCtx.getImageData(0, 0, W, H).data;

    // Flatten H matrix for fast access
    const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = H_inv;

    for (let y = 0; y < outH; y++) {
        for (let x = 0; x < outW; x++) {
            // Apply homography dst(x,y) -> src(u,v)
            const den = h6 * x + h7 * y + h8;
            const u = Math.floor((h0 * x + h1 * y + h2) / den);
            const v = Math.floor((h3 * x + h4 * y + h5) / den);

            const dstIdx = (y * outW + x) * 4;
            
            if (u >= 0 && u < W && v >= 0 && v < H) {
                const srcIdx = (v * W + u) * 4;
                dstBuf[dstIdx] = srcBuf[srcIdx];
                dstBuf[dstIdx + 1] = srcBuf[srcIdx + 1];
                dstBuf[dstIdx + 2] = srcBuf[srcIdx + 2];
                dstBuf[dstIdx + 3] = 255; // Alpha
            } else {
                // Out of bounds - white
                dstBuf[dstIdx] = 255;
                dstBuf[dstIdx + 1] = 255;
                dstBuf[dstIdx + 2] = 255;
                dstBuf[dstIdx + 3] = 255;
            }
        }
    }

    outCtx.putImageData(outData, 0, 0);
    return outCvs;
};

type RectMm = { x: number; y: number; w: number; h: number };

export interface RefertoStructuredOcrPlayer {
    name: string;
    canestri?: number;
    soffi?: number;
}

export interface RefertoStructuredOcrResult {
    code: string;
    teamAName: string;
    teamBName: string;
    playerA1: RefertoStructuredOcrPlayer;
    playerA2: RefertoStructuredOcrPlayer;
    playerB1: RefertoStructuredOcrPlayer;
    playerB2: RefertoStructuredOcrPlayer;
    teamAScore?: number;
    teamBScore?: number;
    winnerSide?: 'A' | 'B';
    issues: string[];
    summaryText: string;
}

const REF_A4_MM = { w: 210, h: 297 };

const REF_OCR_ZONES: Record<string, RectMm> = {
    code: { x: 9.5, y: 35.5, w: 58.0, h: 20.5 },
    codeTight: { x: 12.5, y: 43.5, w: 22.5, h: 10.5 },

    teamAName: { x: 74.0, y: 58.5, w: 124.0, h: 11.5 },
    playerA1Name: { x: 11.0, y: 82.0, w: 50.0, h: 12.0 },
    playerA2Name: { x: 11.0, y: 108.5, w: 50.0, h: 12.0 },

    teamBName: { x: 74.0, y: 145.0, w: 124.0, h: 11.5 },
    playerB1Name: { x: 11.0, y: 169.0, w: 50.0, h: 12.0 },
    playerB2Name: { x: 11.0, y: 196.0, w: 50.0, h: 12.0 },

    a1Canestri: { x: 174.0, y: 77.0, w: 25.5, h: 10.5 },
    a1Soffi: { x: 174.0, y: 88.5, w: 25.5, h: 10.5 },
    a2Canestri: { x: 174.0, y: 103.5, w: 25.5, h: 10.5 },
    a2Soffi: { x: 174.0, y: 115.0, w: 25.5, h: 10.5 },

    b1Canestri: { x: 174.0, y: 164.5, w: 25.5, h: 10.5 },
    b1Soffi: { x: 174.0, y: 176.0, w: 25.5, h: 10.5 },
    b2Canestri: { x: 174.0, y: 191.5, w: 25.5, h: 10.5 },
    b2Soffi: { x: 174.0, y: 203.0, w: 25.5, h: 10.5 },
};

const mmRectToPx = (canvas: HTMLCanvasElement, rect: RectMm) => {
    const x = Math.round((rect.x / REF_A4_MM.w) * canvas.width);
    const y = Math.round((rect.y / REF_A4_MM.h) * canvas.height);
    const w = Math.max(1, Math.round((rect.w / REF_A4_MM.w) * canvas.width));
    const h = Math.max(1, Math.round((rect.h / REF_A4_MM.h) * canvas.height));
    return { x, y, w, h };
};

const cleanOcrText = (value: string) => {
    return String(value || '')
        .replace(/\r/g, '\n')
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const normalizeDigitishText = (value: string) => {
    return cleanOcrText(value)
        .replace(/[OoQqD]/g, '0')
        .replace(/[Il|!]/g, '1')
        .replace(/[Zz]/g, '2')
        .replace(/[Ss]/g, '5')
        .replace(/[Gg]/g, '6')
        .replace(/[Bb]/g, '8');
};

const extractCodeToken = (value: string) => {
    const cleaned = normalizeDigitishText(value).toUpperCase();
    const match = cleaned.match(/\b([A-Z]{1,2}TB\d{1,4}|[A-Z]{1,3}\d{1,4})\b/);
    return match ? match[1] : '';
};

const extractIntegerToken = (value: string) => {
    const cleaned = normalizeDigitishText(value);
    const groups = cleaned.match(/\d{1,2}/g) || [];
    if (!groups.length) return undefined;
    const first = parseInt(groups[0], 10);
    return Number.isFinite(first) ? Math.max(0, first) : undefined;
};

const buildSummaryLine = (label: string, player: RefertoStructuredOcrPlayer) => {
    const parts: string[] = [label, player.name || ''];
    if (typeof player.canestri === 'number') parts.push(`PT ${player.canestri}`);
    if (typeof player.soffi === 'number') parts.push(`SF ${player.soffi}`);
    return parts.filter(Boolean).join(' | ');
};

const sumIfComplete = (values: Array<number | undefined>) => {
    if (values.some(v => typeof v !== 'number')) return undefined;
    return values.reduce((acc, v) => acc + (v || 0), 0);
};

const expandRectMm = (rect: RectMm, padX: number, padY: number): RectMm => ({
    x: Math.max(0, rect.x - padX),
    y: Math.max(0, rect.y - padY),
    w: rect.w + (padX * 2),
    h: rect.h + (padY * 2),
});

const shrinkRectMm = (
    rect: RectMm,
    opts: { insetX?: number; insetY?: number; shiftX?: number; shiftY?: number; widthFactor?: number; heightFactor?: number }
): RectMm => {
    const insetX = opts.insetX ?? 0;
    const insetY = opts.insetY ?? 0;
    const widthFactor = opts.widthFactor ?? (1 - insetX * 2);
    const heightFactor = opts.heightFactor ?? (1 - insetY * 2);
    return {
        x: rect.x + (rect.w * insetX) + (rect.w * (opts.shiftX ?? 0)),
        y: rect.y + (rect.h * insetY) + (rect.h * (opts.shiftY ?? 0)),
        w: rect.w * widthFactor,
        h: rect.h * heightFactor,
    };
};

const cropCanvasForOcr = (
    source: HTMLCanvasElement,
    rectMm: RectMm,
    opts?: { scale?: number; threshold?: number; grayscale?: boolean }
) => {
    const rect = mmRectToPx(source, rectMm);
    const scale = Math.max(1, opts?.scale ?? 2);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(rect.w * scale));
    out.height = Math.max(1, Math.round(rect.h * scale));
    const ctx = out.getContext('2d', { willReadFrequently: true })!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, out.width, out.height);

    if (opts?.grayscale !== false || typeof opts?.threshold === 'number') {
        const img = ctx.getImageData(0, 0, out.width, out.height);
        const buf = img.data;
        const threshold = opts?.threshold;
        for (let i = 0; i < buf.length; i += 4) {
            const gray = Math.round((buf[i] * 0.299) + (buf[i + 1] * 0.587) + (buf[i + 2] * 0.114));
            const val = typeof threshold === 'number'
                ? (gray < threshold ? 0 : 255)
                : gray;
            buf[i] = val;
            buf[i + 1] = val;
            buf[i + 2] = val;
            buf[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
    }

    return out;
};

const extractInkOnlyCanvas = (
    source: HTMLCanvasElement,
    rectMm: RectMm,
    opts: {
        focus?: RectMm;
        scale?: number;
        threshold?: number;
        minDarkPixels?: number;
        padding?: number;
    } = {}
) => {
    const workingRect = opts.focus ?? rectMm;
    const crop = cropCanvasForOcr(source, workingRect, {
        scale: opts.scale ?? 6,
        grayscale: true,
    });
    const ctx = crop.getContext('2d', { willReadFrequently: true })!;
    const img = ctx.getImageData(0, 0, crop.width, crop.height);
    const buf = img.data;
    const threshold = opts.threshold ?? 190;
    const margin = Math.max(2, Math.round(Math.min(crop.width, crop.height) * 0.03));

    let minX = crop.width;
    let minY = crop.height;
    let maxX = -1;
    let maxY = -1;
    let darkCount = 0;

    for (let y = margin; y < crop.height - margin; y++) {
        for (let x = margin; x < crop.width - margin; x++) {
            const idx = (y * crop.width + x) * 4;
            const gray = Math.round((buf[idx] * 0.299) + (buf[idx + 1] * 0.587) + (buf[idx + 2] * 0.114));
            if (gray >= threshold) continue;
            darkCount += 1;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }

    if (darkCount < (opts.minDarkPixels ?? 18) || maxX <= minX || maxY <= minY) {
        return null;
    }

    const padding = opts.padding ?? 10;
    const x0 = Math.max(0, minX - padding);
    const y0 = Math.max(0, minY - padding);
    const x1 = Math.min(crop.width, maxX + padding + 1);
    const y1 = Math.min(crop.height, maxY + padding + 1);
    const out = document.createElement('canvas');
    out.width = Math.max(1, x1 - x0);
    out.height = Math.max(1, y1 - y0);
    const outCtx = out.getContext('2d')!;
    outCtx.fillStyle = '#ffffff';
    outCtx.fillRect(0, 0, out.width, out.height);
    outCtx.drawImage(crop, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out;
};

const recognizeCanvasZone = async (
    worker: any,
    source: HTMLCanvasElement,
    rectMm: RectMm,
    opts: { scale?: number; threshold?: number; psm?: string; whitelist?: string }
) => {
    const zoneCanvas = cropCanvasForOcr(source, rectMm, {
        scale: opts.scale,
        threshold: opts.threshold,
        grayscale: true,
    });

    const params: Record<string, string> = {
        tessedit_pageseg_mode: opts.psm || '7',
        preserve_interword_spaces: '1',
    };
    if (opts.whitelist) params.tessedit_char_whitelist = opts.whitelist;

    await worker.setParameters(params as any);
    const { data } = await worker.recognize(zoneCanvas);
    return cleanOcrText(data?.text || '');
};

const recognizeNumericZone = async (worker: any, source: HTMLCanvasElement, rectMm: RectMm) => {
    const focusRect = shrinkRectMm(rectMm, {
        insetX: 0.16,
        insetY: 0.18,
        shiftY: 0.18,
        widthFactor: 0.62,
        heightFactor: 0.46,
    });

    const isolatedAttempts = [
        { threshold: 155, scale: 8.5, psm: '10' },
        { threshold: 182, scale: 8.5, psm: '10' },
        { threshold: 205, scale: 8.5, psm: '10' },
    ];

    for (const attempt of isolatedAttempts) {
        const isolated = extractInkOnlyCanvas(source, rectMm, {
            focus: focusRect,
            threshold: attempt.threshold,
            scale: attempt.scale,
            minDarkPixels: 20,
            padding: 12,
        });
        if (!isolated) continue;
        await worker.setParameters({
            tessedit_pageseg_mode: attempt.psm,
            tessedit_char_whitelist: '0123456789OIl|!SsGgBbZz',
            preserve_interword_spaces: '1',
        } as any);
        const { data } = await worker.recognize(isolated);
        const raw = cleanOcrText(data?.text || '');
        const parsed = extractIntegerToken(raw);
        if (parsed !== undefined && parsed <= 15) return parsed;
    }

    const attempts = [
        { rect: focusRect, scale: 6.2, threshold: 150, psm: '10' },
        { rect: focusRect, scale: 6.2, threshold: 180, psm: '10' },
        { rect: focusRect, scale: 5.8, threshold: undefined, psm: '10' },
        { rect: focusRect, scale: 5.2, threshold: 170, psm: '7' },
    ];

    for (const attempt of attempts) {
        const raw = await recognizeCanvasZone(worker, source, attempt.rect, {
            scale: attempt.scale,
            threshold: attempt.threshold,
            psm: attempt.psm,
            whitelist: '0123456789OIl|!SsGgBbZz',
        });
        const value = extractIntegerToken(raw);
        if (value !== undefined && value <= 15) return value;
    }

    return undefined;
};

const recognizeCodeZone = async (worker: any, source: HTMLCanvasElement) => {
    const isolated = extractInkOnlyCanvas(source, REF_OCR_ZONES.code, {
        focus: REF_OCR_ZONES.codeTight,
        threshold: 180,
        scale: 8,
        minDarkPixels: 24,
        padding: 14,
    });
    if (isolated) {
        await worker.setParameters({
            tessedit_pageseg_mode: '7',
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789Il|!Oo',
            preserve_interword_spaces: '1',
        } as any);
        const { data } = await worker.recognize(isolated);
        const code = extractCodeToken(cleanOcrText(data?.text || ''));
        if (code) return code;
    }

    const attempts = [
        { rect: REF_OCR_ZONES.codeTight, scale: 7.2, threshold: 140, psm: '7' },
        { rect: REF_OCR_ZONES.codeTight, scale: 7.2, threshold: undefined, psm: '7' },
        { rect: REF_OCR_ZONES.code, scale: 4.4, threshold: 175, psm: '6' },
    ];

    for (const attempt of attempts) {
        const raw = await recognizeCanvasZone(worker, source, attempt.rect, {
            scale: attempt.scale,
            threshold: attempt.threshold,
            psm: attempt.psm,
            whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789Il|!Oo",
        });
        const code = extractCodeToken(raw);
        if (code) return code;
    }

    return '';
};

export const ocrStructuredRefertoFromAlignedCanvas = async (canvas: HTMLCanvasElement): Promise<RefertoStructuredOcrResult> => {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');

    try {
        const nameWhitelist = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '-./";
        const code = await recognizeCodeZone(worker, canvas);

        const teamAName = await recognizeCanvasZone(worker, canvas, REF_OCR_ZONES.teamAName, {
            scale: 2.4,
            threshold: 180,
            psm: '7',
            whitelist: nameWhitelist,
        });
        const teamBName = await recognizeCanvasZone(worker, canvas, REF_OCR_ZONES.teamBName, {
            scale: 2.4,
            threshold: 180,
            psm: '7',
            whitelist: nameWhitelist,
        });

        const playerA1Name = await recognizeCanvasZone(worker, canvas, REF_OCR_ZONES.playerA1Name, {
            scale: 2.5,
            threshold: 180,
            psm: '7',
            whitelist: nameWhitelist,
        });
        const playerA2Name = await recognizeCanvasZone(worker, canvas, REF_OCR_ZONES.playerA2Name, {
            scale: 2.5,
            threshold: 180,
            psm: '7',
            whitelist: nameWhitelist,
        });
        const playerB1Name = await recognizeCanvasZone(worker, canvas, REF_OCR_ZONES.playerB1Name, {
            scale: 2.5,
            threshold: 180,
            psm: '7',
            whitelist: nameWhitelist,
        });
        const playerB2Name = await recognizeCanvasZone(worker, canvas, REF_OCR_ZONES.playerB2Name, {
            scale: 2.5,
            threshold: 180,
            psm: '7',
            whitelist: nameWhitelist,
        });

        const a1Canestri = await recognizeNumericZone(worker, canvas, REF_OCR_ZONES.a1Canestri);
        const a1Soffi = await recognizeNumericZone(worker, canvas, REF_OCR_ZONES.a1Soffi);
        const a2Canestri = await recognizeNumericZone(worker, canvas, REF_OCR_ZONES.a2Canestri);
        const a2Soffi = await recognizeNumericZone(worker, canvas, REF_OCR_ZONES.a2Soffi);
        const b1Canestri = await recognizeNumericZone(worker, canvas, REF_OCR_ZONES.b1Canestri);
        const b1Soffi = await recognizeNumericZone(worker, canvas, REF_OCR_ZONES.b1Soffi);
        const b2Canestri = await recognizeNumericZone(worker, canvas, REF_OCR_ZONES.b2Canestri);
        const b2Soffi = await recognizeNumericZone(worker, canvas, REF_OCR_ZONES.b2Soffi);

        const teamAScore = sumIfComplete([a1Canestri, a2Canestri]);
        const teamBScore = sumIfComplete([b1Canestri, b2Canestri]);
        const winnerSide = typeof teamAScore === 'number' && typeof teamBScore === 'number'
            ? teamAScore > teamBScore
                ? 'A'
                : teamBScore > teamAScore
                    ? 'B'
                    : undefined
            : undefined;

        const issues: string[] = [];
        if (typeof teamAScore === 'number' && typeof teamBScore === 'number' && teamAScore === teamBScore) {
            issues.push('Esito non derivabile: canestri totali pari, verifica manualmente.');
        }

        const playerA1: RefertoStructuredOcrPlayer = { name: playerA1Name, canestri: a1Canestri, soffi: a1Soffi };
        const playerA2: RefertoStructuredOcrPlayer = { name: playerA2Name, canestri: a2Canestri, soffi: a2Soffi };
        const playerB1: RefertoStructuredOcrPlayer = { name: playerB1Name, canestri: b1Canestri, soffi: b1Soffi };
        const playerB2: RefertoStructuredOcrPlayer = { name: playerB2Name, canestri: b2Canestri, soffi: b2Soffi };

        const lines = [
            `ID PARTITA: ${code || '(non letto)'}`,
            `SQUADRA A: ${teamAName || '(non letta)'}`,
            buildSummaryLine('G1-A', playerA1),
            buildSummaryLine('G2-A', playerA2),
            `SQUADRA B: ${teamBName || '(non letta)'}`,
            buildSummaryLine('G1-B', playerB1),
            buildSummaryLine('G2-B', playerB2),
        ];

        if (typeof teamAScore === 'number' || typeof teamBScore === 'number') {
            lines.push(`TOTALE CANESTRI: ${typeof teamAScore === 'number' ? teamAScore : '?'} - ${typeof teamBScore === 'number' ? teamBScore : '?'}`);
        }
        if (winnerSide) {
            lines.push(`ESITO: Vince Squadra ${winnerSide}`);
        } else {
            lines.push('ESITO: non rilevato');
        }
        if (issues.length) {
            lines.push('');
            issues.forEach(issue => lines.push(`ATTENZIONE: ${issue}`));
        }

        return {
            code,
            teamAName,
            teamBName,
            playerA1,
            playerA2,
            playerB1,
            playerB2,
            teamAScore,
            teamBScore,
            winnerSide,
            issues,
            summaryText: lines.join('\n').trim(),
        };
    } finally {
        await worker.terminate();
    }
};


// OCR (beta) - extracts raw text from the aligned canvas using tesseract.js.
// Kept optional and lazy-loaded to avoid breaking the app if OCR is not needed.
export const ocrTextFromAlignedCanvas = async (canvas: HTMLCanvasElement): Promise<string> => {
    try {
        const structured = await ocrStructuredRefertoFromAlignedCanvas(canvas);
        if (structured.summaryText) return structured.summaryText;

        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng');
        const { data } = await worker.recognize(canvas);
        await worker.terminate();
        return (data && (data as any).text) ? String((data as any).text) : '';
    } catch (err) {
        console.warn('[OCR] failed', err);
        return '';
    }
};
