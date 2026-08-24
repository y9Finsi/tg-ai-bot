import React, { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Button } from './button.jsx';

export function ConfirmAction({
    title,
    description,
    confirmText,
    onConfirm,
    children,
    variant = 'outline',
    disabled = false,
    size
}) {
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(false);

    async function confirm(event) {
        event.preventDefault();
        setPending(true);
        try {
            const completed = await onConfirm?.();
            if (completed !== false) setOpen(false);
        } finally {
            setPending(false);
        }
    }

    if (disabled) {
        return (
            <Button size={size} variant="outline" disabled aria-disabled="true">
                {children}
            </Button>
        );
    }

    return (
        <AlertDialog.Root
            open={open}
            onOpenChange={nextOpen => {
                if (!pending) setOpen(nextOpen);
            }}
        >
            <AlertDialog.Trigger asChild>
                <Button size={size} variant={variant}>
                    {children}
                </Button>
            </AlertDialog.Trigger>
            <AlertDialog.Portal>
                <AlertDialog.Overlay className="dialog-overlay" />
                <AlertDialog.Content className="dialog-content">
                    <AlertDialog.Title>{title}</AlertDialog.Title>
                    <AlertDialog.Description>{description}</AlertDialog.Description>
                    <div className="dialog-actions">
                        <AlertDialog.Cancel asChild>
                            <Button disabled={pending}>Отмена</Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                            <Button variant="danger" loading={pending} onClick={confirm}>
                                {pending ? 'Выполняю…' : confirmText || 'Подтвердить'}
                            </Button>
                        </AlertDialog.Action>
                    </div>
                </AlertDialog.Content>
            </AlertDialog.Portal>
        </AlertDialog.Root>
    );
}

export default ConfirmAction;
