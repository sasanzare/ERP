<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class P10Invoice extends Model
{
    protected $table = 'p10_invoices';

    protected $fillable = [
        'organization_id', 'book_id', 'direction', 'party_id', 'sales_order_id', 'purchase_order_id', 'code',
        'effective_on', 'due_on', 'currency_code', 'currency_scale', 'amount_rial', 'status', 'idempotency_key',
        'request_hash', 'posting_key', 'journal_id', 'created_by', 'posted_by', 'posted_at',
    ];

    protected function casts(): array
    {
        return [
            'effective_on' => 'immutable_date',
            'due_on' => 'immutable_date',
            'currency_scale' => 'integer',
            'amount_rial' => 'string',
            'posted_at' => 'immutable_datetime',
        ];
    }

    public function book(): BelongsTo
    {
        return $this->belongsTo(AccountingBook::class, 'book_id');
    }

    public function party(): BelongsTo
    {
        return $this->belongsTo(Party::class, 'party_id');
    }

    public function salesOrder(): BelongsTo
    {
        return $this->belongsTo(SalesOrder::class, 'sales_order_id');
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class, 'purchase_order_id');
    }

    public function journal(): BelongsTo
    {
        return $this->belongsTo(AccountingJournal::class, 'journal_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(P10InvoiceLine::class, 'invoice_id')->orderBy('line_number');
    }

    public function openItem(): HasOne
    {
        return $this->hasOne(P10OpenItem::class, 'invoice_id');
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(P10Allocation::class, 'invoice_id');
    }
}
