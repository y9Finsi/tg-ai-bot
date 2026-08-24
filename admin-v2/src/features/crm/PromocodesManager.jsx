import React, { useState } from 'react';
import { Tag } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ConfirmAction } from '@/components/ui/ConfirmAction.jsx';

export function PromocodesManager({
    packages = {},
    promocodes = [],
    onCreatePromo,
    onDeletePromo
}) {
    const [promoForm, setPromoForm] = useState({
        code: '',
        maxActivations: 1,
        bonusRequests: 0,
        bonusImages: 0,
        discountPercent: 0
    });

    function handleSubmit() {
        if (!promoForm.code.trim()) return;
        onCreatePromo?.({
            ...promoForm,
            code: promoForm.code.trim(),
            maxActivations: Number(promoForm.maxActivations || 1),
            bonusRequests: Number(promoForm.bonusRequests || 0),
            bonusImages: Number(promoForm.bonusImages || 0),
            discountPercent: Number(promoForm.discountPercent || 0)
        });
        setPromoForm({ code: '', maxActivations: 1, bonusRequests: 0, bonusImages: 0, discountPercent: 0 });
    }

    return (
        <div className="crm-commerce-layout">
            <Card>
                <CardHeader
                    eyebrow="Тарифы"
                    title="Действующие пакеты подписок"
                    description="Настройки стоимости и объёма выданных запросов."
                />
                <div className="packages-grid">
                    {Object.entries(packages).map(([key, value]) => (
                        <div className="managed-row" key={key}>
                            <strong>{key}</strong>
                            <span>{value.stars} ⭐ · {value.rub} ₽ · 💬 {value.text} текст · 🖼️ {value.img} фото</span>
                        </div>
                    ))}
                </div>
            </Card>

            <Card>
                <CardHeader
                    eyebrow="Промокоды"
                    title="Продажи"
                    description="Промокоды и Пакеты"
                />
                <div className="inline-controls promo-form">
                    <input
                        value={promoForm.code}
                        placeholder="Код (например, LERA2026)"
                        onChange={event => setPromoForm({ ...promoForm, code: event.target.value })}
                    />
                    <input
                        type="number"
                        value={promoForm.bonusRequests}
                        placeholder="Бонус 💬"
                        onChange={event => setPromoForm({ ...promoForm, bonusRequests: event.target.value })}
                    />
                    <input
                        type="number"
                        value={promoForm.bonusImages}
                        placeholder="Бонус 🖼️"
                        onChange={event => setPromoForm({ ...promoForm, bonusImages: event.target.value })}
                    />
                    <input
                        type="number"
                        value={promoForm.maxActivations}
                        placeholder="Активаций макс"
                        onChange={event => setPromoForm({ ...promoForm, maxActivations: event.target.value })}
                    />
                    <input
                        type="number"
                        value={promoForm.discountPercent}
                        placeholder="Скидка %"
                        onChange={event => setPromoForm({ ...promoForm, discountPercent: event.target.value })}
                    />
                    <Button onClick={handleSubmit}>Создать промокод</Button>
                </div>
                <div className="promocodes-list">
                    {promocodes.map(promo => (
                        <div className="managed-row" key={promo.id}>
                            <Tag size={15} />
                            <div>
                                <strong>{promo.code}</strong>
                                <span>
                                    💬 {promo.bonus_requests} запросов · 🖼️ {promo.bonus_images} фото · {promo.max_activations || 1} макс · {promo.discount_percent || 0}% скидка
                                </span>
                            </div>
                            {onDeletePromo && (
                                <ConfirmAction
                                    title="Удалить промокод?"
                                    description="Код больше нельзя будет активировать."
                                    confirmText="Удалить"
                                    variant="danger"
                                    onConfirm={() => onDeletePromo(promo.id)}
                                >
                                    Удалить
                                </ConfirmAction>
                            )}
                        </div>
                    ))}
                    {!promocodes.length && (
                        <div className="empty-state">Промокодов пока нет.</div>
                    )}
                </div>
            </Card>
        </div>
    );
}

export default PromocodesManager;
