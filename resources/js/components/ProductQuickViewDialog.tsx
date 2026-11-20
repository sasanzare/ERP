import { useEffect, useRef, type RefObject } from 'react';
import type { Product } from '../api/products';
import { LiquidGlass } from '../liquid-glass/LiquidGlass.jsx';

interface ProductQuickViewDialogProps {
    product: Product | null;
    returnFocusRef: RefObject<HTMLButtonElement | null>;
    onClose: () => void;
    forceFallback: boolean;
    detailHref: string;
}

export function ProductQuickViewDialog({
    product,
    returnFocusRef,
    onClose,
    forceFallback,
    detailHref,
}: ProductQuickViewDialogProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog || !product) return undefined;

        if (!dialog.open) dialog.showModal();
        window.requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));

        return () => {
            if (dialog.open) dialog.close();
            window.requestAnimationFrame(() => returnFocusRef.current?.focus({ preventScroll: true }));
        };
    }, [product, returnFocusRef]);

    if (!product) return null;

    return (
        <LiquidGlass
            as="dialog"
            ref={dialogRef}
            className="quick-view-dialog"
            variant="regular"
            radius={24}
            profile="soft"
            strength={110}
            magnify={1.06}
            dispersion={0.009}
            blur={0.3}
            adaptive={{ throttleMs: 180, brightTintAlpha: 0.72 }}
            forceFallback={forceFallback}
            aria-labelledby="quick-view-title"
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className="quick-view-content">
                <header className="dialog-heading">
                    <div>
                        <p className="eyebrow">نمایش سریع کالا</p>
                        <h2 id="quick-view-title">{product.name}</h2>
                    </div>
                    <button
                        ref={closeButtonRef}
                        className="dialog-close-control"
                        type="button"
                        aria-label="بستن نمایش سریع"
                        onClick={onClose}
                    >
                        <span aria-hidden="true">×</span>
                    </button>
                </header>
                <p className="dialog-description">اطلاعات ثبت‌شده در فهرست کالاها</p>
                <dl className="quick-view-fields">
                    <div className="detail-field">
                        <dt>نام کالا</dt>
                        <dd>{product.name}</dd>
                    </div>
                    <div className="detail-field">
                        <dt>کد کالا</dt>
                        <dd><bdi dir="ltr">{product.code}</bdi></dd>
                    </div>
                    <div className="detail-field">
                        <dt>شناسه</dt>
                        <dd><bdi dir="ltr">{product.id}</bdi></dd>
                    </div>
                </dl>
                <div className="dialog-actions">
                    <a className="text-link" href={detailHref}>رفتن به صفحهٔ جزئیات</a>
                    <button className="dialog-dismiss-button" type="button" onClick={onClose}>
                        بستن
                    </button>
                </div>
            </div>
        </LiquidGlass>
    );
}
