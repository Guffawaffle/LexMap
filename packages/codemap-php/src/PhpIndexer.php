<?php

namespace Lex\LexMapPHP;

use PhpParser\Error;
use PhpParser\NodeTraverser;
use PhpParser\NodeVisitor;
use PhpParser\ParserFactory;
use PhpParser\Node;

class PhpIndexer
{
    private string $baseDir;
    private array $symbols = [];
    private array $calls = [];
    private array $modules = [];

    public function __construct(string $baseDir)
    {
        $this->baseDir = $baseDir;
    }

    public function indexFile(string $filePath): array
    {
        $parser = (new ParserFactory())->createForNewestSupportedVersion();

        try {
            $code = file_get_contents($filePath);
            $ast = $parser->parse($code);

            $visitor = new IndexerVisitor($filePath, $this->baseDir);
            $traverser = new NodeTraverser();
            $traverser->addVisitor($visitor);
            $traverser->traverse($ast);

            $fileResult = $visitor->getResult();

            // Merge into global graph
            $this->symbols = array_merge($this->symbols, $fileResult['symbols']);
            $this->calls = array_merge($this->calls, $fileResult['calls']);
            $this->modules = array_merge($this->modules, $fileResult['modules']);

            return $fileResult;

        } catch (Error $e) {
            fwrite(STDERR, "Parse error in $filePath: {$e->getMessage()}\n");
            return ['symbols' => [], 'calls' => [], 'modules' => []];
        }
    }

    public function getGraph(): array
    {
        return [
            'symbols' => $this->symbols,
            'calls' => $this->calls,
            'modules' => $this->modules
        ];
    }
}

class IndexerVisitor extends NodeVisitor\NodeVisitorAbstract
{
    private string $filePath;
    private string $baseDir;
    private array $symbols = [];
    private array $calls = [];
    private array $modules = [];
    private ?string $currentClass = null;
    private ?string $currentFunction = null;

    public function __construct(string $filePath, string $baseDir)
    {
        $this->filePath = $filePath;
        $this->baseDir = $baseDir;
    }

    public function enterNode(Node $node)
    {
        // Extract classes
        if ($node instanceof Node\Stmt\Class_) {
            $className = $node->name?->toString();
            if ($className) {
                $this->currentClass = $className;

                $this->symbols[] = [
                    'id' => "{$this->filePath}:{$className}",
                    'fqname' => $className,
                    'kind' => 'class',
                    'file' => $this->filePath,
                    'span' => [
                        'start' => $node->getStartFilePos(),
                        'end' => $node->getEndFilePos()
                    ],
                    'visibility' => $node->isPublic() ? 'public' : 'private',
                    'modifiers' => $this->getModifiers($node)
                ];
            }
        }

        // Extract methods
        if ($node instanceof Node\Stmt\ClassMethod) {
            $methodName = $node->name->toString();
            $fqname = $this->currentClass ? "{$this->currentClass}::{$methodName}" : $methodName;

            $this->symbols[] = [
                'id' => "{$this->filePath}:{$fqname}",
                'fqname' => $fqname,
                'kind' => 'method',
                'file' => $this->filePath,
                'span' => [
                    'start' => $node->getStartFilePos(),
                    'end' => $node->getEndFilePos()
                ],
                'visibility' => $this->getVisibility($node),
                'modifiers' => $this->getModifiers($node)
            ];

            $this->currentFunction = $fqname;
        }

        // Extract functions
        if ($node instanceof Node\Stmt\Function_) {
            $funcName = $node->name->toString();

            $this->symbols[] = [
                'id' => "{$this->filePath}:{$funcName}",
                'fqname' => $funcName,
                'kind' => 'function',
                'file' => $this->filePath,
                'span' => [
                    'start' => $node->getStartFilePos(),
                    'end' => $node->getEndFilePos()
                ],
                'visibility' => 'public',
                'modifiers' => []
            ];

            $this->currentFunction = $funcName;
        }

        // Extract static calls (direct)
        if ($node instanceof Node\Expr\StaticCall) {
            $this->extractStaticCall($node);
        }

        // Extract method calls (direct only when class is known)
        if ($node instanceof Node\Expr\MethodCall) {
            $this->extractMethodCall($node);
        }

        // Extract function calls
        if ($node instanceof Node\Expr\FuncCall) {
            $this->extractFuncCall($node);
        }

        return null;
    }

    public function leaveNode(Node $node)
    {
        if ($node instanceof Node\Stmt\Class_) {
            $this->currentClass = null;
        }

        if ($node instanceof Node\Stmt\ClassMethod || $node instanceof Node\Stmt\Function_) {
            $this->currentFunction = null;
        }

        return null;
    }

    private function extractStaticCall(Node\Expr\StaticCall $node): void
    {
        if (!$this->currentFunction) return;

        $className = null;
        if ($node->class instanceof Node\Name) {
            $className = $node->class->toString();
        }

        if (!$className) return;

        $methodName = null;
        if ($node->name instanceof Node\Identifier) {
            $methodName = $node->name->toString();
        }

        if (!$methodName) return;

        $this->calls[] = [
            'from' => "{$this->filePath}:{$this->currentFunction}",
            'to' => "{$this->filePath}:{$className}::{$methodName}",
            'site' => [
                'file' => $this->filePath,
                'line' => $node->getStartLine(),
                'col' => 0
            ],
            'kind' => 'direct',
            'confidence' => 1.0
        ];
    }

    private function extractMethodCall(Node\Expr\MethodCall $node): void
    {
        if (!$this->currentFunction) return;

        // Only extract if we can determine the type statically
        // For simplicity, skip dynamic calls here

        $methodName = null;
        if ($node->name instanceof Node\Identifier) {
            $methodName = $node->name->toString();
        }

        if (!$methodName) return;

        // Simple heuristic: if $this->method(), we can resolve it
        if ($node->var instanceof Node\Expr\Variable &&
            $node->var->name === 'this' &&
            $this->currentClass) {

            $this->calls[] = [
                'from' => "{$this->filePath}:{$this->currentFunction}",
                'to' => "{$this->filePath}:{$this->currentClass}::{$methodName}",
                'site' => [
                    'file' => $this->filePath,
                    'line' => $node->getStartLine(),
                    'col' => 0
                ],
                'kind' => 'direct',
                'confidence' => 0.95
            ];
        }
    }

    private function extractFuncCall(Node\Expr\FuncCall $node): void
    {
        if (!$this->currentFunction) return;

        $funcName = null;
        if ($node->name instanceof Node\Name) {
            $funcName = $node->name->toString();
        }

        if (!$funcName) return;

        $this->calls[] = [
            'from' => "{$this->filePath}:{$this->currentFunction}",
            'to' => $funcName,
            'site' => [
                'file' => $this->filePath,
                'line' => $node->getStartLine(),
                'col' => 0
            ],
            'kind' => 'direct',
            'confidence' => 1.0
        ];
    }

    private function getVisibility(Node\Stmt\ClassMethod $node): string
    {
        if ($node->isPublic()) return 'public';
        if ($node->isProtected()) return 'protected';
        if ($node->isPrivate()) return 'private';
        return 'public';
    }

    private function getModifiers($node): array
    {
        $modifiers = [];

        if (method_exists($node, 'isStatic') && $node->isStatic()) {
            $modifiers[] = 'static';
        }
        if (method_exists($node, 'isAbstract') && $node->isAbstract()) {
            $modifiers[] = 'abstract';
        }
        if (method_exists($node, 'isFinal') && $node->isFinal()) {
            $modifiers[] = 'final';
        }

        return $modifiers;
    }

    public function getResult(): array
    {
        return [
            'symbols' => $this->symbols,
            'calls' => $this->calls,
            'modules' => $this->modules
        ];
    }
}
