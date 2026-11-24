<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class P10AccountingProfile extends Model
{
    protected $table = 'p10_accounting_profiles';

    protected $fillable = [
        'organization_id', 'book_id', 'status', 'customer_receivable_account_id', 'customer_revenue_account_id',
        'supplier_payable_account_id', 'supplier_debit_account_id', 'customer_treasury_account_id',
        'supplier_treasury_account_id', 'approval_reference', 'approved_by', 'approved_at',
    ];

    protected function casts(): array
    {
        return ['approved_at' => 'immutable_datetime'];
    }

    public function book(): BelongsTo
    {
        return $this->belongsTo(AccountingBook::class, 'book_id');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
