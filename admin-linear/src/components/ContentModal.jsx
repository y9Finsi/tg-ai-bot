import React, { useState, useEffect } from 'react';
import { X, Check, Link as LinkIcon, Image, Film, Sparkles, Music, FileText } from 'lucide-react';

const CONTENT_TYPES = [
    { id: 'link', label: 'Ссылка', icon: LinkIcon },
    { id: 'photo', label: 'Фото / Мем', icon: Image },
    { id: 'video', label: 'Видео', icon: Film },
    { id: 'animation', label: 'GIF / Анимация', icon: Sparkles },
    { id: 'audio', label: 'Аудио / Трек', icon: Music },
    { id: 'document', label: 'Документ / Файл', icon: FileText }
];

export function ContentModal({
    isOpen,
    item = null,
    onClose,
    onSave,
    saving = false
}) {
    const [telegramType, setTelegramType] = useState('link');
    const [url, setUrl] = useState('');
    const [telegramFileId, setTelegramFileId] = useState('');
    const [description, setDescription] = useState('');
    const [enabled, setEnabled] = useState(true);
    const [allowInDialogue, setAllowInDialogue] = useState(true);
    const [allowInitiative, setAllowInitiative] = useState(true);
    const [allowChannel, setAllowChannel] = useState(false);

    useEffect(() => {
        if (item) {
            setTelegramType(item.telegram_type || 'link');
            setUrl(item.url || '');
            setTelegramFileId(item.telegram_file_id || '');
            setDescription(item.description || '');
            setEnabled(item.enabled !== false);
            setAllowInDialogue(item.allow_in_dialogue !== false);
            setAllowInitiative(item.allow_initiative !== false);
            setAllowChannel(item.allow_channel === true);
        } else {
            setTelegramType('link');
            setUrl('');
            setTelegramFileId('');
            setDescription('');
            setEnabled(true);
            setAllowInDialogue(true);
            setAllowInitiative(true);
            setAllowChannel(false);
        }
    }, [item, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        const trimmedUrl = url.trim();
        const trimmedFileId = telegramFileId.trim();

        if (!trimmedUrl && !trimmedFileId) {
            alert('Укажите URL или Telegram File ID');
            return;
        }

        onSave({
            telegram_type: telegramType,
            url: trimmedUrl || null,
            telegram_file_id: trimmedFileId || null,
            description: description.trim(),
            enabled,
            allow_in_dialogue: allowInDialogue,
            allow_initiative: allowInitiative,
            allow_channel: allowChannel
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 select-none">
            <div className="relative w-full max-w-[560px] rounded-[24px] bg-[#151515] border border-white/10 shadow-[0_16px_48px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-[#1b1d22]/50">
                    <h3 className="text-[17px] font-medium text-white">
                        {item ? 'Редактировать материал' : 'Добавить материал в банк'}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors cursor-pointer"
                    >
                        <X className="w-4 h-4 stroke-[2]" />
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
                    {/* Content Type Selector */}
                    <div className="flex flex-col gap-2">
                        <label className="text-[12px] font-medium uppercase tracking-wider text-white/40">
                            Тип контента
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {CONTENT_TYPES.map(t => {
                                const Icon = t.icon;
                                const isSelected = telegramType === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => setTelegramType(t.id)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-normal transition-all cursor-pointer border ${
                                            isSelected
                                                ? 'bg-[#292e5e] border-[#434771] text-white shadow-sm'
                                                : 'bg-[#1b1d22] border-white/5 text-white/60 hover:text-white hover:border-white/10'
                                        }`}
                                    >
                                        <Icon className="w-3.5 h-3.5 stroke-[1.8] shrink-0" />
                                        <span className="truncate">{t.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* URL Input */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[12px] font-medium uppercase tracking-wider text-white/40">
                            URL / Ссылка на трек, видео или фото
                        </label>
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://t.me/... или https://music.yandex.ru/..."
                            className="w-full px-3.5 py-2.5 rounded-xl bg-[#1b1d22] border border-white/10 text-white text-[14px] placeholder:text-white/25 focus:outline-none focus:border-[#434771] focus:ring-1 focus:ring-[#434771] transition-all"
                        />
                    </div>

                    {/* File ID Input (Optional for TG files) */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[12px] font-medium uppercase tracking-wider text-white/40 flex items-center justify-between">
                            <span>Telegram File ID (Опционально)</span>
                            <span className="text-[10px] text-white/30 lowercase">для медиафайлов телеграма</span>
                        </label>
                        <input
                            type="text"
                            value={telegramFileId}
                            onChange={(e) => setTelegramFileId(e.target.value)}
                            placeholder="BAACAgIAAxkBAAI..."
                            className="w-full px-3.5 py-2.5 rounded-xl bg-[#1b1d22] border border-white/10 text-white text-[13px] font-mono placeholder:text-white/25 focus:outline-none focus:border-[#434771] focus:ring-1 focus:ring-[#434771] transition-all"
                        />
                    </div>

                    {/* Description Input */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[12px] font-medium uppercase tracking-wider text-white/40 flex items-center justify-between">
                            <span>Описание и контекст</span>
                            <span className="text-[10px] text-white/30">помогает Лере понять, когда это скидывать</span>
                        </label>
                        <textarea
                            rows={3}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Например: Любимый трек группы Кино, скидывать когда разговор заходит про Питер или ностальгию..."
                            className="w-full px-3.5 py-2.5 rounded-xl bg-[#1b1d22] border border-white/10 text-white text-[14px] placeholder:text-white/25 focus:outline-none focus:border-[#434771] focus:ring-1 focus:ring-[#434771] transition-all resize-none"
                        />
                    </div>

                    {/* Permissions & Visibility Controls */}
                    <div className="flex flex-col gap-2.5 pt-2 border-t border-white/[0.08]">
                        <label className="text-[12px] font-medium uppercase tracking-wider text-white/40">
                            Разрешения и доступность
                        </label>

                        <div className="grid grid-cols-2 gap-2">
                            {/* Enabled */}
                            <button
                                type="button"
                                onClick={() => setEnabled(!enabled)}
                                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                                    enabled
                                        ? 'bg-[#1b1d22] border-emerald-500/40 text-white'
                                        : 'bg-[#1b1d22]/40 border-white/5 text-white/40'
                                }`}
                            >
                                <span className="text-[13px] font-medium">Материал активен</span>
                                <div className={`w-4 h-4 rounded-md flex items-center justify-center border transition-all ${
                                    enabled ? 'bg-emerald-500 border-emerald-400 text-black' : 'border-white/20'
                                }`}>
                                    {enabled && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                            </button>

                            {/* Allow in Dialogue */}
                            <button
                                type="button"
                                onClick={() => setAllowInDialogue(!allowInDialogue)}
                                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                                    allowInDialogue
                                        ? 'bg-[#1b1d22] border-[#434771] text-white'
                                        : 'bg-[#1b1d22]/40 border-white/5 text-white/40'
                                }`}
                            >
                                <span className="text-[13px] font-medium">В личных диалогах</span>
                                <div className={`w-4 h-4 rounded-md flex items-center justify-center border transition-all ${
                                    allowInDialogue ? 'bg-[#292e5e] border-[#434771] text-white' : 'border-white/20'
                                }`}>
                                    {allowInDialogue && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                            </button>

                            {/* Allow in Initiative */}
                            <button
                                type="button"
                                onClick={() => setAllowInitiative(!allowInitiative)}
                                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                                    allowInitiative
                                        ? 'bg-[#1b1d22] border-amber-500/40 text-white'
                                        : 'bg-[#1b1d22]/40 border-white/5 text-white/40'
                                }`}
                            >
                                <span className="text-[13px] font-medium">В инициативах Леры</span>
                                <div className={`w-4 h-4 rounded-md flex items-center justify-center border transition-all ${
                                    allowInitiative ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : 'border-white/20'
                                }`}>
                                    {allowInitiative && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                            </button>

                            {/* Allow in Channel */}
                            <button
                                type="button"
                                onClick={() => setAllowChannel(!allowChannel)}
                                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                                    allowChannel
                                        ? 'bg-[#1b1d22] border-sky-500/40 text-white'
                                        : 'bg-[#1b1d22]/40 border-white/5 text-white/40'
                                }`}
                            >
                                <span className="text-[13px] font-medium">В Telegram-канале</span>
                                <div className={`w-4 h-4 rounded-md flex items-center justify-center border transition-all ${
                                    allowChannel ? 'bg-sky-500/20 border-sky-500/50 text-sky-300' : 'border-white/20'
                                }`}>
                                    {allowChannel && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Footer buttons */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.08]">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-full text-[14px] text-white/60 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-5 py-2 rounded-full bg-[#292e5e] hover:bg-[#383f7d] border border-[#434771] text-white text-[14px] font-medium transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm flex items-center gap-2"
                        >
                            {saving ? 'Сохранение...' : (item ? 'Сохранить изменения' : 'Добавить материал')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default ContentModal;
