import React, { useState } from 'react';
import { Image } from 'lucide-react';
import { cn } from '@/lib/utils.js';

export function PhotoThumbnail({ photo }) {
    const [failed, setFailed] = useState(false);

    return (
        <div className={cn('photo-thumbnail', failed && 'photo-thumbnail-fallback')}>
            {!failed && (
                <img
                    src={`/api/admin/photos/${photo.id}/preview`}
                    alt={photo.caption || `Фото Леры №${photo.id}`}
                    onError={() => setFailed(true)}
                />
            )}
            {failed && (
                <>
                    <Image size={24} />
                    <span>Превью недоступно</span>
                </>
            )}
        </div>
    );
}

export default PhotoThumbnail;
