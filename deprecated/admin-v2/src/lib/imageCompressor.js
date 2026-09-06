/**
 * Client-side image compression using HTML5 Canvas.
 * Automatically resizes large dimensions and progressively compresses image payload to <= 2.5 MB.
 *
 * @param {File|Blob} file - Original image file or blob
 * @param {Object} options - Compression options
 * @returns {Promise<{ file: File, dataUrl: string, blob: Blob, originalSize: number, compressedSize: number, reductionPercent: number, width: number, height: number }>}
 */
export async function compressImage(file, options = {}) {
    const {
        maxSizeBytes = 2.5 * 1024 * 1024, // 2.5 MB default limit
        maxWidth = 2560,
        maxHeight = 2560,
        initialQuality = 0.88,
        outputFormat = 'image/jpeg'
    } = options;

    if (!file || !(file instanceof Blob || (typeof file === 'object' && file.type?.startsWith('image/')))) {
        throw new Error('Указанный файл не является изображением');
    }

    const objectUrl = URL.createObjectURL(file);
    let img;
    try {
        img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Не удалось декодировать изображение'));
            image.src = objectUrl;
        });
    } finally {
        URL.revokeObjectURL(objectUrl);
    }

    let { width, height } = img;
    if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Не удалось инициализировать 2D-контекст Canvas');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    let quality = initialQuality;
    let dataUrl = canvas.toDataURL(outputFormat, quality);
    let blob = await new Promise(resolve => canvas.toBlob(resolve, outputFormat, quality));

    let attempts = 0;
    while (blob && blob.size > maxSizeBytes && quality > 0.35 && attempts < 6) {
        quality -= 0.12;
        dataUrl = canvas.toDataURL(outputFormat, quality);
        blob = await new Promise(resolve => canvas.toBlob(resolve, outputFormat, quality));
        attempts++;
    }

    if (!blob) throw new Error('Ошибка генерации сжатого изображения');

    const originalName = file.name || 'image.jpg';
    const cleanName = originalName.replace(/\.[^/.]+$/, "") + ".jpg";
    const compressedFile = new File([blob], cleanName, {
        type: outputFormat,
        lastModified: Date.now()
    });

    const originalSize = file.size || blob.size;
    const compressedSize = blob.size;
    const reductionPercent = originalSize > 0 ? Math.max(0, Math.round((1 - compressedSize / originalSize) * 100)) : 0;

    return {
        file: compressedFile,
        dataUrl,
        blob,
        originalSize,
        compressedSize,
        reductionPercent,
        width,
        height
    };
}

export default compressImage;
