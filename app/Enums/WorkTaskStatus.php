<?php

namespace App\Enums;

enum WorkTaskStatus: string
{
    case Open = 'open';
    case InProgress = 'in_progress';
    case Completed = 'completed';

    public function allows(self $next): bool
    {
        if ($this === $next) {
            return true;
        }

        return match ($this) {
            self::Open => in_array($next, [self::InProgress, self::Completed], true),
            self::InProgress => in_array($next, [self::Open, self::Completed], true),
            self::Completed => $next === self::Open,
        };
    }
}
