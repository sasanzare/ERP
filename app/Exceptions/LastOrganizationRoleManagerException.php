<?php

namespace App\Exceptions;

use RuntimeException;

class LastOrganizationRoleManagerException extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('The last role manager for an organization cannot be removed.');
    }
}
