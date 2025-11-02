# PHP Indexer

Extracts symbols, calls, and module dependencies from PHP files using `nikic/php-parser`.

## Usage

### CLI

```bash
php bin/index.php --files file1.php,file2.php --base /repo/root --jsonl
```

Or with a file list:

```bash
php bin/index.php --files @filelist.txt --base /repo/root --jsonl
```

### Programmatic

```php
<?php

use Lex\LexMapPHP\PhpIndexer;

$indexer = new PhpIndexer('/repo/root');
$result = $indexer->indexFile('src/MyClass.php');

print_r($result['symbols']);
print_r($result['calls']);
```

## Output Schema

### Symbols
```php
[
  'id' => 'path/to/file.php:ClassName',
  'fqname' => 'ClassName',
  'kind' => 'class', // or 'method', 'function'
  'file' => 'path/to/file.php',
  'span' => ['start' => 100, 'end' => 500],
  'visibility' => 'public', // or 'private', 'protected'
  'modifiers' => ['static', 'final']
]
```

### Calls
```php
[
  'from' => 'file.php:ClassName::method',
  'to' => 'file.php:OtherClass::otherMethod',
  'site' => ['file' => 'file.php', 'line' => 42, 'col' => 0],
  'kind' => 'direct',
  'confidence' => 1.0
]
```

## Heuristics

The indexer applies these heuristics in order:

1. **Static calls** - Full confidence (1.0)
2. **$this->method()** - High confidence (0.95)
3. **Known type hints** - High confidence (0.95)
4. **Container patterns** - Configurable via policy

## Install

```bash
composer install
```
