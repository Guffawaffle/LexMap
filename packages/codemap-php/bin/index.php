#!/usr/bin/env php
<?php

require_once __DIR__ . '/../vendor/autoload.php';

use Lex\LexMapPHP\PhpIndexer;

$options = getopt('', ['files:', 'base:', 'jsonl']);

if (!isset($options['files']) || !isset($options['base'])) {
    fwrite(STDERR, "Usage: index.php --files <path|@filelist> --base <repo-root> [--jsonl]\n");
    exit(1);
}

$filesArg = $options['files'];
$baseDir = $options['base'];
$jsonl = isset($options['jsonl']);

// Load file list
$files = [];
if (str_starts_with($filesArg, '@')) {
    $listFile = substr($filesArg, 1);
    $files = array_filter(explode("\n", file_get_contents($listFile)));
} else {
    $files = explode("\n", $filesArg);
}

$indexer = new PhpIndexer($baseDir);

foreach ($files as $file) {
    if (empty($file)) continue;

    $result = $indexer->indexFile($file);

    if ($jsonl) {
        echo json_encode($result) . "\n";
    }
}

if (!$jsonl) {
    // Output combined result
    echo json_encode($indexer->getGraph()) . "\n";
}
