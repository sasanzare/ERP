<?php

use OpenSpout\Common\Entity\Row;
use OpenSpout\Writer\XLSX\Writer;

require dirname(__DIR__).'/vendor/autoload.php';

$filePath = $argv[1] ?? null;
$nonce = $argv[2] ?? null;

if (! is_string($filePath) || $filePath === '' || ! is_string($nonce) || $nonce === '') {
    fwrite(STDERR, "Output path and synthetic fixture suffix are required.\n");
    exit(2);
}

$writer = new Writer;
$writer->openToFile($filePath);
$writer->addRow(Row::fromValues(['party_id', 'party_code', 'display_name', 'roles']));

$rows = [
    ['', '00021-'.$nonce, "P13 طرف معتبر {$nonce}", 'customer|supplier'],
    ['', 'p13-exist-'.$nonce, "P13 طرف تکراری {$nonce}", 'customer'],
    ['', 'P13-INVALID-'.$nonce, "P13 طرف نامعتبر {$nonce}", 'buyer'],
    ['', '00021-'.$nonce, "P13 تکرار فایل {$nonce}", 'supplier'],
    ['', 'P13-OTHER-'.$nonce, "P13 طرف دیگر {$nonce}", 'customer'],
];

foreach ($rows as $row) {
    $writer->addRow(Row::fromValues($row));
}

$writer->close();
