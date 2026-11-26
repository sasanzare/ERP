<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('work_projects', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->string('title', 200);
            $table->text('description')->nullable();
            $table->unsignedBigInteger('created_by');
            $table->timestamps();

            $table->unique(['organization_id', 'id'], 'work_projects_org_id_unique');
            $table->index(['organization_id', 'title', 'id'], 'work_projects_search_index');
            $table->foreign('organization_id')->references('id')->on('organizations')->restrictOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->restrictOnDelete();
        });

        Schema::create('work_tasks', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('project_id');
            $table->string('title', 200);
            $table->string('status', 24)->default('open');
            $table->date('due_on')->nullable();
            $table->unsignedBigInteger('assignee_user_id')->nullable();
            $table->unsignedInteger('assignment_version')->default(0);
            $table->unsignedBigInteger('completed_by')->nullable();
            $table->dateTime('completed_at')->nullable();
            $table->unsignedBigInteger('created_by');
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'id'], 'work_tasks_org_id_unique');
            $table->unique(['organization_id', 'project_id', 'id'], 'work_tasks_project_id_unique');
            $table->index(['organization_id', 'project_id', 'status', 'id'], 'work_tasks_project_status_index');
            $table->index(['organization_id', 'assignee_user_id', 'status', 'due_on'], 'work_tasks_assignee_inbox_index');
            $table->foreign(['organization_id', 'project_id'], 'work_tasks_project_fk')
                ->references(['organization_id', 'id'])->on('work_projects')->restrictOnDelete();
            $table->foreign('assignee_user_id')->references('id')->on('users')->restrictOnDelete();
            $table->foreign('completed_by')->references('id')->on('users')->restrictOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->restrictOnDelete();
            $table->foreign('updated_by')->references('id')->on('users')->restrictOnDelete();
        });

        Schema::create('work_comments', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('project_id');
            $table->unsignedBigInteger('task_id')->nullable();
            $table->unsignedBigInteger('author_id');
            $table->text('body');
            $table->timestamps();

            $table->index(['organization_id', 'project_id', 'id'], 'work_comments_project_index');
            $table->index(['organization_id', 'task_id', 'id'], 'work_comments_task_index');
            $table->foreign(['organization_id', 'project_id'], 'work_comments_project_fk')
                ->references(['organization_id', 'id'])->on('work_projects')->restrictOnDelete();
            $table->foreign(['organization_id', 'project_id', 'task_id'], 'work_comments_task_fk')
                ->references(['organization_id', 'project_id', 'id'])->on('work_tasks')->restrictOnDelete();
            $table->foreign('author_id')->references('id')->on('users')->restrictOnDelete();
        });

        Schema::create('work_task_reminders', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('task_id');
            $table->unsignedBigInteger('recipient_user_id');
            $table->unsignedInteger('assignment_version');
            $table->string('reminder_type', 24)->default('due');
            $table->char('identity', 64)->unique('work_task_reminders_identity_unique');
            $table->date('due_on_snapshot');
            $table->dateTime('delivered_at');
            $table->timestamps();

            $table->unique(
                ['organization_id', 'task_id', 'assignment_version', 'recipient_user_id', 'reminder_type', 'due_on_snapshot'],
                'work_task_reminders_once_unique',
            );
            $table->index(['organization_id', 'recipient_user_id', 'delivered_at'], 'work_task_reminders_inbox_index');
            $table->foreign(['organization_id', 'task_id'], 'work_task_reminders_task_fk')
                ->references(['organization_id', 'id'])->on('work_tasks')->restrictOnDelete();
            $table->foreign('recipient_user_id')->references('id')->on('users')->restrictOnDelete();
        });

        Schema::create('project_purchase_costs', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('organization_id');
            $table->unsignedBigInteger('project_id');
            $table->unsignedBigInteger('purchase_order_id');
            $table->unsignedBigInteger('purchase_order_line_id');
            $table->unsignedBigInteger('amount_rial');
            $table->string('purchase_order_code_snapshot', 40);
            $table->string('supplier_name_snapshot', 255);
            $table->string('product_code_snapshot', 64);
            $table->string('product_name_snapshot', 255);
            $table->string('unit_name_snapshot', 120);
            $table->string('unit_symbol_snapshot', 32);
            $table->unsignedBigInteger('linked_by');
            $table->dateTime('linked_at');
            $table->timestamps();

            $table->unique(['organization_id', 'id'], 'project_purchase_costs_org_id_unique');
            $table->unique(['organization_id', 'purchase_order_line_id'], 'project_purchase_costs_line_unique');
            $table->index(['organization_id', 'project_id', 'id'], 'project_purchase_costs_project_index');
            $table->foreign(['organization_id', 'project_id'], 'project_purchase_costs_project_fk')
                ->references(['organization_id', 'id'])->on('work_projects')->restrictOnDelete();
            $table->foreign(['organization_id', 'purchase_order_id'], 'project_purchase_costs_order_fk')
                ->references(['organization_id', 'id'])->on('purchase_orders')->restrictOnDelete();
            $table->foreign(['organization_id', 'purchase_order_line_id'], 'project_purchase_costs_line_fk')
                ->references(['organization_id', 'id'])->on('purchase_order_lines')->restrictOnDelete();
            $table->foreign('linked_by')->references('id')->on('users')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('project_purchase_costs');
        Schema::dropIfExists('work_task_reminders');
        Schema::dropIfExists('work_comments');
        Schema::dropIfExists('work_tasks');
        Schema::dropIfExists('work_projects');
    }
};
