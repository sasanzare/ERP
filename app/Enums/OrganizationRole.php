<?php

namespace App\Enums;

enum OrganizationRole: string
{
    case Reader = 'reader';
    case Editor = 'editor';
}
