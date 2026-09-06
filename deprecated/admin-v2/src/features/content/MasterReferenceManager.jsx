import React from 'react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';

export function MasterReferenceManager({
    imageForm,
    imageSettings,
    onUploadMasterRef,
    onClearMasterRef
}) {
    return (
        <Card>
            <CardHeader
                eyebrow="Внешность Леры"
                title="Мастер-референс внешности"
                description="Эталонное фото лица и стиля Леры, передаваемое в Gemini Vision при генерации."
            />
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 12 }}>
                <div style={{ width: 140, height: 140, minWidth: 140, borderRadius: 10, border: '2px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'rgba(0,0,0,0.3)' }}>
                    {imageForm.master_reference_dataurl ? (
                        <img src={imageForm.master_reference_dataurl} alt="Master Reference" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : imageSettings?.master_reference_photo?.id ? (
                        <img src={`/api/admin/photos/${imageSettings.master_reference_photo.id}/preview`} alt="Master Reference" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <span style={{ fontSize: 11, color: '#888', textAlign: 'center', padding: 8 }}>Нет активного референса</span>
                    )}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label className="ui-button ui-button-primary photo-file-button" style={{ display: 'inline-block', width: 'fit-content' }}>
                        Загрузить фото с компьютера
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => onUploadMasterRef?.(e.target.files?.[0])} />
                    </label>
                    <div>
                        <Button size="sm" variant="outline" onClick={onClearMasterRef}>Сбросить референс</Button>
                    </div>
                    <p style={{ fontSize: 12, color: '#aaa', margin: 0 }}>
                        Либо перейдите во вкладку «🖼️ Галерея» и нажмите «⭐ Сделать референсом» на любой существующей карточке.
                    </p>
                </div>
            </div>
        </Card>
    );
}

export default MasterReferenceManager;
